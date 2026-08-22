import {
  getServiceClient,
  jsonResponse,
  errorResponse,
  corsResponse,
  requireInternalOrAdmin,
} from '../_shared/supabase-client.ts'
import { withCircuitBreaker } from '../_shared/circuit-breaker.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'

// ============================================================================
// TGEU Trans Murder Monitoring → countries.trans_violence_documented
// ----------------------------------------------------------------------------
// Writes DIRECTLY to `countries`, not through ingestion_staging — the
// import-ilga-data precedent for reference/statistical data. There is no entity
// to dedupe, quality-score or review-gate here; there are 90 numbers.
//
// AGGREGATES ONLY. TMM publishes no names, no photos, no source URLs and no
// cause of death — the case records are de-identified by TGEU's own design, and
// this importer never requests them.
//
// FOUR TRAPS IN THIS API, all measured against the live endpoint on 2026-09-16.
// Every one of them yields a plausible wrong number rather than an error, which
// is why each has an assertion rather than a comment:
//
//   1. `doc_count` IS NOT THE CASE COUNT. Uwazi stores one document per
//      language, so `doc_count` summed over countries is 26,610 against a real
//      corpus of 5,320 — a 5x overcount. `filtered.doc_count` is the true
//      figure. Publishing five times the number of murdered trans people would
//      have been the single worst defect available here.
//   2. The country aggregation is TWO LEVELS DEEP. `buckets[]` holds 22 REGIONS
//      ("South Europe, Europe"); the countries are in `buckets[].values[]`.
//      Iterating the top level yields regions masquerading as countries.
//   3. LABELS ARE NOT UNIQUE. "Mexico" appears under two thesaurus ids, 809
//      under Central America and 3 under South America. Taking the first match
//      silently drops 3 people; the counts must be SUMMED per label.
//   4. The period aggregation contains an "Any" bucket equal to the entire
//      corpus, so the 19 buckets are 18 real periods plus a total that would
//      double every sum.
//
// The frontend's rison `q=(...)` param is a UI route param and is REJECTED by
// this API ("must NOT have additional properties"). Filters go as flat
// bracketed query params.
// ============================================================================

const TMM_ORIGIN = 'https://transmurdermonitoring.tgeu.org'
const TMM_PUBLIC_URL = `${TMM_ORIGIN}/`
const COUNTRY_AGG = 'country_territory_of_the_murder'
const PERIOD_AGG = 'tdor_period__oct_sept_'

/** The bucket that repeats the whole corpus. Never a period. */
const PERIOD_TOTAL_LABEL = 'Any'

interface Bucket {
  key: string
  label?: string
  doc_count?: number
  filtered?: { doc_count?: number }
  values?: Bucket[]
}

interface SearchResponse {
  totalRows?: number
  aggregations?: { all?: Record<string, { buckets?: Bucket[] }> }
  error?: string
  prettyMessage?: string
}

async function tmmSearch(params: Record<string, string>): Promise<SearchResponse> {
  const url = new URL('/api/search', TMM_ORIGIN)
  url.searchParams.set('limit', '0')
  url.searchParams.set('allAggregations', 'true')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  const res = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
      // Identify ourselves to a small nonprofit's server rather than arriving
      // as an anonymous scraper.
      'User-Agent': 'QueerGuide/1.0 (+https://queer.guide; aggregate counts only)',
    },
  })
  if (!res.ok) throw new Error(`TMM ${url.pathname}${url.search}: HTTP ${res.status}`)

  const json = (await res.json()) as SearchResponse
  // The API answers a bad request with HTTP 200 and an `error` key.
  if (json.error) throw new Error(`TMM API: ${json.prettyMessage ?? json.error}`)
  return json
}

/** Trap 1 + 2 + 3: descend into values[], read `filtered`, sum duplicate labels. */
function countryCountsFrom(json: SearchResponse): Map<string, number> {
  const regions = json.aggregations?.all?.[COUNTRY_AGG]?.buckets ?? []
  const out = new Map<string, number>()
  for (const region of regions) {
    for (const entry of region.values ?? []) {
      const label = (entry.label ?? '').trim()
      if (!label) continue
      const n = entry.filtered?.doc_count ?? 0
      if (n > 0) out.set(label, (out.get(label) ?? 0) + n)
    }
  }
  return out
}

/** Trap 4: drop the "Any" bucket. */
function periodCountsFrom(json: SearchResponse): Map<string, { key: string; count: number }> {
  const buckets = json.aggregations?.all?.[PERIOD_AGG]?.buckets ?? []
  const out = new Map<string, { key: string; count: number }>()
  for (const b of buckets) {
    const label = (b.label ?? '').trim()
    if (!label || label === PERIOD_TOTAL_LABEL) continue
    out.set(label, { key: b.key, count: b.filtered?.doc_count ?? 0 })
  }
  return out
}

const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0)

Deno.serve(
  withErrorReporting('import-tgeu-tmm', async (req) => {
    if (req.method === 'OPTIONS') return corsResponse(req)
    const supabase = getServiceClient()
    const _auth = await requireInternalOrAdmin(req, supabase)
    if (_auth instanceof Response) return _auth

    try {
      const body = await req.json().catch(() => ({}))
      const dryRun: boolean = body.dry_run === true
      const withPeriods: boolean = body.periods !== false

      const fetched = await withCircuitBreaker(supabase, 'tgeu.tmm', async () => {
        const overall = await tmmSearch({})

        const totalRows = overall.totalRows ?? 0
        const countryTotals = countryCountsFrom(overall)
        const periods = periodCountsFrom(overall)

        // DIGEST GATE. The per-country figures must reconstruct the corpus
        // exactly. This is what catches trap 1: with `doc_count` this sum is
        // 26,610 against a totalRows of 5,320 and the run aborts instead of
        // publishing a 5x overcount. It equally catches a future shape change.
        const countrySum = sum(countryTotals)
        if (totalRows <= 0) throw new Error('TMM returned no totalRows; refusing to write')
        if (countrySum !== totalRows) {
          throw new Error(
            `TMM digest mismatch: per-country sum ${countrySum} != totalRows ${totalRows}. ` +
              `Aggregation shape likely changed; refusing to write.`,
          )
        }

        // Per-period country breakdown. Each filtered response is checked
        // against the period total we already hold, so a filter that is
        // silently ignored (returning the whole corpus) can never be stored as
        // if it were one period.
        const byCountryPeriod = new Map<string, Record<string, number>>()
        const periodErrors: string[] = []

        if (withPeriods) {
          for (const [label, { key, count }] of periods) {
            if (count <= 0) continue
            try {
              const scoped = await tmmSearch({
                [`filters[${PERIOD_AGG}][values][]`]: key,
              })
              if ((scoped.totalRows ?? -1) !== count) {
                throw new Error(
                  `filter not applied (totalRows ${scoped.totalRows} != expected ${count})`,
                )
              }
              const perCountry = countryCountsFrom(scoped)
              if (sum(perCountry) !== count) {
                throw new Error(`period digest mismatch (${sum(perCountry)} != ${count})`)
              }
              for (const [country, n] of perCountry) {
                const rec = byCountryPeriod.get(country) ?? {}
                rec[label] = n
                byCountryPeriod.set(country, rec)
              }
            } catch (e) {
              periodErrors.push(`${label}: ${(e as Error).message}`)
            }
          }
        }

        // All-or-nothing on the series. A partial breakdown would render as a
        // trend line with silent holes in it, which reads as "violence stopped
        // that year" — strictly worse than showing only the total.
        const periodsUsable = withPeriods && periodErrors.length === 0

        return {
          totalRows,
          countryTotals,
          periodLabels: [...periods.keys()].sort(),
          byCountryPeriod: periodsUsable ? byCountryPeriod : new Map<string, Record<string, number>>(),
          periodsUsable,
          periodErrors,
        }
      })

      // ------------------------------------------------------------------
      // Resolve labels → countries. BLOCKS, never guesses: a wrong country_id
      // here attributes murders to a place they did not happen in.
      // ------------------------------------------------------------------
      // All 250 rows, matched case-insensitively in TS, rather than
      // `.in('name', labels)`. Two reasons, both silent-failure modes: PostgREST's
      // `in` is case-SENSITIVE, so a country whose stored name differs only in
      // case would never be fetched and would land in `unmatched` looking like a
      // missing country; and it would put 90 labels including "Côte d'Ivoire"
      // through URL escaping for no gain. 250 rows is a trivial fetch.
      const { data: rows, error: selErr } = await supabase
        .from('countries')
        .select('id, name')
      if (selErr) throw new Error(`countries lookup: ${selErr.message}`)

      const byName = new Map<string, { id: string; name: string }[]>()
      for (const r of (rows ?? []) as { id: string; name: string }[]) {
        const k = r.name.trim().toLowerCase()
        const list = byName.get(k) ?? []
        list.push({ id: r.id, name: r.name })
        byName.set(k, list)
      }

      const resolved: { id: string; label: string; total: number }[] = []
      const unmatched: { label: string; total: number; reason: string }[] = []

      for (const [label, total] of fetched.countryTotals) {
        const hits = byName.get(label.trim().toLowerCase()) ?? []
        if (hits.length === 1) {
          resolved.push({ id: hits[0].id, label, total })
        } else {
          unmatched.push({
            label,
            total,
            reason: hits.length === 0 ? 'no_country_row' : `ambiguous_${hits.length}_matches`,
          })
        }
      }

      const fetchedAt = new Date().toISOString()
      const digest = {
        total_rows: fetched.totalRows,
        countries_reported: fetched.countryTotals.size,
        countries_resolved: resolved.length,
        cases_resolved: resolved.reduce((a, r) => a + r.total, 0),
        cases_unmatched: unmatched.reduce((a, r) => a + r.total, 0),
        periods: fetched.periodLabels.length,
        periods_usable: fetched.periodsUsable,
        period_errors: fetched.periodErrors,
        unmatched,
      }

      if (dryRun) {
        return jsonResponse({ success: true, dry_run: true, ...digest }, 200, req)
      }

      // ------------------------------------------------------------------
      // Write. One statement per country; `countries` UPDATE reaches the search
      // sync one hop away via the geo spine, and that path enqueues rather than
      // indexing inline, so 90 rows is cheap.
      // ------------------------------------------------------------------
      let updated = 0
      const writeErrors: string[] = []
      for (const r of resolved) {
        const byPeriod = fetched.byCountryPeriod.get(r.label) ?? {}
        const payload: Record<string, unknown> = {
          source: 'TGEU Trans Murder Monitoring',
          source_url: TMM_PUBLIC_URL,
          total: r.total,
          fetched_at: fetchedAt,
        }
        if (fetched.periodsUsable && Object.keys(byPeriod).length > 0) {
          payload.by_period = byPeriod
        }
        const { error } = await supabase
          .from('countries')
          .update({ trans_violence_documented: payload })
          .eq('id', r.id)
        if (error) writeErrors.push(`${r.label}: ${error.message}`)
        else updated += 1
      }

      // Clear countries that are no longer reported. Safe ONLY because the
      // digest gate above proved this run saw the whole corpus; without it a
      // truncated response would silently erase every record.
      //
      // The stale set is computed in TS over 250 rows rather than with a
      // PostgREST `.neq('trans_violence_documented', '{}')`: that compares a
      // jsonb column against a string literal and its casting behaviour is not
      // something to guess at when guessing wrong means wiping the column.
      const keepIds = new Set(resolved.map((r) => r.id))
      const { data: allRows, error: scanErr } = await supabase
        .from('countries')
        .select('id, trans_violence_documented')
      if (scanErr) writeErrors.push(`stale scan: ${scanErr.message}`)

      let cleared = 0
      for (const row of (allRows ?? []) as {
        id: string
        trans_violence_documented: unknown
      }[]) {
        if (keepIds.has(row.id)) continue
        const blob = row.trans_violence_documented
        if (!blob || typeof blob !== 'object' || Object.keys(blob).length === 0) continue
        const { error } = await supabase
          .from('countries')
          .update({ trans_violence_documented: {} })
          .eq('id', row.id)
        if (error) writeErrors.push(`clear ${row.id}: ${error.message}`)
        else cleared += 1
      }

      return jsonResponse(
        {
          success: writeErrors.length === 0,
          ...digest,
          updated,
          cleared,
          write_errors: writeErrors,
          items_total: resolved.length,
          items_processed: updated,
          items_succeeded: updated,
          items_failed: writeErrors.length,
        },
        200,
        req,
      )
    } catch (error) {
      return errorResponse((error as Error).message, 500, req)
    }
  }),
)
