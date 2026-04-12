import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
import { withCircuitBreaker } from '../_shared/circuit-breaker.ts'
import type { SourceAdapter, RawItem, NormalizedItem, AdapterConfig } from '../_shared/source-adapter.ts'
import { writeToStaging } from '../_shared/source-adapter.ts'

// ============================================================
// Source: Travelpayouts Airport Reference Data
// Replaces: import-airports-data
// ============================================================

const AIRPORTS_URL = 'https://api.travelpayouts.com/data/en/airports.json'
const CITIES_URL = 'https://api.travelpayouts.com/data/en/cities.json'

const airportsAdapter: SourceAdapter = {
  name: 'airports',
  entityType: 'airport',

  async fetch(_config: AdapterConfig): Promise<RawItem[]> {
    const supabase = getServiceClient()

    const [airportsData, citiesData] = await withCircuitBreaker(supabase, 'travelpayouts', async () => {
      const [aRes, cRes] = await Promise.all([fetch(AIRPORTS_URL), fetch(CITIES_URL)])
      if (!aRes.ok) throw new Error(`Airports API ${aRes.status}`)
      if (!cRes.ok) throw new Error(`Cities API ${cRes.status}`)
      return [await aRes.json(), await cRes.json()]
    })

    // Build city name lookup
    const cityNames = new Map<string, string>()
    for (const city of citiesData as Array<Record<string, string>>) {
      if (city.code && city.name) cityNames.set(city.code, city.name)
    }

    return (airportsData as Array<Record<string, unknown>>)
      .filter(a => a.iata_type === 'airport' && a.code)
      .map(a => ({
        sourceId: String(a.code),
        data: { ...a, city_name: cityNames.get(String(a.city_code || '')) || '' },
      }))
  },

  normalize(raw: RawItem): NormalizedItem {
    const d = raw.data as Record<string, unknown>
    const coords = d.coordinates as Record<string, number> | undefined
    return {
      entityType: 'airport',
      sourceId: raw.sourceId,
      sourceName: 'travelpayouts',
      name: String(d.name || raw.sourceId),
      location: {
        lat: coords?.lat || undefined,
        lng: coords?.lon || undefined,
        city: String(d.city_name || ''),
        countryCode: String(d.country_code || ''),
      },
      metadata: {
        iata_code: raw.sourceId,
        city_iata: d.city_code,
        city_name: d.city_name,
        country_code: d.country_code,
        is_major: raw.sourceId === d.city_code,
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
      batchSize: body.batch_size || 500,
      dryRun: body.dry_run || false,
      pipelineRunId: body.pipeline_run_id, nodeId: body.node_id,
    }
    const rawItems = await airportsAdapter.fetch(config)
    if (config.dryRun) return jsonResponse({ success: true, items: rawItems.length, dry_run: true }, 200, req)
    const written = await writeToStaging(supabase, airportsAdapter, rawItems, { ...config, targetTable: 'airports' })
    return jsonResponse({ success: true, items: written, items_total: rawItems.length, items_processed: written, items_succeeded: written, items_failed: 0 }, 200, req)
  } catch (error) {
    return errorResponse((error as Error).message, 500, req)
  }
})
