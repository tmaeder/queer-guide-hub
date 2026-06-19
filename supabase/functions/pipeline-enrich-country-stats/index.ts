// pipeline-enrich-country-stats — fills empty country statistic fields (GDP,
// GDP/capita, life expectancy, literacy rate) from the FREE, key-less World Bank
// Indicators API (api.worldbank.org/v2).
//
// Replaces the Wolfram path (enrich-wolfram needs a paid WOLFRAM_APP_ID that was
// never set, so ~133 countries never got these stats). Same contract & enrichment_status
// semantics: a field that can't be resolved after MAX_ATTEMPTS tries is marked terminal
// `data_unavailable`, so the completeness scorer credits it and the selector stops retrying.
//
// NOTE: human_development_index is intentionally NOT sourced here — there is no reliable
// free, key-less, per-country HDI endpoint (UNDP hdrdata.org is frequently unreachable).
// HDI is left as a residual gap for a dedicated future source (e.g. Wikidata P1081 batch).
//
// Auth: X-Internal-Secret (dispatcher/cron) or admin (requireInternalOrAdmin).
// Body: { content_type?: 'country', limit?: number, dry_run?: boolean, country_ids?: string[] }

import { getServiceClient, requireInternalOrAdmin, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'

const STEP = 'worldbank-stats'
const MAX_ATTEMPTS = 3
const DEFAULT_LIMIT = 30
const MAX_LIMIT = 60
const FETCH_TIMEOUT_MS = 12_000

// Economic/health series sourced from the World Bank. HDI is handled separately (UNDP).
const WB_FIELDS: Array<{
  col: string
  indicator: string
  valid: (v: number) => boolean
  coerce: (v: number) => number
}> = [
  { col: 'gdp_usd',            indicator: 'NY.GDP.MKTP.CD', valid: (v) => v > 0,             coerce: Math.round },
  { col: 'gdp_per_capita_usd', indicator: 'NY.GDP.PCAP.CD', valid: (v) => v > 0 && v < 5e6,  coerce: Math.round },
  { col: 'life_expectancy',    indicator: 'SP.DYN.LE00.IN', valid: (v) => v > 20 && v < 120, coerce: (v) => Math.round(v * 10) / 10 },
  { col: 'literacy_rate',      indicator: 'SE.ADT.LITR.ZS', valid: (v) => v > 0 && v <= 100, coerce: (v) => Math.round(v * 100) / 100 },
]

const STAT_COLS = WB_FIELDS.map((f) => f.col)

async function fetchJson(url: string): Promise<unknown | null> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json' } })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

/** World Bank: most-recent non-empty value for an indicator. */
async function worldBank(iso2: string, indicator: string): Promise<number | null> {
  const url = `https://api.worldbank.org/v2/country/${encodeURIComponent(iso2)}/indicator/${indicator}?format=json&mrnev=1&per_page=1`
  const json = await fetchJson(url)
  if (!Array.isArray(json) || json.length < 2 || !Array.isArray(json[1])) return null
  const row = json[1][0] as { value?: number | null } | undefined
  const v = row?.value
  return typeof v === 'number' && isFinite(v) ? v : null
}

interface FieldState { state: 'pending' | 'resolved' | 'data_unavailable'; source: string; attempts?: number; at: string }
interface CountryRow { id: string; name: string; code: string | null; enrichment_status: Record<string, FieldState> | null; [col: string]: unknown }

function bumpMiss(status: Record<string, FieldState>, col: string, source: string): void {
  const attempts = (status[col]?.attempts ?? 0) + 1
  status[col] = { state: attempts >= MAX_ATTEMPTS ? 'data_unavailable' : 'pending', source, attempts, at: new Date().toISOString() }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse(req)

  const supabase = getServiceClient()
  const auth = await requireInternalOrAdmin(req, supabase)
  if (auth instanceof Response) return auth

  const body = await req.json().catch(() => ({}))
  const contentType = (body.content_type ?? 'country') as string
  if (contentType !== 'country') {
    return jsonResponse({ success: true, enriched: 0, message: `content_type '${contentType}' not implemented` }, 200, req)
  }
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(body.limit ?? DEFAULT_LIMIT)))
  const dryRun = body.dry_run === true
  const countryIds: string[] | null = Array.isArray(body.country_ids) ? body.country_ids : null

  // Real, non-duplicate countries with at least one empty stat field. Territories are
  // skipped (shell_status filter) — they have no reported economic stats.
  let q = supabase
    .from('countries')
    .select('id, name, code, enrichment_status, gdp_usd, gdp_per_capita_usd, human_development_index, life_expectancy, literacy_rate')
    .is('duplicate_of_id', null)
    .eq('shell_status', 'real')
    .order('wolfram_enriched_at', { ascending: true, nullsFirst: true })
    .limit(limit)
  if (countryIds?.length) {
    q = q.in('id', countryIds)
  } else {
    q = q.or(STAT_COLS.map((c) => `${c}.is.null`).join(','))
  }

  const { data, error } = await q
  if (error) return errorResponse(`load: ${error.message}`, 500, req)
  const countries = (data ?? []) as unknown as CountryRow[]
  if (!countries.length) return jsonResponse({ success: true, enriched: 0, message: 'nothing to enrich' }, 200, req)

  let enriched = 0, examined = 0
  const results: Array<Record<string, unknown>> = []

  for (const c of countries) {
    examined++
    const started = Date.now()
    const iso2 = (c.code ?? '').trim()
    if (!/^[A-Za-z]{2}$/.test(iso2)) {
      results.push({ id: c.id, name: c.name, skipped: 'no_iso2' })
      continue
    }
    const status = (c.enrichment_status ?? {}) as Record<string, FieldState>
    const updates: Record<string, unknown> = {}
    let touchedField = false

    // World Bank economic/health series.
    for (const f of WB_FIELDS) {
      if (c[f.col] != null) continue
      if (status[f.col]?.state === 'data_unavailable') continue
      let value: number | null = null
      try {
        const n = await worldBank(iso2, f.indicator)
        if (n !== null && f.valid(n)) value = f.coerce(n)
      } catch { /* miss */ }
      if (value !== null) {
        updates[f.col] = value
        status[f.col] = { state: 'resolved', source: 'worldbank', at: new Date().toISOString() }
      } else {
        bumpMiss(status, f.col, 'worldbank')
      }
      touchedField = true
    }

    const filled = Object.keys(updates).length
    if (filled > 0) enriched++

    if (!dryRun && touchedField) {
      updates.enrichment_status = status
      updates.wolfram_enriched_at = new Date().toISOString()
      const { error: upErr } = await supabase.from('countries').update(updates).eq('id', c.id)
      await supabase.from('enrichment_log').insert({
        entity_type: 'country', entity_id: c.id, step: STEP,
        status: upErr ? 'failed' : filled > 0 ? 'done' : 'skipped',
        error_message: upErr?.message ?? null,
        duration_ms: Date.now() - started,
      })
    }
    results.push({ id: c.id, name: c.name, filled })
  }

  return jsonResponse({ success: true, enriched, examined, dry_run: dryRun, results: results.slice(0, 60) }, 200, req)
})
