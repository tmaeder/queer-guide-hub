// enrich-worldbank-population — refreshes countries.population from the World Bank
// API (SP.POP.TOTL, keyless). Needed because source-rest-countries switched to the
// static mledoze/countries dataset (2026-07-13) which carries no population, and
// commit_country_staging_item only preserves the existing value.
//
// One request (mrv=1) returns the most recent value for every country keyed by
// ISO2 (= countries.code); aggregates (EU areas, income groups) simply don't match
// any row. Only rows whose value actually changed are written.
//
// Auth: X-Internal-Secret (cron) or admin (requireInternalOrAdmin).
// Body: { dry_run?: boolean }

import { getServiceClient, requireInternalOrAdmin, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'

const WB_URL = 'https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL?format=json&mrv=1&per_page=400'

interface WbRow {
  country: { id: string; value: string }
  date: string
  value: number | null
}

interface FieldState { state: string; source: string; at: string; year?: string }

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse(req)

  const supabase = getServiceClient()
  const auth = await requireInternalOrAdmin(req, supabase)
  if (auth instanceof Response) return auth

  const body = await req.json().catch(() => ({}))
  const dryRun = body.dry_run === true

  const res = await fetch(WB_URL)
  if (!res.ok) return errorResponse(`worldbank fetch: ${res.status}`, 502, req)
  const payload = await res.json().catch(() => null) as [unknown, WbRow[]] | null
  const rows = Array.isArray(payload?.[1]) ? payload[1] : null
  if (!rows) return errorResponse('worldbank: unexpected payload shape', 502, req)

  // ISO2 → latest population (sanity-bounded; India ~1.46e9 is the ceiling case)
  const popByIso2 = new Map<string, { value: number; year: string }>()
  for (const r of rows) {
    if (r.value != null && r.value > 0 && r.value < 2.5e9 && r.country?.id) {
      popByIso2.set(r.country.id.toUpperCase(), { value: r.value, year: r.date })
    }
  }

  const { data, error } = await supabase
    .from('countries')
    .select('id, code, name, population, enrichment_status')
    .is('duplicate_of_id', null)
  if (error) return errorResponse(`load: ${error.message}`, 500, req)

  let updated = 0, unchanged = 0, unmatched = 0, failed = 0
  const changes: Array<Record<string, unknown>> = []

  for (const c of data ?? []) {
    const wb = c.code ? popByIso2.get(String(c.code).toUpperCase()) : undefined
    if (!wb) { unmatched++; continue }
    if (c.population === wb.value) { unchanged++; continue }

    changes.push({ code: c.code, name: c.name, from: c.population, to: wb.value, year: wb.year })
    if (dryRun) { updated++; continue }

    const status = (c.enrichment_status ?? {}) as Record<string, FieldState>
    status.population = { state: 'resolved', source: 'worldbank', year: wb.year, at: new Date().toISOString() }
    const { error: upErr } = await supabase
      .from('countries')
      .update({ population: wb.value, enrichment_status: status })
      .eq('id', c.id)
    if (upErr) { failed++; continue }
    updated++
  }

  return jsonResponse({
    success: failed === 0,
    updated, unchanged, unmatched, failed,
    dry_run: dryRun,
    changes: changes.slice(0, 300),
  }, 200, req)
})
