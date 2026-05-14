import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'

// Source: Queer Villages — stages existing queer_villages rows for re-enrichment.
// Also pulls new entries from Wikidata LGBTQ+ neighborhood queries.

const WD_UA = 'QueerGuideBot/1.0 (https://queer.guide; contact@queer.guide)'

// Wikidata SPARQL: items instance-of (gay village / LGBT district / queer neighborhood)
const WIKIDATA_SPARQL = `
SELECT DISTINCT ?item ?itemLabel ?cityLabel ?countryLabel ?coord ?website WHERE {
  VALUES ?type { wd:Q4965757 wd:Q1414012 wd:Q105413060 }
  ?item wdt:P31 ?type .
  OPTIONAL { ?item wdt:P131 ?city }
  OPTIONAL { ?item wdt:P17 ?country }
  OPTIONAL { ?item wdt:P625 ?coord }
  OPTIONAL { ?item wdt:P856 ?website }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
} LIMIT 300
`

async function fetchFromWikidata(): Promise<Array<Record<string, unknown>>> {
  try {
    const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(WIKIDATA_SPARQL)}&format=json`
    const res = await fetch(url, {
      headers: { 'User-Agent': WD_UA, Accept: 'application/sparql-results+json' },
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) return []
    const data = await res.json()
    return data.results?.bindings ?? []
  } catch (e) {
    console.warn('Wikidata SPARQL failed:', (e as Error).message)
    return []
  }
}

Deno.serve(withErrorReporting('source-queer-villages', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()

  try {
    const body = await req.json().catch(() => ({}))
    const dryRun = body.dry_run === true
    const pipelineRunId = body.pipeline_run_id as string | undefined
    const nodeId        = body.node_id as string | undefined

    // Get existing village names to detect new ones
    const { data: existing } = await supabase
      .from('queer_villages')
      .select('name, slug')
      .limit(500)

    const existingNames = new Set((existing ?? []).map(v => v.name?.toLowerCase()))

    // Fetch from Wikidata
    const wdItems = await fetchFromWikidata()
    const newItems: Array<Record<string, unknown>> = []

    for (const item of wdItems) {
      const name = String(item.itemLabel?.value ?? '').trim()
      if (!name || name.startsWith('Q')) continue // skip un-labelled items
      if (existingNames.has(name.toLowerCase())) continue // already in DB

      const qid = String(item.item?.value ?? '').replace('http://www.wikidata.org/entity/', '')
      const coord = item.coord?.value as string | undefined
      let lat: number | null = null, lon: number | null = null
      if (coord) {
        const m = coord.match(/Point\(([^\s]+)\s+([^\s)]+)\)/)
        if (m) { lon = parseFloat(m[1]); lat = parseFloat(m[2]) }
      }

      newItems.push({
        entityType:  'queer_village',
        sourceId:    `wikidata-${qid}`,
        sourceName:  'wikidata',
        name,
        description: '',
        category:    'queer-village',
        location: {
          lat,
          lng: lon,
          city:    String(item.cityLabel?.value ?? ''),
          country: String(item.countryLabel?.value ?? ''),
        },
        urls:     item.website?.value ? [item.website.value] : [],
        tags:     ['lgbtq', 'queer-village'],
        metadata: { wikidata_qid: qid, wikidata_item: item },
      })
    }

    // Also stage existing villages that have missing description or image (for re-enrichment)
    const { data: needsEnrich } = await supabase
      .from('queer_villages')
      .select('id, name, slug, description, image_url, latitude, longitude')
      .or('description.is.null,description.eq.,image_url.is.null')
      .limit(100)

    const existingToEnrich: Array<Record<string, unknown>> = (needsEnrich ?? []).map(v => ({
      entityType:  'queer_village',
      sourceId:    `village-${v.id}`,
      sourceName:  'queer_villages_db',
      name:        v.name,
      description: v.description ?? '',
      category:    'queer-village',
      location:    { lat: v.latitude, lng: v.longitude },
      tags:        ['lgbtq', 'queer-village'],
      metadata:    { db_id: v.id, slug: v.slug },
    }))

    const allItems = [...newItems, ...existingToEnrich]

    if (dryRun) {
      return jsonResponse({
        success: true, dry_run: true,
        new_from_wikidata: newItems.length,
        existing_needs_enrich: existingToEnrich.length,
        items: allItems.length,
      }, 200, req)
    }

    let written = 0
    const batchSize = 50
    for (let i = 0; i < allItems.length; i += batchSize) {
      const batch = allItems.slice(i, i + batchSize)
      const rows = batch.map(item => ({
        source_name:       item.sourceName as string,
        entity_type:       'queer_village',
        target_table:      'queer_villages',
        source_entity_id:  item.sourceId as string,
        raw_data:          item,
        normalized_data:   item,
        enrichment_status: 'pending',
        dedup_status:      'pending',
        pipeline_run_id:   pipelineRunId ?? null,
        node_id:           nodeId ?? null,
      }))
      const { error } = await supabase.from('ingestion_staging').upsert(rows, {
        onConflict: 'source_name,source_entity_id',
        ignoreDuplicates: false,
      })
      if (error) console.error('village staging insert error:', error.message)
      else written += batch.length
    }

    return jsonResponse({
      success: true,
      items: written,
      items_total: allItems.length,
      items_processed: written,
      items_succeeded: written,
      items_failed: allItems.length - written,
      new_from_wikidata: newItems.length,
      existing_needs_enrich: existingToEnrich.length,
    }, 200, req)
  } catch (error) {
    console.error('source-queer-villages:', error)
    return errorResponse((error as Error).message, 500, req)
  }
}))
