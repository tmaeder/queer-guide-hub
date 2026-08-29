// airport-service-refresh — rebuilds public.airport_service, the gate that says
// which IATA codes belong to an airport with real scheduled passenger service.
//
// Source: OurAirports airports.csv — free, key-less, ~12 MB. The gate is
// scheduled_service='yes' AND type IN (large_airport, medium_airport,
// small_airport). Ranking is wikibase:sitelinks first, P3872 passengers second;
// neither may ever be read as proof an airport is open.
//
// Every failure exit returns a 5xx, deliberately. This function is a tracked
// automation (`admin_automations.airport_service_refresh`, wrapped in pg_cron
// with the run-begin shim), and `admin_automation_reap_runs()` classifies a
// response as an error on `status_code >= 400 OR error_msg IS NOT NULL` --
// a success then RESETS `consecutive_failures`. Returning 200 with an
// `{error: ...}` body, as this did until 2026-08-28, meant a month where
// OurAirports was down or the upsert failed was recorded as a healthy run and
// auto-pause could never fire. A 200 here must mean the gate was rebuilt.

import { getCorsHeaders, getServiceClient, requireInternalOrAdmin, jsonResponse } from '../_shared/supabase-client.ts'
import { hasValidWebhookSecret } from '../_shared/webhook-auth.ts'
import { safeErrCode } from '../_shared/safe-error.ts'

const CSV_URL = 'https://davidmegginson.github.io/ourairports-data/airports.csv'
const WDQS = 'https://query.wikidata.org/sparql'
const UA = 'QueerGuideBot/1.0 (https://queer.guide; contact@queer.guide)'
const KEPT_TYPES = new Set(['large_airport', 'medium_airport', 'small_airport'])
const CSV_TIMEOUT = 120_000
const WDQS_TIMEOUT = 90_000
const CHUNK = 500

interface GateRow {
  iata_code: string
  icao_code: string | null
  name: string
  municipality: string | null
  country_code: string
  latitude: number
  longitude: number
  ap_type: string
  alt_codes: string[] | null
  pax_per_year?: number | null
  sitelinks?: number | null
}

/** Minimal RFC4180 reader — OurAirports quotes every name containing a comma. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], field = '', inQ = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else inQ = false
      } else field += c
    } else if (c === '"') inQ = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (c !== '\r') field += c
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  return rows
}

async function fetchText(url: string, timeout: number, accept = 'text/csv'): Promise<string> {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), timeout)
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: accept }, signal: ctl.signal })
    if (!r.ok) throw new Error(`http_${r.status}`)
    return await r.text()
  } finally { clearTimeout(t) }
}

function buildGate(csv: string): { rows: GateRow[]; byType: Record<string, number>; skipped: number } {
  const table = parseCsv(csv)
  const ix: Record<string, number> = Object.fromEntries(table[0].map((h, i) => [h, i]))
  const rows: GateRow[] = []
  const byType: Record<string, number> = {}
  const aliasOf = new Map<string, string>()
  let skipped = 0

  for (let i = 1; i < table.length; i++) {
    const r = table[i]
    const iata = (r[ix.iata_code] ?? '').trim().toUpperCase()
    const type = r[ix.type]
    if (!/^[A-Z]{3}$/.test(iata)) continue
    if (r[ix.scheduled_service] !== 'yes' || !KEPT_TYPES.has(type)) continue
    const lat = Number(r[ix.latitude_deg]), lon = Number(r[ix.longitude_deg])
    const cc = (r[ix.iso_country] ?? '').trim().toUpperCase()
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !/^[A-Z]{2}$/.test(cc)) { skipped++; continue }
    byType[type] = (byType[type] ?? 0) + 1
    rows.push({
      iata_code: iata,
      icao_code: (r[ix.icao_code] ?? '').trim() || null,
      name: r[ix.name],
      municipality: (r[ix.municipality] ?? '').trim() || null,
      country_code: cc,
      latitude: lat,
      longitude: lon,
      ap_type: type,
      alt_codes: null,
    })
    for (const kw of (r[ix.keywords] ?? '').split(',')) {
      const t = kw.trim().toUpperCase()
      if (/^[A-Z]{3}$/.test(t) && t !== iata) aliasOf.set(t, iata)
    }
  }

  const primary = new Set(rows.map(a => a.iata_code))
  const alts = new Map<string, string[]>()
  for (const [alt, canonical] of aliasOf) {
    if (primary.has(alt)) continue
    alts.set(canonical, [...(alts.get(canonical) ?? []), alt])
  }
  for (const a of rows) a.alt_codes = alts.get(a.iata_code) ?? null

  return { rows, byType, skipped }
}

/**
 * One WDQS pass for both ranking signals, keyed on IATA (P238). Two separate
 * queries would be simpler but WDQS rate-limits hard (observed: 1 request per
 * minute during an outage), so the second one is exactly what fails.
 *
 * Neither value says anything about whether the airport is open — that is the
 * OurAirports gate's job, and only its job.
 */
async function loadRanking(): Promise<Map<string, { pax: number | null; sitelinks: number | null }> | null> {
  const q = 'SELECT ?iata (MAX(?p) AS ?pax) (MAX(?sl) AS ?s) WHERE { ' +
    '?ap wdt:P238 ?iata ; wikibase:sitelinks ?sl . OPTIONAL { ?ap wdt:P3872 ?p } } GROUP BY ?iata'
  try {
    const body = await fetchText(
      `${WDQS}?format=json&query=${encodeURIComponent(q)}`, WDQS_TIMEOUT, 'application/sparql-results+json')
    const d = JSON.parse(body) as { results?: { bindings?: Array<Record<string, { value: string }>> } }
    const out = new Map<string, { pax: number | null; sitelinks: number | null }>()
    for (const b of d.results?.bindings ?? []) {
      const code = b.iata?.value?.toUpperCase()
      if (!code) continue
      const pax = Number(b.pax?.value)
      const sl = Number(b.s?.value)
      out.set(code, {
        pax: Number.isFinite(pax) && pax > 0 ? Math.round(pax) : null,
        sitelinks: Number.isFinite(sl) && sl > 0 ? Math.round(sl) : null,
      })
    }
    return out.size ? out : null
  } catch {
    return null
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(req) })

  const supabase = getServiceClient()
  if (!hasValidWebhookSecret(req, 'CITY_QUALITY_WEBHOOK_SECRET')) {
    const auth = await requireInternalOrAdmin(req, supabase)
    if (auth instanceof Response) return auth
  }
  const body = await req.json().catch(() => ({})) as { dry_run?: boolean }
  const dryRun = body.dry_run ?? false
  const startedAt = new Date().toISOString()

  let gate
  try {
    gate = buildGate(await fetchText(CSV_URL, CSV_TIMEOUT))
  } catch (e) {
    // Allowlist, not redaction: `String(e)` here carries the fetch/parse failure
    // verbatim, which is CWE-209 (CodeQL js/stack-trace-exposure alert 73). No
    // caller parses `detail` -- the sole caller is the fire-and-forget pg_cron
    // post -- so the real text goes to the server log and the body carries a
    // code we chose.
    return jsonResponse({ error: 'ourairports_unavailable', detail: safeErrCode(e, [], 'airport-service-refresh/fetch') }, 503, req)
  }
  if (gate.rows.length < 1000) {
    return jsonResponse({ error: 'gate_implausibly_small', rows: gate.rows.length }, 500, req)
  }

  const rank = await loadRanking()
  const payload = gate.rows.map(a => (rank
    ? { ...a, pax_per_year: rank.get(a.iata_code)?.pax ?? null, sitelinks: rank.get(a.iata_code)?.sitelinks ?? null }
    : a))

  if (dryRun) {
    return jsonResponse({
      dry_run: true, rows: payload.length, by_type: gate.byType, skipped: gate.skipped,
      ranked: rank ? payload.filter(a => a.sitelinks != null).length : 0,
      with_pax: rank ? payload.filter(a => a.pax_per_year != null).length : 0,
      with_alt_codes: payload.filter(a => a.alt_codes?.length).length,
    }, 200, req)
  }

  let written = 0
  for (let i = 0; i < payload.length; i += CHUNK) {
    const { error } = await supabase
      .from('airport_service')
      .upsert(payload.slice(i, i + CHUNK).map(a => ({ ...a, source: 'ourairports', refreshed_at: new Date().toISOString() })),
        { onConflict: 'iata_code' })
    // CodeQL flagged only the fetch path above, but a PostgREST message is the
    // worse leak of the two: it names columns, relations and constraints. Same
    // treatment; the whole error object still reaches the server log.
    if (error) return jsonResponse({ error: 'upsert_failed', detail: safeErrCode(error, [], 'airport-service-refresh/upsert'), written }, 500, req)
    written += Math.min(CHUNK, payload.length - i)
  }

  const { data: removed, error: delErr } = await supabase
    .from('airport_service').delete().eq('source', 'ourairports').lt('refreshed_at', startedAt)
    .select('iata_code')
  if (delErr) return jsonResponse({ error: 'prune_failed', detail: safeErrCode(delErr, [], 'airport-service-refresh/prune'), written }, 500, req)

  return jsonResponse({
    written, removed: removed?.length ?? 0, by_type: gate.byType, skipped: gate.skipped,
    ranked: rank ? payload.filter(a => a.sitelinks != null).length : 0,
    with_pax: rank ? payload.filter(a => a.pax_per_year != null).length : 0,
    rank_note: rank ? undefined : 'WDQS unavailable — existing ranking columns left untouched',
  }, 200, req)
})
