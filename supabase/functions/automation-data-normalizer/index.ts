/**
 * automation-data-normalizer — Normalizes structured data fields.
 *
 * Normalizations: email lowercase, whitespace cleanup, country/city name
 * standardization, phone format detection, case normalization.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'
import { corsHeaders, jsonResponse, errorResponse } from '../_shared/supabase-client.ts'
import {
  loadModuleConfig, checkRateLimit, writeChanges, logRun,
  getContentName, CONTENT_TYPE_CONFIG, COUNTRY_ALIASES,
  type ProposedChange, type AutomationRule,
} from '../_shared/automation-utils.ts'

const MODULE_SLUG = 'data-normalizer'

// ── Normalization functions ─────────────────────────────────────────────────────

function normalizeEmail(email: string): { value: string; changed: boolean; reason: string } {
  const trimmed = email.trim()
  const lower = trimmed.toLowerCase()
  if (lower !== trimmed) {
    return { value: lower, changed: true, reason: 'Lowercased email address' }
  }
  return { value: trimmed, changed: false, reason: '' }
}

function normalizeWhitespace(text: string): { value: string; changed: boolean; reason: string } {
  const cleaned = text.replace(/\s+/g, ' ').trim()
  if (cleaned !== text) {
    return { value: cleaned, changed: true, reason: 'Cleaned excessive whitespace' }
  }
  return { value: text, changed: false, reason: '' }
}

function normalizeCountryName(name: string): { value: string; changed: boolean; reason: string } {
  const lookup = name.trim().toLowerCase()
  const canonical = COUNTRY_ALIASES[lookup]
  if (canonical && canonical !== name.trim()) {
    return { value: canonical, changed: true, reason: `Standardized country name: "${name.trim()}" → "${canonical}"` }
  }
  return { value: name.trim(), changed: false, reason: '' }
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
    if (value == null || typeof value !== 'string' || !value.trim()) continue

    const fix = (rule.rule_config as { fix?: string }).fix

    if (rule.rule_type === 'normalize') {
      let result: { value: string; changed: boolean; reason: string }

      switch (fix) {
        case 'lowercase':
          result = normalizeEmail(value)
          break
        case 'whitespace':
        case 'trim':
          result = normalizeWhitespace(value)
          break
        case 'country_name':
          result = normalizeCountryName(value)
          break
        default:
          continue
      }

      if (result.changed) {
        changes.push({
          content_type: contentType,
          content_id: contentId,
          content_name: contentName,
          field_name: rule.field_name,
          old_value: value,
          new_value: result.value,
          change_type: 'normalize',
          confidence: fix === 'country_name' ? 0.95 : 0.99,
          reasoning: result.reason,
          rule_id: rule.id,
        })
      }
    }

    if (rule.rule_type === 'format') {
      const pattern = (rule.rule_config as { pattern?: string }).pattern
      if (pattern === 'phone') {
        // Flag obviously invalid phone numbers (too short, letters, etc.)
        const digitsOnly = value.replace(/[\s\-().+]/g, '')
        if (digitsOnly.length > 0 && (digitsOnly.length < 7 || /[a-zA-Z]/.test(digitsOnly))) {
          changes.push({
            content_type: contentType,
            content_id: contentId,
            content_name: contentName,
            field_name: rule.field_name,
            old_value: value,
            new_value: value,
            change_type: 'flag',
            confidence: 0.80,
            reasoning: `Potentially invalid phone number: "${value}" (${digitsOnly.length} digits)`,
            rule_id: rule.id,
          })
        }
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
