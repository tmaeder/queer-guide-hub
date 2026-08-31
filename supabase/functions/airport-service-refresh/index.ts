// airport-service-refresh — rebuilds public.airport_service, the gate that says
// which IATA codes belong to an airport with real scheduled passenger service.
//
// Why the gate exists: cities.airport_codes had exactly one writer, the `sparql`
// phase of city-factual-backfill, which takes every Wikidata P931 ("place served
// by transport hub") result carrying an IATA code. P931 says nothing about
// passenger traffic, so 250 of the 934 distinct codes in the corpus (27%,
// measured 2026-08-25) were rail stations (Boston ZTO, Halifax XDG), heliports
// (Algeciras AEI), closed airports (Berlin SXF, Nicosia NIC), general-aviation or
// military fields (Houston EFD/IWS/CXO, Moenchengladbach MGL) or simply the
// wrong city (Houston HVN = Tweed New Haven, CT). `major_airport_code` feeds the
// Aviasales flight search, so those were broken booking links.
//
// Source: OurAirports airports.csv — free, key-less, ~12 MB. The gate is
// scheduled_service='yes' AND type IN (large_airport, medium_airport,
// small_airport): rail stations are absent from the file entirely, heliports and
// seaplane bases have their own types, closed fields are type='closed' and GA
// strips are scheduled_service='no'. small_airport is kept on purpose — Martha's
// Vineyard (MVY) has genuine scheduled service.
//
// Traps this function is built around:
//   - Absence from the file is NOT evidence of closure. MLH and EAP are alternate
//     codes for Basel EuroAirport, which the file carries only as BSL; they live
//     in its `keywords` column and are recorded in alt_codes so
//     airport_service_unknown_codes() can tell a human "not missing, it is Basel"
//     instead of presenting them as junk. Nothing is auto-judged.
//   - Ranking is `wikibase:sitelinks` first, passengers second. Volume alone
//     picks the wrong airport for a metro that has both a domestic city airport
//     and an international gateway, because P3872 carries whatever year each
//     airport last reported -- Wikidata's best figure for Incheon is 17.9M
//     against Gimpo's 24.5M, which would make GMP Seoul's primary. Sitelinks get
//     Seoul, Buenos Aires and Tehran right where volume does not.
//   - Neither number may ever be read as proof an airport is OPEN. P3872 is
//     historical: closed SXF still reports 12.8M and the rail station XDS 800k.
//     Only the OurAirports gate decides that.
//   - A WDQS outage must not wipe the ranking. Both columns are simply left out
//     of the payload when the query fails, so the ON CONFLICT UPDATE does not
//     touch them and the previous figures survive.
//   - Stale rows are removed by refreshed_at, not by an IN list: a 4,000-code
//     NOT IN filter does not fit in a PostgREST URL.
//
// Auth: X-Webhook-Secret (cron) or admin/service-role, same as the other city
// data-quality functions.
// Body: { dry_run?: boolean }

import { getCorsHeaders, getServiceClient, requireInternalOrAdmin, jsonResponse } from '../_shared/supabase-client.ts'
import { hasValidWebhookSecret } from '../_shared/webhook-auth.ts'

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
    // The file carries a few junk rows ("(Duplicate)YEG") with no usable geometry.
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

  // A keyword that is itself a gate code is another airport, not an alias.
  const primary = new Set(rows.map(a => a.iata_code))
  const alts = new Map<string, string[]>()
  for (const [alt, canonical] of aliasOf) {
    if (primary.has(alt)) continue
    alts.set(canonical, [...(alts.get(canonical) ?? []), alt])
  }
  for (const a of rows) a.alt_codes = alts.get(a.iata_code) ?? null

  return { rows, byType, skipped }
}

/** Wikidata P3872, latest reported year per IATA code. Ranking only. */
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
    return jsonResponse({ error: 'ourairports_unavailable', detail: String(e).slice(0, 120) }, 200, req)
  }
  if (gate.rows.length < 1000) {
    // A short answer means a truncated or changed upstream file, not a world in
    // which scheduled air travel stopped. Writing it would empty the gate and the
    // linker would then read every existing code as junk.
    return jsonResponse({ error: 'gate_implausibly_small', rows: gate.rows.length }, 200, req)
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
    if (error) return jsonResponse({ error: 'upsert_failed', detail: error.message, written }, 200, req)
    written += Math.min(CHUNK, payload.length - i)
  }

  // Rows that fell out of the gate (airport closed, scheduled service withdrawn)
  // must leave, or the linker keeps honouring them forever. Keyed on
  // refreshed_at, because a 4,000-code NOT IN filter does not fit in a URL.
  const { data: removed, error: delErr } = await supabase
    .from('airport_service').delete().eq('source', 'ourairports').lt('refreshed_at', startedAt)
    .select('iata_code')
  if (delErr) return jsonResponse({ error: 'prune_failed', detail: delErr.message, written }, 200, req)

  return jsonResponse({
    written, removed: removed?.length ?? 0, by_type: gate.byType, skipped: gate.skipped,
    ranked: rank ? payload.filter(a => a.sitelinks != null).length : 0,
    with_pax: rank ? payload.filter(a => a.pax_per_year != null).length : 0,
    rank_note: rank ? undefined : 'WDQS unavailable — existing ranking columns left untouched',
  }, 200, req)
})
