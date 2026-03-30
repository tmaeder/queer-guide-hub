/**
 * Link Sanitizer — normalizes URLs, strips tracking params, validates format.
 * Format-only sanitization (no live URL checking).
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'
import {
  fetchBatch, getContentName, CONTENT_TYPE_CONFIG,
  type ModuleConfig, type SharedRefs, type ProposedChange,
} from '../../_shared/automation-utils.ts'

const DEFAULT_STRIP_PARAMS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'fbclid', 'gclid', 'gclsrc', 'dclid', 'gbraid', 'wbraid',
  'mc_cid', 'mc_eid', 'msclkid', 'twclid', 'igshid',
  'ref', '_ref', 'ref_', 'source', 'si',
]

const URL_FIELDS: Record<string, string[]> = {
  venues: ['website'], events: ['website'],
  news_articles: ['url'],
}

function sanitizeUrl(rawUrl: string, stripParams: string[]): { cleaned: string; changes: string[] } {
  const changes: string[] = []
  let url = rawUrl.trim()
  if (!url) return { cleaned: url, changes }

  if (!/^https?:\/\//i.test(url)) { url = `https://${url}`; changes.push('Added https:// protocol') }
  if (/^http:\/\//i.test(url) && !/localhost|127\.0\.0\.1|\.local/i.test(url)) {
    url = url.replace(/^http:\/\//i, 'https://'); changes.push('Upgraded to HTTPS')
  }

  try {
    const parsed = new URL(url)
    if (parsed.hostname !== parsed.hostname.toLowerCase()) { parsed.hostname = parsed.hostname.toLowerCase(); changes.push('Lowercased hostname') }
    const paramsToRemove = stripParams.filter(p => parsed.searchParams.has(p))
    if (paramsToRemove.length > 0) {
      for (const p of paramsToRemove) parsed.searchParams.delete(p)
      changes.push(`Stripped tracking params: ${paramsToRemove.join(', ')}`)
    }
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) { parsed.pathname = parsed.pathname.replace(/\/+$/, ''); changes.push('Removed trailing slash') }
    if (parsed.hash === '#') { parsed.hash = ''; changes.push('Removed empty hash') }
    url = parsed.toString()
  } catch { /* URL parsing failed — return with protocol fix only */ }

  return { cleaned: url, changes }
}

function isValidUrlFormat(url: string): boolean {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`)
    return parsed.hostname.includes('.') && parsed.hostname.length > 3
  } catch { return false }
}

export async function processLinkSanitizer(
  supabase: SupabaseClient,
  config: ModuleConfig,
  _refs: SharedRefs,
  opts: { dryRun: boolean; contentType?: string; contentId?: string; offset?: number },
): Promise<{ scanned: number; changes: ProposedChange[]; errors: number }> {
  const stripParams = (config.module.config as { strip_params?: string[] }).strip_params ?? DEFAULT_STRIP_PARAMS
  const allChanges: ProposedChange[] = []
  let totalScanned = 0; const totalErrors = 0

  const contentTypes = opts.contentType
    ? config.module.content_types.filter(ct => ct === opts.contentType)
    : config.module.content_types

  for (const contentType of contentTypes) {
    const ctConfig = CONTENT_TYPE_CONFIG[contentType]
    const urlFields = URL_FIELDS[contentType]
    if (!ctConfig || !urlFields) continue

    const items = await fetchBatch(supabase, contentType, config.module.batch_size, { contentId: opts.contentId, offset: opts.offset })

    for (const item of items) {
      totalScanned++
      const name = getContentName(item, ctConfig)

      for (const field of urlFields) {
        const rawUrl = item[field]
        if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) continue

        if (!isValidUrlFormat(rawUrl)) {
          allChanges.push({ content_type: contentType, content_id: String(item.id), content_name: name,
            field_name: field, old_value: rawUrl, new_value: rawUrl,
            change_type: 'flag', confidence: 1.0, reasoning: `Invalid URL format: ${rawUrl.slice(0, 100)}` })
          continue
        }

        const { cleaned, changes } = sanitizeUrl(rawUrl, stripParams)
        if (cleaned !== rawUrl && changes.length > 0) {
          allChanges.push({ content_type: contentType, content_id: String(item.id), content_name: name,
            field_name: field, old_value: rawUrl, new_value: cleaned,
            change_type: 'sanitize', confidence: 0.97, reasoning: changes.join('; ') })
        }
      }
    }
  }
  return { scanned: totalScanned, changes: allChanges, errors: totalErrors }
}
