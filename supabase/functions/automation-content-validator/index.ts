/**
 * automation-content-validator — Validates content completeness, format, and quality.
 *
 * Checks: required fields, min-length descriptions, encoding issues (mojibake,
 * HTML entities), placeholder text detection, whitespace normalization.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'
import { corsHeaders, jsonResponse, errorResponse } from '../_shared/supabase-client.ts'
import {
  loadModuleConfig, checkRateLimit, writeChanges, logRun, delay,
  getContentName, CONTENT_TYPE_CONFIG,
  type ProposedChange, type AutomationRule,
} from '../_shared/automation-utils.ts'

const MODULE_SLUG = 'content-validator'

// ── Rule processors ─────────────────────────────────────────────────────────────

const HTML_ENTITY_RE = /&(?:amp|lt|gt|quot|apos|#\d{2,4}|#x[0-9a-fA-F]{2,4});/g
const PLACEHOLDER_RE = /(?:lorem ipsum|todo|tbd|placeholder|coming soon|test content|sample text|insert .* here)/i
const MOJIBAKE_RE = /[\u00C3][\u0080-\u00BF]|\u00C3[\u0080-\u00BF]|\u00E2\u0080[\u0099\u201C\u201D\u007C\u02DC\u0153\u009C\u009D]/

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
}

function cleanWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function processItem(
  item: Record<string, unknown>,
  contentType: string,
  contentName: string,
  rules: AutomationRule[],
): ProposedChange[] {
  const changes: ProposedChange[] = []
  const contentId = String(item.id)

  for (const rule of rules) {
    if (rule.content_type !== contentType) continue
    const value = item[rule.field_name]
    const strValue = value != null ? String(value) : ''

    switch (rule.rule_type) {
      case 'required': {
        if (!strValue.trim()) {
          changes.push({
            content_type: contentType,
            content_id: contentId,
            content_name: contentName,
            field_name: rule.field_name,
            old_value: value ?? null,
            new_value: value ?? null,
            change_type: 'flag',
            confidence: 1.0,
            reasoning: `${rule.field_name} is empty or missing`,
            rule_id: rule.id,
          })
        }
        break
      }

      case 'length': {
        const minLen = (rule.rule_config as { min?: number }).min ?? 0
        if (strValue.trim() && strValue.trim().length < minLen) {
          changes.push({
            content_type: contentType,
            content_id: contentId,
            content_name: contentName,
            field_name: rule.field_name,
            old_value: strValue,
            new_value: strValue,
            change_type: 'flag',
            confidence: 0.80,
            reasoning: `${rule.field_name} is only ${strValue.trim().length} chars (min: ${minLen})`,
            rule_id: rule.id,
          })
        }
        break
      }

      case 'sanitize': {
        const fix = (rule.rule_config as { fix?: string }).fix
        if (!strValue.trim()) break

        if (fix === 'html_entities' && HTML_ENTITY_RE.test(strValue)) {
          const cleaned = decodeHtmlEntities(strValue)
          if (cleaned !== strValue) {
            changes.push({
              content_type: contentType,
              content_id: contentId,
              content_name: contentName,
              field_name: rule.field_name,
              old_value: strValue,
              new_value: cleaned,
              change_type: 'sanitize',
              confidence: 0.98,
              reasoning: 'Decoded HTML entities in plain text field',
              rule_id: rule.id,
            })
          }
        }

        if (fix === 'encoding' && MOJIBAKE_RE.test(strValue)) {
          changes.push({
            content_type: contentType,
            content_id: contentId,
            content_name: contentName,
            field_name: rule.field_name,
            old_value: strValue,
            new_value: strValue,
            change_type: 'flag',
            confidence: 0.90,
            reasoning: 'Detected potential mojibake/double-encoding',
            rule_id: rule.id,
          })
        }
        break
      }

      case 'regex': {
        const cfg = rule.rule_config as { pattern?: string; flag?: boolean }
        if (!strValue.trim() || !cfg.pattern) break
        const re = new RegExp(cfg.pattern, 'i')
        if (re.test(strValue)) {
          changes.push({
            content_type: contentType,
            content_id: contentId,
            content_name: contentName,
            field_name: rule.field_name,
            old_value: strValue,
            new_value: strValue,
            change_type: cfg.flag ? 'flag' : 'sanitize',
            confidence: 0.85,
            reasoning: `Matched pattern: ${cfg.pattern}`,
            rule_id: rule.id,
          })
        }
        break
      }

      case 'normalize': {
        const fix = (rule.rule_config as { fix?: string }).fix
        if (!strValue.trim()) break

        if (fix === 'trim' || fix === 'whitespace') {
          const cleaned = cleanWhitespace(strValue)
          if (cleaned !== strValue) {
            changes.push({
              content_type: contentType,
              content_id: contentId,
              content_name: contentName,
              field_name: rule.field_name,
              old_value: strValue,
              new_value: cleaned,
              change_type: 'normalize',
              confidence: 0.99,
              reasoning: 'Cleaned excessive whitespace',
              rule_id: rule.id,
            })
          }
        }
        break
      }
    }
  }

  return changes
}

// ── Main handler ────────────────────────────────────────────────────────────────

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

    const batchId = crypto.randomUUID()
    const workflowRunId = payload.workflow_run_id as string | null ?? null
    const dryRun = payload.dry_run === true
    const allChanges: ProposedChange[] = []
    let totalScanned = 0
    let totalErrors = 0

    // Process each content type the module covers
    for (const contentType of config.module.content_types) {
      const ctConfig = CONTENT_TYPE_CONFIG[contentType]
      if (!ctConfig) continue

      const rulesForType = config.rules.filter(r => r.content_type === contentType)
      if (rulesForType.length === 0) continue

      const { data: items, error: fetchErr } = await supabase
        .from(ctConfig.table)
        .select(ctConfig.selectFields)
        .limit(config.module.batch_size)

      if (fetchErr) {
        console.error(`[${MODULE_SLUG}] Error fetching ${contentType}: ${fetchErr.message}`)
        totalErrors++
        continue
      }

      for (const item of items || []) {
        totalScanned++
        try {
          const name = getContentName(item as Record<string, unknown>, ctConfig)
          const itemChanges = processItem(item as Record<string, unknown>, contentType, name, rulesForType)
          allChanges.push(...itemChanges)
        } catch (e) {
          console.error(`[${MODULE_SLUG}] Error processing ${contentType}/${item.id}: ${e}`)
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

    const response: Record<string, unknown> = {
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
    }

    if (dryRun) {
      response.dry_run = true
      response.changes = allChanges.map(c => ({
        content_type: c.content_type,
        content_name: c.content_name,
        field_name: c.field_name,
        change_type: c.change_type,
        confidence: c.confidence,
        reasoning: c.reasoning,
      }))
    }

    console.log(`[${MODULE_SLUG}] Done: scanned=${totalScanned} changes=${allChanges.length} auto=${autoApproved} pending=${pendingReview} errors=${totalErrors} ${durationMs}ms`)
    return jsonResponse(response)
  } catch (e) {
    console.error(`[${MODULE_SLUG}] Fatal: ${e}`)
    return errorResponse(e instanceof Error ? e.message : 'Internal error', 500)
  }
})
