import { getServiceClient } from '../_shared/supabase-client.ts'
import { extractContent, type ExtractResult } from '../_shared/extract-client.ts'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'

type AnalyzeItem = {
  fields?: Record<string, { value: unknown } | unknown>
  tag_suggestions?: Array<{ slug: string; preselected: boolean }>
  detected_type?: string
  matches?: { duplicates?: Array<{ score?: number }> }
}

type WatchRow = {
  id: string
  url: string
  user_id: string
  last_fingerprint: string | null
  imported_count?: number | null
}

/**
 * M7.1 cron — picks watched_urls rows that are due (last_checked_at +
 * frequency_minutes < now()) and refreshes their fingerprint. On a REAL change
 * (structured-content fingerprint differs from the stored baseline) it re-scans
 * the page via analyze-flyer (internal mode) and auto-imports the NEW items
 * (those with no existing duplicate) into community_submissions as the watch
 * owner — they ride the normal review pipeline. The owner is notified.
 *
 * Fingerprint is sha256 of the page's STRUCTURED content (og + JSON-LD +
 * markdown via the extract worker), not the raw HTML body — raw-body hashing
 * false-positived on ads/timestamps and would spam imports.
 *
 * Triggered every 15 min by pg_cron (job 135). Service-role scoped.
 */

const CONTENT_TYPE: Record<string, string> = {
  event: 'event', venue: 'venue', hotel: 'hotel', news: 'news', marketplace: 'product',
}

async function sha256Hex(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text)
  const hash = await crypto.subtle.digest('SHA-256', buf)
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Stable structured-content signal for change detection. */
function fingerprintText(e: ExtractResult | null): string | null {
  if (!e) return null
  const parts: string[] = []
  if (e.meta?.title) parts.push(e.meta.title)
  if (e.meta?.description) parts.push(e.meta.description)
  if (Array.isArray(e.jsonLd) && e.jsonLd.length) {
    try { parts.push(JSON.stringify(e.jsonLd)) } catch { /* skip */ }
  }
  if (e.markdown) parts.push(e.markdown.trim())
  const s = parts.join('\n').trim()
  return s.length >= 20 ? s : null
}

function flattenItem(item: AnalyzeItem): { content_type: string; data: Record<string, unknown> } | null {
  const fields = (item?.fields ?? {}) as Record<string, { value: unknown } | unknown>
  const data: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(fields)) {
    if (v && typeof v === 'object' && 'value' in v) {
      const val = (v as { value: unknown }).value
      if (val !== null && val !== undefined) data[k] = val
    }
  }
  if (Object.keys(data).length === 0) return null
  const tags = ((item?.tag_suggestions ?? []) as Array<{ slug: string; preselected: boolean }>)
    .filter((t) => t.preselected).map((t) => t.slug)
  if (tags.length) data.tags = tags
  return { content_type: CONTENT_TYPE[item.detected_type ?? ''] ?? 'event', data }
}

function isNewItem(item: AnalyzeItem): boolean {
  const dups = (item?.matches?.duplicates ?? []) as Array<{ score?: number }>
  return !dups.some((d) => (d.score ?? 0) >= 0.9)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*' } })

  const supabase = getServiceClient()
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const internalSecret = Deno.env.get('INTERNAL_INVOKE_SECRET')

  const batchLimit = 50
  const { data: rows, error } = await supabase
    .from('watched_urls')
    .select('id,url,frequency_minutes,last_checked_at,last_fingerprint,user_id,imported_count')
    .eq('is_active', true)
    .order('last_checked_at', { ascending: true, nullsFirst: true })
    .limit(batchLimit)
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  if (!rows?.length) return new Response(JSON.stringify({ checked: 0 }), { status: 200 })

  const now = Date.now()
  const due = rows.filter((r) => {
    if (!r.last_checked_at) return true
    return new Date(r.last_checked_at).getTime() + r.frequency_minutes * 60_000 <= now
  })

  let changed = 0, failed = 0, imported = 0
  for (const row of due) {
    try {
      // 1. Fingerprint on structured content (falls back to raw body if extract fails).
      const extracted = await extractContent(supabase, { url: row.url, timeoutMs: 12_000 })
      const structured = fingerprintText(extracted)
      // Prefix marks the fingerprint scheme: 's:' = structured-content hash,
      // 'b:' = raw-body fallback. A change only counts when the stored baseline
      // used the SAME scheme — so the one-time switch from the legacy raw-body
      // hash re-baselines cleanly instead of importing the whole page.
      let fp: string
      if (structured) {
        fp = 's:' + await sha256Hex(structured)
      } else {
        const ctrl = new AbortController()
        const t = setTimeout(() => ctrl.abort(), 8000)
        const res = await fetch(row.url, { signal: ctrl.signal, headers: { 'User-Agent': 'queer-guide-watch/1.0' } })
        clearTimeout(t)
        if (!res.ok) { await stamp(supabase, row.id); failed++; continue }
        fp = 'b:' + await sha256Hex(await res.text())
      }

      const prev: string | null = row.last_fingerprint
      const sameScheme = typeof prev === 'string' && prev.slice(0, 2) === fp.slice(0, 2)
      const isChange = sameScheme && fp !== prev
      // Import only on a real change against a comparable baseline (and only via
      // the structured path). First check / scheme switch just records the fp.
      const shouldImport = isChange && !!structured && !!internalSecret

      let importedNow = 0
      if (shouldImport) {
        importedNow = await importNewItems(supabaseUrl, serviceKey, internalSecret!, supabase, structured!, row)
        imported += importedNow
      }
      if (isChange) changed++

      await supabase.from('watched_urls').update({
        last_fingerprint: fp,
        last_checked_at: new Date().toISOString(),
        ...(importedNow > 0
          ? { last_imported_at: new Date().toISOString(), imported_count: (row.imported_count ?? 0) + importedNow }
          : {}),
      }).eq('id', row.id)
    } catch {
      await stamp(supabase, row.id)
      failed++
    }
  }

  return new Response(
    JSON.stringify({ checked: due.length, changed, failed, imported }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
})

async function stamp(supabase: SupabaseClient, id: string) {
  await supabase.from('watched_urls').update({ last_checked_at: new Date().toISOString() }).eq('id', id)
}

/** Re-scan the changed page via analyze-flyer (internal) and stage only NEW items. */
async function importNewItems(
  supabaseUrl: string,
  serviceKey: string,
  internalSecret: string,
  supabase: SupabaseClient,
  structuredText: string,
  row: WatchRow,
): Promise<number> {
  // analyze-flyer is verify_jwt=true → pass the service-role key for the gateway,
  // plus X-Internal-Secret + as_user_id so it skips per-user auth/rate-limit and
  // attributes the scan to the watch owner. Pass the already-extracted text so it
  // doesn't re-fetch the page.
  const res = await fetch(`${supabaseUrl}/functions/v1/analyze-flyer`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${serviceKey}`,
      'x-internal-secret': internalSecret,
    },
    body: JSON.stringify({ text: structuredText, as_user_id: row.user_id }),
  })
  if (!res.ok) { console.warn(`analyze-flyer internal failed for ${row.url}: ${res.status}`); return 0 }
  const out = await res.json().catch(() => null)
  const items = Array.isArray(out?.items) ? out.items : []

  const submissions = items
    .filter(isNewItem)
    .map(flattenItem)
    .filter((r: unknown): r is { content_type: string; data: Record<string, unknown> } => r != null)
    .map((r: { content_type: string; data: Record<string, unknown> }) => ({
      content_type: r.content_type,
      status: 'pending',
      data: { ...r.data, _source: 'url_watch', _watch_id: row.id },
      submitted_by: row.user_id,
      platform: 'watch',
      sub_source_type: 'url_watch',
      source_url: row.url,
    }))

  if (submissions.length === 0) return 0

  const { error: insErr } = await supabase.from('community_submissions').insert(submissions)
  if (insErr) { console.error('watch import insert failed:', insErr.message); return 0 }

  // Notify the owner. Best-effort; never blocks the loop.
  await supabase.from('notifications').insert({
    user_id: row.user_id,
    type: 'watch_import',
    title: `${submissions.length} new item${submissions.length === 1 ? '' : 's'} from a watched site`,
    content: `We found new content at ${row.url} and queued it for review.`,
    action_url: '/me',
    metadata: { watch_id: row.id, url: row.url, count: submissions.length },
  }).then(({ error }: { error: { message: string } | null }) => {
    if (error) console.warn('watch notify failed:', error.message)
  })

  return submissions.length
}
