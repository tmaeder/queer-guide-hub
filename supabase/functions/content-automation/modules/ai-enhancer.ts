/**
 * AI Enhancer — AI-powered description improvement using OpenAI.
 *
 * Uses gpt-4o-mini to rewrite thin descriptions and fill missing fields.
 * Auto-approve threshold is 1.01 (never auto-approves) — all changes go to review.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'
import {
  getContentName, delay, CONTENT_TYPE_CONFIG,
  type ModuleConfig, type SharedRefs, type ProposedChange, type AutomationRule,
} from '../../_shared/automation-utils.ts'

// ── AI call helper ──────────────────────────────────────────────────────────

async function callAI(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: maxTokens,
      store: false,
    }),
  })

  if (!response.ok) {
    if (response.status === 429) throw new Error('RATE_LIMIT')
    throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  return data.choices[0].message.content
}

// ── Enhancement prompts ─────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a content editor for queer.guide, an LGBTQ+ travel and community platform.
Your job is to improve content descriptions to be informative, inclusive, and engaging.
Always maintain a respectful, positive tone. Use inclusive language.
Never add speculation or unverified claims. Stick to facts from the provided context.
Return ONLY the improved text, no explanations or markdown formatting.`

function buildEnhancementPrompt(
  item: Record<string, unknown>,
  contentType: string,
  fieldName: string,
  ruleConfig: Record<string, unknown>,
): string | null {
  const currentValue = item[fieldName] as string | null
  const name = item.name || item.title || 'Unknown'
  const enhancementType = ruleConfig.type as string || 'improve'

  if (enhancementType === 'improve' && currentValue?.trim()) {
    if (currentValue.length < 50) {
      return `Expand this brief ${contentType.replace('_', ' ')} description into 2-3 informative sentences.

Name: ${name}
Current description: "${currentValue}"
${item.category ? `Category: ${item.category}` : ''}
${item.city ? `City: ${item.city}` : ''}
${item.country ? `Country: ${item.country}` : ''}

Write a clear, informative description (50-200 characters).`
    }

    return `Improve this ${contentType.replace('_', ' ')} description for clarity and readability. Fix any grammar or style issues. Keep the same meaning and length.

Name: ${name}
Current description: "${currentValue}"

Return the improved version only.`
  }

  if (enhancementType === 'generate' && !currentValue?.trim()) {
    const context = Object.entries(item)
      .filter(([k, v]) => v && typeof v === 'string' && k !== 'id' && k !== fieldName)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n')

    if (!context) return null

    return `Write a brief, informative description (50-200 characters) for this ${contentType.replace('_', ' ')}.

Available information:
${context}

Write a factual description based only on the provided information.`
  }

  return null
}

// ── Process item ────────────────────────────────────────────────────────────

async function processItem(
  item: Record<string, unknown>,
  contentType: string,
  contentName: string,
  rules: AutomationRule[],
  apiKey: string,
  model: string,
  maxTokens: number,
): Promise<ProposedChange[]> {
  const changes: ProposedChange[] = []
  const contentId = String(item.id)

  for (const rule of rules) {
    if (rule.content_type !== contentType) continue
    if (rule.rule_type !== 'ai_enhance') continue

    const prompt = buildEnhancementPrompt(item, contentType, rule.field_name, rule.rule_config)
    if (!prompt) continue

    try {
      const enhanced = await callAI(apiKey, model, SYSTEM_PROMPT, prompt, maxTokens)
      if (!enhanced?.trim()) continue

      const cleaned = enhanced.trim()
        .replace(/^["']|["']$/g, '')
        .replace(/^Description:\s*/i, '')

      const oldValue = (item[rule.field_name] as string | null) ?? null

      // Don't propose if result is essentially the same
      if (oldValue && cleaned.toLowerCase().trim() === oldValue.toLowerCase().trim()) continue

      changes.push({
        content_type: contentType,
        content_id: contentId,
        content_name: contentName,
        field_name: rule.field_name,
        old_value: oldValue,
        new_value: cleaned,
        change_type: 'ai_enhance',
        confidence: 0.75,
        reasoning: oldValue
          ? `AI-improved description (${oldValue.length} → ${cleaned.length} chars)`
          : `AI-generated description (${cleaned.length} chars) from available metadata`,
        rule_id: rule.id,
      })
    } catch (e) {
      if ((e as Error).message === 'RATE_LIMIT') {
        console.log('[ai-enhancer] Rate limit hit, waiting 60s...')
        await delay(60_000)
      } else {
        console.error(`[ai-enhancer] AI error for ${contentName}/${rule.field_name}: ${e}`)
      }
    }
  }

  return changes
}

// ── Main processor ──────────────────────────────────────────────────────────

export async function processAiEnhancer(
  supabase: SupabaseClient,
  config: ModuleConfig,
  _refs: SharedRefs,
  opts: { dryRun: boolean; contentType?: string; contentId?: string; offset?: number },
): Promise<{ scanned: number; changes: ProposedChange[]; errors: number }> {
  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) {
    console.error('[ai-enhancer] OPENAI_API_KEY not configured')
    return { scanned: 0, changes: [], errors: 1 }
  }

  const moduleConfig = config.module.config as { model?: string; max_tokens?: number }
  const model = moduleConfig.model ?? 'gpt-4o-mini'
  const maxTokens = moduleConfig.max_tokens ?? 500

  const allChanges: ProposedChange[] = []
  let totalScanned = 0, totalErrors = 0

  const contentTypes = opts.contentType
    ? config.module.content_types.filter(ct => ct === opts.contentType)
    : config.module.content_types

  for (const contentType of contentTypes) {
    const ctConfig = CONTENT_TYPE_CONFIG[contentType]
    if (!ctConfig) continue

    const rulesForType = config.rules.filter(r => r.content_type === contentType)
    if (rulesForType.length === 0) continue

    const offset = opts.offset ?? 0
    const { data: items, error: fetchErr } = await supabase
      .from(ctConfig.table)
      .select(ctConfig.selectFields)
      .range(offset, offset + config.module.batch_size - 1)

    if (fetchErr) {
      console.error(`[ai-enhancer] Error fetching ${contentType}: ${fetchErr.message}`)
      totalErrors++
      continue
    }

    // Filter to items that actually need enhancement
    const needsWork = (items || []).filter(item => {
      const rec = item as Record<string, unknown>
      return rulesForType.some(rule => {
        const val = rec[rule.field_name] as string | null
        const enhType = (rule.rule_config as { type?: string }).type
        if (enhType === 'generate') return !val?.trim()
        if (enhType === 'improve') return val && val.trim().length < 50
        return false
      })
    })

    for (const item of needsWork) {
      totalScanned++
      try {
        const name = getContentName(item as Record<string, unknown>, ctConfig)
        const itemChanges = await processItem(
          item as Record<string, unknown>,
          contentType, name, rulesForType,
          apiKey, model, maxTokens,
        )
        allChanges.push(...itemChanges)

        // Rate limit: 500ms between AI calls
        if (totalScanned < needsWork.length) await delay(500)
      } catch (e) {
        console.error(`[ai-enhancer] Error processing ${contentType}/${(item as Record<string, unknown>).id}: ${e}`)
        totalErrors++
      }
    }
  }

  return { scanned: totalScanned, changes: allChanges, errors: totalErrors }
}
