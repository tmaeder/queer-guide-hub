/**
 * automation-ai-enhancer — AI-powered description improvement.
 *
 * Uses OpenAI gpt-4o-mini to rewrite thin descriptions, fill missing fields,
 * and clean up legacy text. Auto-approve threshold is 1.01 (never auto-approves)
 * so ALL changes go to the admin review queue.
 */

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'
import { corsHeaders, jsonResponse, errorResponse } from '../_shared/supabase-client.ts'
import { chatCompletion } from '../_shared/openai-client.ts'
import {
  loadModuleConfig, checkRateLimit, writeChanges, logRun, delay,
  getContentName, CONTENT_TYPE_CONFIG,
  type ProposedChange, type AutomationRule,
} from '../_shared/automation-utils.ts'

const MODULE_SLUG = 'ai-enhancer'

// ── AI call helper ──────────────────────────────────────────────────────────

async function callAI(
  supabase: SupabaseClient,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
): Promise<string> {
  try {
    const result = await chatCompletion(supabase, {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: maxTokens,
    })
    return result.content
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('429')) throw new Error('RATE_LIMIT')
    throw err
  }
}

// ── Enhancement prompts per rule type ───────────────────────────────────────

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
    // Improve existing description
    if (currentValue.length < 50) {
      return `Expand this brief ${contentType.replace('_', ' ')} description into 2-3 informative sentences.

Name: ${name}
Current description: "${currentValue}"
${item.category ? `Category: ${item.category}` : ''}
${item.city ? `City: ${item.city}` : ''}
${item.country ? `Country: ${item.country}` : ''}

Write a clear, informative description (50-200 characters).`
    }

    // Clean up existing text (fix grammar, improve readability)
    return `Improve this ${contentType.replace('_', ' ')} description for clarity and readability. Fix any grammar or style issues. Keep the same meaning and length.

Name: ${name}
Current description: "${currentValue}"

Return the improved version only.`
  }

  if (enhancementType === 'generate' && !currentValue?.trim()) {
    // Generate missing description from other fields
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

// ── Process items ───────────────────────────────────────────────────────────

async function processItem(
  item: Record<string, unknown>,
  contentType: string,
  contentName: string,
  rules: AutomationRule[],
  supabase: SupabaseClient,
  model: string,
  maxTokens: number,
): Promise<ProposedChange[]> {
  const changes: ProposedChange[] = []
  const contentId = String(item.id)

  for (const rule of rules) {
    if (rule.content_type !== contentType) continue
    if (rule.rule_type !== 'ai_enhance') continue

    const prompt = buildEnhancementPrompt(
      item,
      contentType,
      rule.field_name,
      rule.rule_config,
    )

    if (!prompt) continue

    try {
      const enhanced = await callAI(supabase, model, SYSTEM_PROMPT, prompt, maxTokens)

      if (!enhanced?.trim()) continue

      const cleaned = enhanced.trim()
        .replace(/^["']|["']$/g, '') // Remove wrapping quotes
        .replace(/^Description:\s*/i, '') // Remove "Description:" prefix

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
        confidence: 0.75, // AI changes always need review
        reasoning: oldValue
          ? `AI-improved description (${oldValue.length} → ${cleaned.length} chars)`
          : `AI-generated description (${cleaned.length} chars) from available metadata`,
        rule_id: rule.id,
      })
    } catch (e) {
      if ((e as Error).message === 'RATE_LIMIT') {
        console.log(`[${MODULE_SLUG}] Rate limit hit, waiting 60s...`)
        await delay(60_000)
        // Don't retry — just skip this item
      } else {
        console.error(`[${MODULE_SLUG}] AI error for ${contentName}/${rule.field_name}: ${e}`)
      }
    }
  }

  return changes
}

// ── Main handler ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const startTime = Date.now()
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    let payload: Record<string, unknown> = {}
    if (req.method === 'POST') {
      payload = await req.json().catch(() => ({}))
    }

    const config = await loadModuleConfig(supabase, MODULE_SLUG)
    if (!config) return errorResponse('Module disabled or not found', 404)

    const withinLimit = await checkRateLimit(supabase, config.module.id, config.module.rate_limit_per_hour)
    if (!withinLimit) return jsonResponse({ success: false, error: 'Rate limit exceeded' }, 429)

    const moduleConfig = config.module.config as { model?: string; max_tokens?: number }
    const model = moduleConfig.model ?? 'gpt-4o-mini'
    const maxTokens = moduleConfig.max_tokens ?? 500

    const batchId = crypto.randomUUID()
    const workflowRunId = payload.workflow_run_id as string | null ?? null
    const dryRun = payload.dry_run === true
    const allChanges: ProposedChange[] = []
    let totalScanned = 0
    let totalErrors = 0

    for (const contentType of config.module.content_types) {
      const ctConfig = CONTENT_TYPE_CONFIG[contentType]
      if (!ctConfig) continue

      const rulesForType = config.rules.filter(r => r.content_type === contentType)
      if (rulesForType.length === 0) continue

      // Fetch items — prioritize those with thin/missing descriptions
      const { data: items, error: fetchErr } = await supabase
        .from(ctConfig.table)
        .select(ctConfig.selectFields)
        .limit(config.module.batch_size)

      if (fetchErr) {
        console.error(`[${MODULE_SLUG}] Error fetching ${contentType}: ${fetchErr.message}`)
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
            supabase, model, maxTokens,
          )
          allChanges.push(...itemChanges)

          // Rate limit: 500ms between AI calls
          if (totalScanned < needsWork.length) await delay(500)
        } catch (e) {
          console.error(`[${MODULE_SLUG}] Error processing ${contentType}/${(item as Record<string, unknown>).id}: ${e}`)
          totalErrors++
        }
      }
    }

    let autoApproved = 0
    let pendingReview = 0

    if (!dryRun && allChanges.length > 0) {
      const result = await writeChanges(supabase, config.module, workflowRunId, batchId, allChanges)
      autoApproved = result.autoApproved
      pendingReview = result.pendingReview
    }

    const durationMs = Date.now() - startTime

    if (!dryRun) {
      await logRun(supabase, config.module.id, workflowRunId, {
        items_scanned: totalScanned,
        changes_proposed: allChanges.length,
        changes_auto_approved: autoApproved,
        changes_pending_review: pendingReview,
        errors: totalErrors,
        duration_ms: durationMs,
      })
    }

    console.log(`[${MODULE_SLUG}] Done: scanned=${totalScanned} changes=${allChanges.length} auto=${autoApproved} pending=${pendingReview} ${durationMs}ms`)
    return jsonResponse({
      success: true,
      items_total: totalScanned,
      items_processed: totalScanned - totalErrors,
      items_succeeded: totalScanned - totalErrors,
      items_failed: totalErrors,
      changes_proposed: allChanges.length,
      changes_auto_approved: autoApproved,
      changes_pending_review: pendingReview,
      duration_ms: durationMs,
      batch_id: batchId,
      ...(dryRun ? { dry_run: true } : {}),
    })
  } catch (e) {
    console.error(`[${MODULE_SLUG}] Fatal: ${e}`)
    return errorResponse(e instanceof Error ? e.message : 'Internal error', 500)
  }
})
