import { getServiceClient } from '../_shared/supabase-client.ts'

/**
 * M7.1 cron — picks watched_urls rows that are due (last_checked_at +
 * frequency_minutes < now()) and refreshes their fingerprint. The
 * fingerprint is sha256 of the response body; on change the popup's
 * Watched tab highlights the row so the user knows to revisit.
 *
 * Triggered every 15 min by pg_cron via SELECT cron.schedule(...).
 * Scoped read+write done via service-role key.
 */

async function sha256Hex(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text)
  const hash = await crypto.subtle.digest('SHA-256', buf)
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*' } })

  const supabase = getServiceClient()

  const batchLimit = 50
  // Due = no last_checked_at OR last_checked_at + frequency_minutes < now().
  // Computed in SQL via a helper view would be cleanest; for now query then
  // filter client-side. Acceptable since N is small (per-user watchlist).
  const { data: rows, error } = await supabase
    .from('watched_urls')
    .select('id,url,frequency_minutes,last_checked_at,last_fingerprint')
    .eq('is_active', true)
    .order('last_checked_at', { ascending: true, nullsFirst: true })
    .limit(batchLimit)
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  if (!rows?.length) return new Response(JSON.stringify({ checked: 0 }), { status: 200 })

  const now = Date.now()
  const due = rows.filter((r) => {
    if (!r.last_checked_at) return true
    const next = new Date(r.last_checked_at).getTime() + r.frequency_minutes * 60_000
    return next <= now
  })

  let changed = 0
  let failed = 0
  for (const row of due) {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 8000)
      const res = await fetch(row.url, { signal: ctrl.signal, headers: { 'User-Agent': 'queer-guide-watch/1.0' } })
      clearTimeout(t)
      if (!res.ok) {
        await supabase.from('watched_urls').update({ last_checked_at: new Date().toISOString() }).eq('id', row.id)
        failed++
        continue
      }
      const body = await res.text()
      const fp = await sha256Hex(body)
      if (fp !== row.last_fingerprint) changed++
      await supabase
        .from('watched_urls')
        .update({ last_fingerprint: fp, last_checked_at: new Date().toISOString() })
        .eq('id', row.id)
    } catch {
      await supabase.from('watched_urls').update({ last_checked_at: new Date().toISOString() }).eq('id', row.id)
      failed++
    }
  }

  return new Response(
    JSON.stringify({ checked: due.length, changed, failed }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
})
