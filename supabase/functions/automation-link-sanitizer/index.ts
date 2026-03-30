/**
 * automation-link-sanitizer — Normalizes URLs, strips tracking params, validates format.
 *
 * Does NOT perform live URL checking (existing validate-links handles that).
 * This is format-only sanitization: protocol normalization, tracking param removal,
 * trailing slash cleanup, HTTPS enforcement.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'
import { corsHeaders, jsonResponse, errorResponse } from '../_shared/supabase-client.ts'
import {
  loadModuleConfig, checkRateLimit, writeChanges, logRun,
  getContentName, CONTENT_TYPE_CONFIG,
  type ProposedChange, type AutomationRule,
} from '../_shared/automation-utils.ts'

const MODULE_SLUG = 'link-sanitizer'

// Tracking parameters to strip
const DEFAULT_STRIP_PARAMS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'fbclid', 'gclid', 'gclsrc', 'dclid', 'gbraid', 'wbraid',
  'mc_cid', 'mc_eid', 'msclkid', 'twclid', 'igshid',
  'ref', '_ref', 'ref_', 'source', 'si',
]

// Fields per content type that contain URLs
const URL_FIELDS: Record<string, string[]> = {
  venues: ['website'],
  events: ['website'],
  personalities: ['website'],
  news_articles: ['url', 'source_url'],
}

function sanitizeUrl(rawUrl: string, stripParams: string[]): { cleaned: string; changes: string[] } {
  const changes: string[] = []
  let url = rawUrl.trim()

  if (!url) return { cleaned: url, changes }

  // Add protocol if missing
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`
    changes.push('Added https:// protocol')
  }

  // Upgrade http to https (except localhost)
  if (/^http:\/\//i.test(url) && !/localhost|127\.0\.0\.1|\.local/i.test(url)) {
    url = url.replace(/^http:\/\//i, 'https://')
    changes.push('Upgraded to HTTPS')
  }

  // Parse URL to strip tracking params
  try {
    const parsed = new URL(url)

    // Lowercase host
    if (parsed.hostname !== parsed.hostname.toLowerCase()) {
      parsed.hostname = parsed.hostname.toLowerCase()
      changes.push('Lowercased hostname')
    }

    // Strip tracking params
    const paramsToRemove: string[] = []
    for (const param of stripParams) {
      if (parsed.searchParams.has(param)) {
        paramsToRemove.push(param)
      }
    }
    if (paramsToRemove.length > 0) {
      for (const p of paramsToRemove) parsed.searchParams.delete(p)
      changes.push(`Stripped tracking params: ${paramsToRemove.join(', ')}`)
    }

    // Remove trailing slash on path (except root /)
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.replace(/\/+$/, '')
      changes.push('Removed trailing slash')
    }

    // Remove empty hash
    if (parsed.hash === '#') {
      parsed.hash = ''
      changes.push('Removed empty hash')
    }

    url = parsed.toString()
  } catch {
    // URL parsing failed — return as-is with protocol fix only
  }

  return { cleaned: url, changes }
}

function isValidUrlFormat(url: string): boolean {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`)
    return parsed.hostname.includes('.') && parsed.hostname.length > 3
  } catch {
    return false
  }
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

    const stripParams = (config.module.config as { strip_params?: string[] }).strip_params ?? DEFAULT_STRIP_PARAMS
    const batchId = crypto.randomUUID()
    const workflowRunId = payload.workflow_run_id as string | null ?? null
    const dryRun = payload.dry_run === true
    const allChanges: ProposedChange[] = []
    let totalScanned = 0
    let totalErrors = 0

    for (const contentType of config.module.content_types) {
      const ctConfig = CONTENT_TYPE_CONFIG[contentType]
      const urlFields = URL_FIELDS[contentType]
      if (!ctConfig || !urlFields) continue

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
        const name = getContentName(item as Record<string, unknown>, ctConfig)

        for (const field of urlFields) {
          const rawUrl = (item as Record<string, unknown>)[field]
          if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) continue

          // Check format validity
          if (!isValidUrlFormat(rawUrl)) {
            allChanges.push({
              content_type: contentType,
              content_id: String(item.id),
              content_name: name,
              field_name: field,
              old_value: rawUrl,
              new_value: rawUrl,
              change_type: 'flag',
              confidence: 1.0,
              reasoning: `Invalid URL format: ${rawUrl.slice(0, 100)}`,
            })
            continue
          }

          // Sanitize
          const { cleaned, changes } = sanitizeUrl(rawUrl, stripParams)
          if (cleaned !== rawUrl && changes.length > 0) {
            allChanges.push({
              content_type: contentType,
              content_id: String(item.id),
              content_name: name,
              field_name: field,
              old_value: rawUrl,
              new_value: cleaned,
              change_type: 'sanitize',
              confidence: 0.97,
              reasoning: changes.join('; '),
            })
          }
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
