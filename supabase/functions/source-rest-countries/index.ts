import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
import { withCircuitBreaker } from '../_shared/circuit-breaker.ts'
import type { SourceAdapter, RawItem, NormalizedItem, AdapterConfig } from '../_shared/source-adapter.ts'
import { writeToStaging } from '../_shared/source-adapter.ts'

// ============================================================
// Source: REST Countries API
// Replaces: import-rest-countries
// ============================================================

const RC_BASE = 'https://restcountries.com/v3.1/all'
// REST Countries has 10-field limit per request, so split into 2 calls
const FIELDS_1 = 'name,cca2,cca3,capital,region,subregion,population,area,latlng,flags'
const FIELDS_2 = 'name,cca2,languages,currencies,timezones,borders,landlocked,unMember,car,idd'

const restCountriesAdapter: SourceAdapter = {
  name: 'rest-countries',
  entityType: 'country',

  async fetch(config: AdapterConfig): Promise<RawItem[]> {
    const supabase = getServiceClient()

    const [data1, data2] = await withCircuitBreaker(supabase, 'rest_countries', async () => {
      const [res1, res2] = await Promise.all([
        fetch(`${RC_BASE}?fields=${FIELDS_1}`),
        fetch(`${RC_BASE}?fields=${FIELDS_2}`),
      ])
      if (!res1.ok) throw new Error(`REST Countries call 1: ${res1.status}`)
      if (!res2.ok) throw new Error(`REST Countries call 2: ${res2.status}`)
      return [await res1.json(), await res2.json()]
    })

    // Merge by cca2
    const map2 = new Map<string, Record<string, unknown>>()
    for (const c of data2 as Array<Record<string, unknown>>) {
      map2.set(String(c.cca2), c)
    }

    return (data1 as Array<Record<string, unknown>>).map(c => {
      const code = String(c.cca2)
      const extra = map2.get(code) || {}
      return {
        sourceId: code,
        data: { ...c, ...extra },
      }
    })
  },

  normalize(raw: RawItem): NormalizedItem {
    const d = raw.data as Record<string, unknown>
    const nameObj = d.name as Record<string, unknown>
    const latlng = d.latlng as number[] | undefined
    const flags = d.flags as Record<string, string> | undefined
    return {
      entityType: 'country',
      sourceId: raw.sourceId,
      sourceName: 'rest-countries',
      name: String(nameObj?.common || nameObj?.official || ''),
      description: '',
      location: {
        lat: latlng?.[0],
        lng: latlng?.[1],
        country: String(nameObj?.common || ''),
        countryCode: raw.sourceId,
      },
      images: flags?.svg ? [flags.svg] : flags?.png ? [flags.png] : [],
      metadata: {
        code: raw.sourceId,
        cca3: d.cca3,
        official_name: nameObj?.official,
        capital: (d.capital as string[])?.[0],
        region: d.region,
        subregion: d.subregion,
        population: d.population,
        area: d.area,
        languages: d.languages,
        currencies: d.currencies,
        timezones: d.timezones,
        borders: d.borders,
        landlocked: d.landlocked,
        un_member: d.unMember,
        driving_side: (d.car as Record<string, string>)?.side,
        calling_code: (d.idd as Record<string, unknown>)?.root,
        flag_svg: flags?.svg,
        flag_png: flags?.png,
      },
    }
  },
  getSourceId(raw: RawItem): string { return raw.sourceId },
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()
  try {
    const body = await req.json().catch(() => ({}))
    const config: AdapterConfig = {
      batchSize: body.batch_size || 250,
      dryRun: body.dry_run || false,
      pipelineRunId: body.pipeline_run_id, nodeId: body.node_id,
    }
    const rawItems = await restCountriesAdapter.fetch(config)
    if (config.dryRun) return jsonResponse({ success: true, items: rawItems.length, dry_run: true }, 200, req)
    const written = await writeToStaging(supabase, restCountriesAdapter, rawItems, { ...config, targetTable: 'countries' })
    return jsonResponse({ success: true, items: written, items_total: rawItems.length, items_processed: written, items_succeeded: written, items_failed: 0 }, 200, req)
  } catch (error) {
    return errorResponse((error as Error).message, 500, req)
  }
})
