// enrich-wolfram — fills empty country statistic fields (GDP, GDP/capita, HDI,
// life expectancy, literacy rate) from Wolfram Alpha. Powers the already-registered
// `enrich-wolfram-countries` workflow (queue import_jobs, invoked by workflow-dispatcher).
//
// Per the completeness engine: a field that Wolfram can't resolve after MAX_ATTEMPTS
// tries is marked terminal `data_unavailable` in countries.enrichment_status, so the
// completeness scorer credits it and the selector stops retrying it forever.
//
// Auth: X-Internal-Secret (dispatcher/cron) or admin (requireInternalOrAdmin).
// Body: { content_type?: 'country', limit?: number, dry_run?: boolean, country_ids?: string[] }

import { getCorsHeaders, getServiceClient, requireInternalOrAdmin, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
import { withCircuitBreaker, CircuitOpenError } from '../_shared/circuit-breaker.ts'
import { queryWolfram, parseNumber, type WolframResult } from '../_shared/wolfram-client.ts'

const STEP = 'wolfram'
const BREAKER = 'wolfram.api'
const MAX_ATTEMPTS = 3
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50

interface StatField {
  col: string
  q: (name: string) => string
  /** Reject obviously-wrong parses so a bad pod never writes garbage. */
  valid: (v: number) => boolean
  /** Coerce to the column's stored shape. */
  coerce: (v: number) => number
}

const STAT_FIELDS: StatField[] = [
  { col: 'gdp_usd',                q: (n) => `GDP of ${n}`,                  valid: (v) => v > 0,            coerce: Math.round },
  { col: 'gdp_per_capita_usd',     q: (n) => `GDP per capita of ${n}`,       valid: (v) => v > 0 && v < 5e6, coerce: Math.round },
  { col: 'human_development_index', q: (n) => `human development index ${n}`, valid: (v) => v > 0 && v <= 1,  coerce: (v) => Math.round(v * 1000) / 1000 },
  { col: 'life_expectancy',        q: (n) => `life expectancy ${n}`,         valid: (v) => v > 20 && v < 120, coerce: (v) => Math.round(v * 10) / 10 },
  { col: 'literacy_rate',          q: (n) => `literacy rate ${n}`,           valid: (v) => v > 0 && v <= 100, coerce: (v) => Math.round(v * 100) / 100 },
]

const STAT_COLS = STAT_FIELDS.map((f) => f.col)

/** Pull the first usable number out of a Wolfram result (short answer or pods). */
function resultToNumber(r: WolframResult): number | null {
  if (r.plaintext) {
    const n = parseNumber(r.plaintext)
    if (n !== null) return n
  }
  for (const pod of r.pods) {
    if (/input|interpretation/i.test(pod.title)) continue
    for (const sp of pod.subpods) {
      const n = parseNumber(sp.plaintext)
      if (n !== null) return n
    }
  }
  return null
}

interface FieldState { state: 'pending' | 'resolved' | 'data_unavailable'; source: string; attempts?: number; at: string }
interface CountryRow { id: string; name: string; enrichment_status: Record<string, FieldState> | null; [col: string]: unknown }

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse(req)

  const supabase = getServiceClient()
  const auth = await requireInternalOrAdmin(req, supabase)
  if (auth instanceof Response) return auth

  const appId = Deno.env.get('WOLFRAM_APP_ID')
  if (!appId) return errorResponse('WOLFRAM_APP_ID not configured', 500, req)

  const body = await req.json().catch(() => ({}))
  const contentType = (body.content_type ?? 'country') as string
  if (contentType !== 'country') {
    return jsonResponse({ success: true, enriched: 0, message: `content_type '${contentType}' not implemented` }, 200, req)
  }
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(body.limit ?? DEFAULT_LIMIT)))
  const dryRun = body.dry_run === true
  const countryIds: string[] | null = Array.isArray(body.country_ids) ? body.country_ids : null

  // Select countries with at least one empty stat field, never-enriched first.
  let q = supabase
    .from('countries')
    .select('id, name, enrichment_status, gdp_usd, gdp_per_capita_usd, human_development_index, life_expectancy, literacy_rate')
    .is('duplicate_of_id', null)
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

  let enriched = 0, examined = 0, circuitOpen = false
  const results: Array<Record<string, unknown>> = []

  outer:
  for (const c of countries) {
    examined++
    const started = Date.now()
    const status = (c.enrichment_status ?? {}) as Record<string, FieldState>
    const updates: Record<string, unknown> = {}
    let touchedField = false

    for (const f of STAT_FIELDS) {
      if (c[f.col] != null) continue                       // already has a value
      if (status[f.col]?.state === 'data_unavailable') continue // terminal — skip

      let value: number | null = null
      try {
        const r = await withCircuitBreaker(supabase, BREAKER, () => queryWolfram(f.q(c.name), appId))
        const n = resultToNumber(r)
        if (n !== null && f.valid(n)) value = f.coerce(n)
      } catch (e) {
        if (e instanceof CircuitOpenError) { circuitOpen = true; break outer }
        // Treat unexpected query errors as a miss for this field.
      }

      const at = new Date().toISOString()
      if (value !== null) {
        updates[f.col] = value
        status[f.col] = { state: 'resolved', source: 'wolfram', at }
        touchedField = true
      } else {
        const attempts = (status[f.col]?.attempts ?? 0) + 1
        status[f.col] = { state: attempts >= MAX_ATTEMPTS ? 'data_unavailable' : 'pending', source: 'wolfram', attempts, at }
        touchedField = true
      }
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

  return jsonResponse({ success: true, enriched, examined, circuit_open: circuitOpen, dry_run: dryRun, results: results.slice(0, 50) }, 200, req)
})
