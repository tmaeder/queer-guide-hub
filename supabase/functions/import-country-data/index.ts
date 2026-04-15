// import-country-data (SAFE REWRITE 2026-04-15) — no DB wipe; routes via ingestion_staging
import { getCorsHeaders, requireAdmin, getServiceClient, jsonResponse, errorResponse } from '../_shared/supabase-client.ts'

interface RestCountry {
  name: { common: string; official: string }
  cca2: string; cca3: string
  capital?: string[]
  region: string; subregion?: string
  languages?: Record<string, string>
  currencies?: Record<string, { name: string; symbol?: string }>
  latlng: [number, number]
  area: number; population: number
  timezones: string[]; continents: string[]
  flag: string
  flags: { png: string; svg: string; alt?: string }
  tld?: string[]
  idd?: { root?: string; suffixes?: string[] }
  car: { side: string }
  capitalInfo?: { latlng?: [number, number] }
}

const SOURCE_NAME = 'rest-countries'
const SOURCE_TYPE = 'api'

async function fetchRestCountries(): Promise<RestCountry[]> {
  const fields = ['name','cca2','cca3','capital','region','subregion','languages','currencies','latlng','area','population','timezones','continents','flag','flags','tld','idd','car','capitalInfo'].join(',')
  const res = await fetch(`https://restcountries.com/v3.1/all?fields=${fields}`, { headers: { 'User-Agent': 'Queer-Guide/1.0', Accept: 'application/json' } })
  if (!res.ok) throw new Error(`REST Countries ${res.status}: ${await res.text()}`)
  return res.json()
}

function stagedCountry(c: RestCountry) {
  const currency = c.currencies ? Object.values(c.currencies)[0]?.name ?? null : null
  const callingCode = c.idd?.root && c.idd?.suffixes?.[0] ? `${c.idd.root}${c.idd.suffixes[0]}` : null
  return {
    name: c.name.common, code: c.cca2, cca3: c.cca3,
    capital: c.capital?.[0] ?? null,
    region: c.region, subregion: c.subregion ?? null,
    latitude: c.latlng?.[0] ?? null, longitude: c.latlng?.[1] ?? null,
    area_km2: c.area ?? null, population: c.population ?? null,
    languages: c.languages ? Object.values(c.languages) : null,
    currency, timezone: c.timezones?.[0] ?? null,
    flag_emoji: c.flag, flag_png: c.flags?.png ?? null, flag_svg: c.flags?.svg ?? null,
    internet_tld: c.tld?.[0] ?? null, calling_code: callingCode,
    driving_side: c.car?.side ?? null, continent: c.continents?.[0] ?? null,
  }
}

function stagedCapitalCity(c: RestCountry) {
  if (!c.capital?.length) return null
  const lat = c.capitalInfo?.latlng?.[0] ?? c.latlng?.[0] ?? null
  const lng = c.capitalInfo?.latlng?.[1] ?? c.latlng?.[1] ?? null
  if (lat == null || lng == null) return null
  return { name: c.capital[0], country_code: c.cca2, country: c.name.common, latitude: lat, longitude: lng, is_capital: true, timezone: c.timezones?.[0] ?? null }
}

async function stageBatch(supabase: ReturnType<typeof getServiceClient>, rows: Array<{ raw: Record<string, unknown>; entity_type: string; target_table: string; source_entity_id: string }>, pipelineRunId: string) {
  let inserted = 0
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100).map((r) => ({
      raw_data: r.raw, entity_type: r.entity_type, target_table: r.target_table,
      source_name: SOURCE_NAME, source_type: SOURCE_TYPE, source_entity_id: r.source_entity_id,
      pipeline_run_id: pipelineRunId, disposition: 'pending',
      ai_validation_status: 'pending', dedup_status: 'pending',
    }))
    const { error, count } = await supabase.from('ingestion_staging').insert(batch, { count: 'exact' })
    if (error && !/duplicate key|unique/i.test(error.message)) throw new Error(`stage: ${error.message}`)
    inserted += count ?? 0
  }
  return inserted
}

async function invokePipeline(supabase: ReturnType<typeof getServiceClient>, fn: string, body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke(fn, { body })
  if (error) throw new Error(`${fn}: ${error.message}`)
  return data
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const supabase = getServiceClient()
  const auth = await requireAdmin(req, supabase)
  if (auth instanceof Response) return auth

  try {
    const body = await req.json().catch(() => ({}))
    const runPipeline = body.run_pipeline !== false
    const dryRun = !!body.dry_run
    const pipelineRunId = crypto.randomUUID()
    const countries = await fetchRestCountries()

    const countryRows = countries.map((c) => ({ raw: stagedCountry(c) as unknown as Record<string, unknown>, entity_type: 'country', target_table: 'countries', source_entity_id: c.cca2 }))
    const cityRows = countries.map(stagedCapitalCity).filter((x): x is NonNullable<ReturnType<typeof stagedCapitalCity>> => !!x).map((r) => ({ raw: r as unknown as Record<string, unknown>, entity_type: 'city', target_table: 'cities', source_entity_id: `${r.country_code}:${r.name}` }))

    if (dryRun) return jsonResponse({ success: true, dry_run: true, countries_to_stage: countryRows.length, cities_to_stage: cityRows.length, pipeline_run_id: pipelineRunId }, 200, req)

    const countriesStaged = await stageBatch(supabase, countryRows, pipelineRunId)
    const citiesStaged = await stageBatch(supabase, cityRows, pipelineRunId)

    let pipelineResults: Record<string, unknown> | null = null
    if (runPipeline) {
      try {
        const norm = await invokePipeline(supabase, 'pipeline-normalize', { pipeline_run_id: pipelineRunId, batch_size: 500 })
        const validate = await invokePipeline(supabase, 'pipeline-validate', { pipeline_run_id: pipelineRunId, batch_size: 500 })
        const dedup = await invokePipeline(supabase, 'pipeline-deduplicate', { pipeline_run_id: pipelineRunId, batch_size: 500 })
        const commitCountries = await invokePipeline(supabase, 'pipeline-commit', { pipeline_run_id: pipelineRunId, targetTable: 'countries', batch_size: 500 })
        const commitCities = await invokePipeline(supabase, 'pipeline-commit', { pipeline_run_id: pipelineRunId, targetTable: 'cities', batch_size: 500 })
        pipelineResults = { normalize: norm, validate, deduplicate: dedup, commit_countries: commitCountries, commit_cities: commitCities }
      } catch (e) {
        pipelineResults = { error: (e as Error).message, hint: 'Re-run from /admin/pipelines → country-ingestion' }
      }
    }

    return jsonResponse({
      success: true, pipeline_run_id: pipelineRunId,
      countries_fetched: countries.length,
      countries_staged: countriesStaged, cities_staged: citiesStaged,
      pipeline: pipelineResults,
      note: 'Data routed through ingestion_staging. LGBTI fields preserved via commit_country_staging_batch COALESCE semantics.',
    }, 200, req)
  } catch (error) {
    console.error('import-country-data:', error)
    return errorResponse((error as Error).message, 500, req)
  }
})
