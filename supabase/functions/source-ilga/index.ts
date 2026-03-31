import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
import { withCircuitBreaker } from '../_shared/circuit-breaker.ts'
import type { SourceAdapter, RawItem, NormalizedItem, AdapterConfig } from '../_shared/source-adapter.ts'
import { writeToStaging } from '../_shared/source-adapter.ts'

// ============================================================
// Source: ILGA World Database (GraphQL)
// Replaces: import-ilga-data
// Fetches LGBTQ+ rights data for all countries
// ============================================================

const ILGA_URL = 'https://database.ilga.org/graphql'

const DATA_TYPES = [
  'criminalization', 'freedom_expression', 'freedom_association',
  'protection_constitutional', 'protection_employment', 'protection_goods_services',
  'protection_health', 'protection_education', 'protection_hate_crime',
  'protection_incitement', 'protection_housing', 'protection_bullying',
  'conversion_therapy', 'same_sex_unions', 'adoption',
  'intersex', 'gender_recognition',
]

async function ilgaQuery(query: string): Promise<unknown[]> {
  const res = await fetch(ILGA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error(`ILGA GraphQL ${res.status}`)
  const json = await res.json()
  if (json.errors) throw new Error(`ILGA GraphQL errors: ${JSON.stringify(json.errors[0])}`)
  const key = Object.keys(json.data || {})[0]
  return json.data?.[key] || []
}

function byA2(entries: Record<string, unknown>[]): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>()
  for (const e of entries) {
    const a2 = e.a2 as string
    const jur = e.jurisdiction as string
    if (a2 && (!jur || jur === 'National')) {
      map.set(a2, e)
    }
  }
  return map
}

const ilgaAdapter: SourceAdapter = {
  name: 'ilga',
  entityType: 'country',

  async fetch(config: AdapterConfig): Promise<RawItem[]> {
    const supabase = getServiceClient()
    const batchSize = config.batchSize || 10
    const requestedTypes = (config.filters?.dataTypes as string[]) || DATA_TYPES

    // Fetch all ILGA data in parallel
    const results = await withCircuitBreaker(supabase, 'ilga_graphql', async () => {
      const queries: Record<string, string> = {
        criminalization: '{ cspiSexualActss { a2 jurisdiction penalty max_prison death_penalty year_decriminalized } }',
        freedom_expression: '{ foes { a2 jurisdiction summary general education media_restrictions } }',
        freedom_association: '{ foas { a2 jurisdiction barrier } }',
        conversion_therapy: '{ cts { a2 jurisdiction type_name } }',
        same_sex_unions: '{ ssus { a2 jurisdiction type_name marriage civil_union year_marriage year_civil_union } }',
        adoption: '{ adoptions { a2 jurisdiction type_name } }',
        intersex: '{ pncs { a2 jurisdiction type_name } }',
        gender_recognition: '{ lgrs { a2 jurisdiction self_id marker_possible year } }',
      }

      // Add protection queries
      const protectionTypes = ['constitutional', 'employment', 'goods_services', 'health', 'education', 'hate_crime', 'incitement', 'housing', 'bullying']
      for (const pt of protectionTypes) {
        queries[`protection_${pt}`] = `{ protections(category: "${pt}") { a2 jurisdiction so_coverage gi_coverage ge_coverage sc_coverage year } }`
      }

      const fetchPromises = Object.entries(queries)
        .filter(([key]) => requestedTypes.some(t => key.startsWith(t) || key === t))
        .map(async ([key, query]) => {
          try {
            const data = await ilgaQuery(query)
            return [key, byA2(data as Record<string, unknown>[])] as const
          } catch (e) {
            console.error(`ILGA query "${key}" failed:`, (e as Error).message)
            return [key, new Map()] as const
          }
        })

      const results = await Promise.all(fetchPromises)
      return Object.fromEntries(results) as Record<string, Map<string, Record<string, unknown>>>
    })

    // Load countries from DB to match a2 codes
    const { data: countries } = await supabase
      .from('countries')
      .select('id, name, code')
      .order('lgbti_data_last_updated', { ascending: true, nullsFirst: true })
      .limit(batchSize)

    if (!countries || countries.length === 0) return []

    const items: RawItem[] = []

    for (const country of countries) {
      const code = country.code?.toUpperCase()
      if (!code) continue

      const countryData: Record<string, unknown> = {
        country_id: country.id,
        country_name: country.name,
        country_code: code,
      }

      // Collect all ILGA data for this country
      let hasData = false
      for (const [key, dataMap] of Object.entries(results)) {
        const entry = (dataMap as Map<string, Record<string, unknown>>).get(code)
        if (entry) {
          countryData[key] = entry
          hasData = true
        }
      }

      if (hasData) {
        // Calculate equality score
        countryData.equality_score = calculateEqualityScore(countryData)

        items.push({
          sourceId: code,
          data: countryData,
        })
      }
    }

    return items
  },

  normalize(raw: RawItem): NormalizedItem {
    const d = raw.data
    return {
      entityType: 'country',
      sourceId: raw.sourceId,
      sourceName: 'ilga',
      name: String(d.country_name || ''),
      description: `LGBTQ+ rights data for ${d.country_name}`,
      metadata: {
        country_id: d.country_id,
        code: d.country_code,
        equality_score: d.equality_score,
        lgbti_criminalization: d.criminalization ? mapCriminalization(d.criminalization as Record<string, unknown>) : null,
        lgbti_expression_restrictions: d.freedom_expression || null,
        lgbti_association_restrictions: d.freedom_association || null,
        lgbti_conversion_therapy_regulation: (d.conversion_therapy as Record<string, unknown>)?.type_name || null,
        lgbti_same_sex_unions: d.same_sex_unions ? JSON.stringify(d.same_sex_unions) : null,
        lgbti_adoption_rights: (d.adoption as Record<string, unknown>)?.type_name || null,
        lgbti_intersex_protection: (d.intersex as Record<string, unknown>)?.type_name || null,
        lgbti_gender_recognition: d.gender_recognition || null,
        // Protection fields
        ...Object.fromEntries(
          Object.entries(d)
            .filter(([k]) => k.startsWith('protection_'))
            .map(([k, v]) => [`lgbti_${k}`, v])
        ),
      },
    }
  },

  getSourceId(raw: RawItem): string {
    return raw.sourceId
  },
}

function mapCriminalization(data: Record<string, unknown>): Record<string, unknown> {
  return {
    penalty: data.penalty,
    max_prison: data.max_prison,
    death_penalty: data.death_penalty === true || data.death_penalty === 'Yes',
    year_decriminalized: data.year_decriminalized,
    is_legal: !data.penalty || data.penalty === 'Legal',
  }
}

function calculateEqualityScore(data: Record<string, unknown>): number {
  let score = 50 // baseline

  const crim = data.criminalization as Record<string, unknown> | undefined
  if (crim) {
    if (!crim.penalty || crim.penalty === 'Legal') score += 15
    else { score -= 25; if (crim.death_penalty) score -= 15 }
  }

  const ssu = data.same_sex_unions as Record<string, unknown> | undefined
  if (ssu) {
    if (ssu.marriage) score += 10
    else if (ssu.civil_union) score += 5
  }

  // Protection bonuses
  for (const [key, val] of Object.entries(data)) {
    if (key.startsWith('protection_') && val) {
      const prot = val as Record<string, unknown>
      if (prot.so_coverage) score += 2
      if (prot.gi_coverage) score += 1
    }
  }

  const ct = data.conversion_therapy as Record<string, unknown> | undefined
  if (ct?.type_name && String(ct.type_name).toLowerCase().includes('ban')) score += 3

  const adoption = data.adoption as Record<string, unknown> | undefined
  if (adoption?.type_name) {
    if (String(adoption.type_name).includes('Joint')) score += 3
    else if (String(adoption.type_name).includes('Second')) score += 2
  }

  const gr = data.gender_recognition as Record<string, unknown> | undefined
  if (gr?.self_id) score += 3
  else if (gr?.marker_possible) score += 1

  return Math.max(0, Math.min(100, score))
}

// ─── HTTP Handler ────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)

  const supabase = getServiceClient()

  try {
    const body = await req.json().catch(() => ({}))
    const config: AdapterConfig = {
      batchSize: body.batchSize || body.batch_size || 10,
      filters: { dataTypes: body.dataTypes, country_code: body.country_code },
      dryRun: body.dry_run || false,
      pipelineRunId: body.pipeline_run_id,
      nodeId: body.node_id,
    }

    const rawItems = await ilgaAdapter.fetch(config)

    if (config.dryRun) {
      return jsonResponse({ success: true, items: rawItems.length, dry_run: true }, 200, req)
    }

    const written = await writeToStaging(supabase, ilgaAdapter, rawItems, {
      ...config,
      targetTable: 'countries',
    })

    return jsonResponse({
      success: true,
      items: written,
      items_total: rawItems.length,
      items_processed: written,
      items_succeeded: written,
      items_failed: 0,
    }, 200, req)
  } catch (error) {
    console.error('source-ilga error:', error)
    return errorResponse((error as Error).message, 500, req)
  }
})
