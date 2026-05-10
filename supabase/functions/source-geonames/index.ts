// ============================================================
// source-geonames — GeoNames cities TSV adapter
//
// Fetches cities1000/cities5000/cities15000 TSV dumps from geonames.org,
// parses, and stages into ingestion_staging for the city-ingestion pipeline.
//
// Body params:
//   dataset: 'cities15000' | 'cities5000' | 'cities1000' (default cities15000)
//   country_codes: string[] (optional ISO2 filter)
//   min_population: number (optional)
//   limit: number (optional, hard cap for safety)
//   pipeline_run_id: string (optional; auto-generated if absent)
//   dry_run: boolean
// ============================================================
import { getCorsHeaders, getServiceClient, jsonResponse, errorResponse } from '../_shared/supabase-client.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'

const SOURCE_NAME = 'geonames'
const SOURCE_TYPE = 'geonames'

// GeoNames cities TSV columns (per http://download.geonames.org/export/dump/readme.txt)
const COLS = [
  'geonameid','name','asciiname','alternatenames','latitude','longitude',
  'feature_class','feature_code','country_code','cc2','admin1_code','admin2_code',
  'admin3_code','admin4_code','population','elevation','dem','timezone','modification_date',
] as const
type GeoRow = Record<typeof COLS[number], string>

async function fetchTsv(dataset: string): Promise<string> {
  const url = `https://download.geonames.org/export/dump/${dataset}.zip`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`GeoNames ${res.status}: ${await res.text()}`)
  const buf = new Uint8Array(await res.arrayBuffer())
  const { unzipSync, strFromU8 } = await import('https://esm.sh/fflate@0.8.2')
  const files = unzipSync(buf)
  const txtName = Object.keys(files).find((k) => k.endsWith('.txt'))
  if (!txtName) throw new Error(`no .txt in ${dataset}.zip`)
  return strFromU8(files[txtName])
}

function parseRow(line: string): GeoRow | null {
  const parts = line.split('\t')
  if (parts.length < COLS.length) return null
  const row: Partial<GeoRow> = {}
  COLS.forEach((c, i) => { row[c] = parts[i] })
  return row as GeoRow
}

Deno.serve(withErrorReporting('source-geonames', async (req) => {
  const cors = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const supabase = getServiceClient()
  try {
    const body = await req.json().catch(() => ({}))
    const dataset = (body.dataset as string) ?? 'cities15000'
    if (!['cities15000','cities5000','cities1000','cities500'].includes(dataset)) {
      return errorResponse(`invalid dataset: ${dataset}`, 400, req)
    }
    const countryFilter = Array.isArray(body.country_codes)
      ? new Set((body.country_codes as string[]).map((s) => s.toUpperCase()))
      : null
    const minPop = Number(body.min_population ?? 0) || 0
    const hardLimit = Math.min(Number(body.limit ?? 100_000), 250_000)
    const dryRun = !!body.dry_run
    const pipelineRunId = (body.pipeline_run_id as string) ?? crypto.randomUUID()

    const tsv = await fetchTsv(dataset)
    const lines = tsv.split('\n')

    let parsed = 0, staged = 0, skipped = 0, kept = 0
    const stagingRows: Array<Record<string, unknown>> = []

    for (const line of lines) {
      if (!line || !line.trim()) continue
      const r = parseRow(line)
      if (!r) { skipped++; continue }
      parsed++
      if (r.feature_class !== 'P') { skipped++; continue }
      if (countryFilter && !countryFilter.has(r.country_code)) continue
      const pop = Number(r.population) || 0
      if (pop < minPop) continue
      if (kept >= hardLimit) break
      kept++

      const raw = {
        name: r.name,
        ascii_name: r.asciiname,
        alternate_names: r.alternatenames ? r.alternatenames.split(',').slice(0, 50) : null,
        latitude: Number(r.latitude),
        longitude: Number(r.longitude),
        country_code: r.country_code,
        admin1: r.admin1_code || null,
        admin2: r.admin2_code || null,
        population: pop,
        timezone: r.timezone || null,
        elevation: r.elevation ? Number(r.elevation) : null,
        geonames_id: r.geonameid,
        feature_code: r.feature_code,
      }
      stagingRows.push({
        raw_data: raw,
        entity_type: 'city',
        target_table: 'cities',
        source_name: SOURCE_NAME,
        source_type: SOURCE_TYPE,
        source_entity_id: `geonames:${r.geonameid}`,
        pipeline_run_id: pipelineRunId,
        disposition: 'pending',
        ai_validation_status: 'pending',
        dedup_status: 'pending',
      })
    }

    if (dryRun) {
      return jsonResponse({
        success: true, dry_run: true,
        dataset, parsed, kept, skipped,
        would_stage: stagingRows.length,
        pipeline_run_id: pipelineRunId,
      }, 200, req)
    }

    for (let i = 0; i < stagingRows.length; i += 100) {
      const batch = stagingRows.slice(i, i + 100)
      const { error, count } = await supabase.from('ingestion_staging').insert(batch, { count: 'exact' })
      if (error && !/duplicate key|unique/i.test(error.message)) {
        throw new Error(`stage: ${error.message}`)
      }
      staged += count ?? 0
    }

    return jsonResponse({
      success: true,
      dataset, parsed, kept, skipped,
      staged, pipeline_run_id: pipelineRunId,
      note: 'Staged. Run pipeline-normalize → -validate → -deduplicate → -commit (targetTable=cities) to commit.',
    }, 200, req)
  } catch (e) {
    console.error('source-geonames:', e)
    return errorResponse((e as Error).message, 500, req)
  }
}))
