import { getServiceClient, jsonResponse, corsResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import { withCircuitBreaker, CircuitOpenError } from '../_shared/circuit-breaker.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'
import { researchEnrichVillageFromSources } from '../_shared/ai-enrichment.ts'
import { serveEnrichment } from '../_shared/enrichment-driver.ts'

// Pipeline Enrich (Queer Village).
//  - default (staging) mode: Wikipedia description + Wikidata + image enrichment of
//    pending queer_villages staging rows (ingestion pipeline). Batch lifecycle lives
//    in _shared/enrichment-driver.ts.
//  - agentic mode (body.mode='agentic'): Village Truth Engine. Grounds an LLM in the
//    village's own Wikipedia page + the LGBTQ+ venues we list there, rewrites the
//    generic history into a queer-specific one, and ROUTES every narrative overwrite
//    (history/description/editorial_hook) through village_review_queue. Only empty
//    notable_landmarks may auto-fill at confidence >= 0.8.

const UA = 'QueerGuideBot/1.0 (https://queer.guide; contact@queer.guide)'

// Full plain-text Wikipedia extract (not the short summary) for grounding.
async function fetchWikipediaExtract(query: string): Promise<{ url: string; text: string } | null> {
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&exsectionformat=plain&redirects=1&format=json&titles=${encodeURIComponent(query)}`
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
    if (!res.ok) return null
    const d = await res.json()
    const pages = d?.query?.pages ?? {}
    const page = Object.values(pages)[0] as { title?: string; extract?: string; missing?: string } | undefined
    if (!page || page.missing !== undefined || !page.extract) return null
    return { url: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title ?? query)}`, text: page.extract }
  } catch { return null }
}

// Replace the single open proposal for (village, field), satisfying uq_village_review_queue_open.
async function queueReview(
  supabase: ReturnType<typeof getServiceClient>,
  villageId: string,
  field: 'history' | 'description' | 'editorial_hook' | 'notable_landmarks',
  value: unknown,
  citations: unknown,
  confidence: number | null,
) {
  await supabase.from('village_review_queue')
    .delete().eq('village_id', villageId).eq('field', field).eq('status', 'open')
  await supabase.from('village_review_queue').insert({
    village_id: villageId, field,
    proposed_value: { value }, citations: citations ?? [],
    confidence, model: 'llm', status: 'open',
  })
}

async function agenticEnrichVillages(
  supabase: ReturnType<typeof getServiceClient>,
  batchLimit: number,
): Promise<Record<string, unknown>> {
  const { data: due, error } = await supabase.rpc('villages_due_for_refresh', { p_limit: batchLimit })
  if (error) throw new Error(`villages_due_for_refresh: ${error.message}`)
  const villages = (due ?? []) as { id: string; name: string; slug: string }[]
  let queued = 0, autoApplied = 0, skipped = 0, errored = 0

  for (const v of villages) {
    try {
      const { data: full } = await supabase.from('queer_villages')
        .select('id, name, history, notable_landmarks, city:cities!queer_villages_city_id_fkey(name), country:countries!queer_villages_country_id_fkey(name)')
        .eq('id', v.id).single()
      if (!full) { skipped++; continue }

      const cityName = (full as Record<string, unknown>).city ? ((full as Record<string, { name?: string }>).city?.name ?? '') : ''
      const countryName = (full as Record<string, unknown>).country ? ((full as Record<string, { name?: string }>).country?.name ?? '') : ''

      const { data: venueRows } = await supabase.from('venues')
        .select('name').eq('queer_village_id', v.id).is('duplicate_of_id', null).limit(25)
      const venueNames = (venueRows ?? []).map(r => String((r as { name?: string }).name ?? '')).filter(Boolean)

      const wiki = await withCircuitBreaker(supabase, 'wikipedia.api',
        () => fetchWikipediaExtract(v.name)) as { url: string; text: string } | null
      const sources = wiki ? [wiki] : []
      if (sources.length === 0) { skipped++; continue }

      const enrich = await withCircuitBreaker(supabase, 'llm.openai.village-enrich',
        () => researchEnrichVillageFromSources(supabase, {
          name: v.name, city: cityName, country: countryName,
          existingHistory: (full as { history?: string }).history ?? undefined,
          venueNames, sources,
        }))
      if (!enrich) { skipped++; continue }

      const conf = typeof enrich.confidence === 'number' ? enrich.confidence : null
      const cites = enrich.citations ?? []
      let touched = false

      // Narrative overwrites → always review-gated.
      if (enrich.history && enrich.history.trim().length > 80) {
        await queueReview(supabase, v.id, 'history', enrich.history.trim(), cites, conf); queued++; touched = true
      }
      if (enrich.description && enrich.description.trim().length > 20) {
        await queueReview(supabase, v.id, 'description', enrich.description.trim(), cites, conf); queued++; touched = true
      }
      if (enrich.editorial_hook && enrich.editorial_hook.trim().length > 0) {
        await queueReview(supabase, v.id, 'editorial_hook', enrich.editorial_hook.trim().slice(0, 120), cites, conf); queued++; touched = true
      }

      // notable_landmarks: auto-fill ONLY if currently empty and confidence high.
      const existingLandmarks = (full as { notable_landmarks?: string[] }).notable_landmarks ?? []
      const proposedLandmarks = (enrich.notable_landmarks ?? []).filter(s => typeof s === 'string' && s.trim().length > 0)
      if (proposedLandmarks.length > 0) {
        if (existingLandmarks.length === 0 && conf !== null && conf >= 0.8) {
          await supabase.from('queer_villages').update({
            notable_landmarks: proposedLandmarks.slice(0, 12),
            last_refreshed_at: new Date().toISOString(),
          }).eq('id', v.id)
          autoApplied++; touched = true
        } else {
          await queueReview(supabase, v.id, 'notable_landmarks', proposedLandmarks.slice(0, 12), cites, conf); queued++; touched = true
        }
      }

      // Stamp last_refreshed_at so the selector advances even when nothing actionable came back.
      await supabase.from('queer_villages').update({ last_refreshed_at: new Date().toISOString() }).eq('id', v.id)
      await supabase.from('village_quality_signals').insert({
        village_id: v.id, signal_type: 'enrichment',
        value: conf ?? 0, source: 'village-agentic-enrich',
        details: { queued: touched, has_wiki: !!wiki, venues: venueNames.length },
      })
      if (!touched) skipped++
    } catch (e) {
      errored++
      console.warn(`agentic-enrich village ${v.id}: ${e instanceof CircuitOpenError ? `circuit_open:${e.apiName}` : (e as Error).message}`)
    }
  }
  return { mode: 'agentic', examined: villages.length, queued, auto_applied: autoApplied, skipped, errored }
}

async function fetchWikipediaSummary(query: string): Promise<{ extract: string; thumbnail?: string } | null> {
  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
    if (!res.ok) return null
    const d = await res.json()
    return { extract: d.extract ?? '', thumbnail: d.thumbnail?.source ?? undefined }
  } catch { return null }
}

async function searchWikidata(name: string): Promise<{ qid: string; description: string } | null> {
  try {
    const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(name)}&language=en&format=json&limit=1&type=item`
    const res = await fetch(url, { headers: { 'User-Agent': UA } })
    if (!res.ok) return null
    const d = await res.json()
    const hit = d.search?.[0]
    if (!hit) return null
    return { qid: hit.id, description: hit.description ?? '' }
  } catch { return null }
}

async function fetchPexelsImage(query: string, apiKey: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`,
      { headers: { Authorization: apiKey } },
    )
    if (!res.ok) return null
    const d = await res.json()
    const photo = d.photos?.[0]
    return photo ? (photo.src?.large2x ?? photo.src?.large ?? null) : null
  } catch { return null }
}

// Staging-mode handler (driver-built); agentic requests are intercepted below.
const stagingHandler = serveEnrichment({
  fnName: 'pipeline-enrich-village',
  targetTables: ['queer_villages'],
  defaultBatchSize: 20,
  maxBatchSize: 50,
  async enrichItem(supabase, item, n) {
    const name = String(n.name ?? '').trim()
    if (!name) return 'skip'

    const pexelsKey = Deno.env.get('PEXELS_API_KEY') ?? ''
    let enrichError: string | null = null
    let wp: { extract: string; thumbnail?: string } | null = null
    let wd: { qid: string; description: string } | null = null
    let imageUrl: string | null = null

    try {
      const searchQuery = `${name} LGBT neighborhood`
      ;[wp, wd] = await Promise.all([
        withCircuitBreaker(supabase, 'wikipedia.api', () => fetchWikipediaSummary(searchQuery)),
        withCircuitBreaker(supabase, 'wikidata.api', () => searchWikidata(name)),
      ])
      if (!wp?.extract) {
        wp = await fetchWikipediaSummary(name)
      }
      if (pexelsKey) {
        imageUrl = await fetchPexelsImage(`${name} LGBT pride`, pexelsKey)
      }
      if (!imageUrl && wp?.thumbnail) {
        imageUrl = wp.thumbnail
      }
    } catch (e) {
      enrichError = e instanceof CircuitOpenError ? `circuit_open:${e.apiName}` : (e as Error).message
      console.warn(`enrich-village ${item.id}: ${enrichError}`)
    }

    const updates: Record<string, unknown> = { ...n }
    if (wp?.extract && !n.description) updates.description = wp.extract
    if (imageUrl && !n.image_url) updates.image_url = imageUrl
    const hasMerge = Object.keys(updates).length > Object.keys(n).length

    return {
      succeeded: !!(wp?.extract || wd),
      error: enrichError,
      mergedNormalized: hasMerge ? updates : null,
      enrichedData: {
        wikipedia_extract: wp?.extract ?? null,
        wikipedia_thumbnail: wp?.thumbnail ?? null,
        wikidata_qid: wd?.qid ?? null,
        wikidata_description: wd?.description ?? null,
        image_url: imageUrl,
        enriched_at: new Date().toISOString(),
      },
    }
  },
})

Deno.serve(withErrorReporting('pipeline-enrich-village', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)

  // Village Truth Engine — operates on LIVE villages, review-gated. Peek at the
  // body here; the staging path re-reads it from the clone passed on.
  const body = await req.clone().json().catch(() => ({}))
  if (body.mode === 'agentic') {
    const supabase = getServiceClient()
    const _auth = await requireInternalOrAdmin(req, supabase)
    if (_auth instanceof Response) return _auth
    const batchLimit = Math.min(20, Number(body.batch_limit ?? 8))
    const result = await agenticEnrichVillages(supabase, batchLimit)
    return jsonResponse({ success: true, ...result }, 200, req)
  }

  return stagingHandler(req)
}))
