import { getServiceClient, jsonResponse, errorResponse, corsResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import { withCircuitBreaker } from '../_shared/circuit-breaker.ts'
import type { SourceAdapter, RawItem, NormalizedItem, AdapterConfig } from '../_shared/source-adapter.ts'
import { writeToStaging } from '../_shared/source-adapter.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'

// ============================================================
// Source: REST Countries API
// Replaces: import-rest-countries
// ============================================================

// restcountries.com v3.1 was deprecated 2026-06 (301 → legacy.json returning an
// HTTP-200 deprecation error object; the new API requires a paid API key).
// mledoze/countries is the upstream dataset restcountries was built on — same
// field shapes for everything we consume except population/timezones/car,
// which commit_country_staging_item coalesces (existing values are kept).
// Flag URLs are rebuilt against flagcdn.com, the same CDN v3.1 served.
const RC_DATA_URL = 'https://raw.githubusercontent.com/mledoze/countries/master/countries.json'

const restCountriesAdapter: SourceAdapter = {
  name: 'rest-countries',
  entityType: 'country',

  async fetch(_config: AdapterConfig): Promise<RawItem[]> {
    const supabase = getServiceClient()

    const data = await withCircuitBreaker(supabase, 'rest_countries', async () => {
      const res = await fetch(RC_DATA_URL)
      if (!res.ok) throw new Error(`countries dataset fetch: ${res.status}`)
      const json = await res.json()
      if (!Array.isArray(json)) throw new Error('countries dataset: expected array')
      return json as Array<Record<string, unknown>>
    })

    return data.filter(c => c.cca2).map(c => {
      const code = String(c.cca2)
      const cc = code.toLowerCase()
      return {
        sourceId: code,
        data: {
          ...c,
          flags: { svg: `https://flagcdn.com/${cc}.svg`, png: `https://flagcdn.com/w320/${cc}.png` },
        },
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

Deno.serve(withErrorReporting('source-rest-countries', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const _auth = await requireInternalOrAdmin(req, getServiceClient()); if (_auth instanceof Response) return _auth
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
}))
