// ============================================================
// pipeline-enrich-personality
// Enriches staged personality rows by pulling from Wikidata:
//   - wikidata_qid (if missing)
//   - description, birth_date, death_date, profession, nationality,
//     birth_place, image_url, external_ids (imdb, viaf, isni, musicbrainz)
// Also runs a HEAD check on image_url to drop broken links.
// Writes everything into staging.enriched_data; never clobbers user input.
// ============================================================

import { getServiceClient, jsonResponse, errorResponse, corsResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'
import { resolveByNameAndProfession, readClaim as claimValue } from '../_shared/wikidata-resolve.ts'

const WD_EXT: Record<string, string> = {
  P345: 'imdb_id',
  P214: 'viaf',
  P213: 'isni',
  P434: 'musicbrainz_id',
  P646: 'freebase_id',
  P2002: 'twitter',
  P2003: 'instagram',
  P2013: 'facebook',
}

async function imageOk(url: string | null): Promise<boolean> {
  if (!url) return false
  if (!/^https?:\/\//i.test(url)) return false
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow', headers: { 'User-Agent': 'QueerGuide/1.0 (https://queer.guide; contact@queer.guide)' } })
    if (!res.ok) return false
    const ct = res.headers.get('content-type') ?? ''
    return ct.startsWith('image/')
  } catch { return false }
}

Deno.serve(withErrorReporting('pipeline-enrich-personality', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const _auth = await requireInternalOrAdmin(req, getServiceClient()); if (_auth instanceof Response) return _auth
  const supabase = getServiceClient()

  try {
    const body = await req.json().catch(() => ({}))
    const pipelineRunId = body.pipeline_run_id as string | undefined
    const batchSize = (body.batch_size as number) || 20
    const dryRun = body.dry_run as boolean || false
    const fetchWikidata = body.fetch_wikidata !== false
    const fetchImage    = body.fetch_image !== false

    let q = supabase.from('ingestion_staging')
      .select('id, raw_data, normalized_data, enriched_data')
      .eq('target_table', 'personalities')
      .eq('ai_validation_status', 'pending')
      .neq('enrichment_status', 'completed')
      .is('processed_at', null)
      .order('created_at', { ascending: true })
      .limit(batchSize)
    if (pipelineRunId) q = q.eq('pipeline_run_id', pipelineRunId)

    const { data: items, error } = await q
    if (error) return errorResponse(`load: ${error.message}`, 500, req)
    if (!items || !items.length) return jsonResponse({ success: true, items: 0, message: 'nothing to enrich' }, 200, req)

    let enriched = 0
    for (const item of items) {
      const n = (item.normalized_data ?? {}) as Record<string, unknown>
      const patch: Record<string, unknown> = {}
      const ext: Record<string, string> = { ...((n.external_ids as Record<string, string>) ?? {}) }

      if (fetchWikidata && !n.wikidata_qid && n.name) {
        // Require profession for disambiguation. Refuses name-only matches —
        // see wikidata-resolve.ts. Prevents the "Adult Performer with
        // basketball-player description" class of bug (614 polluted rows).
        const profession = (n.profession as string | undefined) ?? null
        const match = await resolveByNameAndProfession(String(n.name), profession)
        if (match) {
          const ent = match.entity
          patch.wikidata_qid = match.qid
          if (!n.description && match.description) patch.description = match.description
          const birth = claimValue(ent, 'P569')
          const death = claimValue(ent, 'P570')
          const image = claimValue(ent, 'P18')
          if (!n.birth_date && birth) patch.birth_date = formatDate(birth)
          if (!n.death_date && death) patch.death_date = formatDate(death)
          if (!n.image_url && image) patch.image_url = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(image)}`
          for (const [prop, key] of Object.entries(WD_EXT)) {
            const v = claimValue(ent, prop)
            if (v && !ext[key]) ext[key] = v
          }
        }
      }

      if (Object.keys(ext).length) patch.external_ids = ext

      // Image validation
      if (fetchImage) {
        const img = (patch.image_url as string) ?? (n.image_url as string)
        if (img) {
          const ok = await imageOk(img)
          if (!ok) {
            patch.image_url = null
            patch.sensitivity_flags = { ...(n.sensitivity_flags as Record<string, unknown> ?? {}), image_broken: true }
          }
        }
      }

      if (!dryRun) {
        const updatePayload: Record<string, unknown> = {
          enrichment_status: 'completed',
          updated_at: new Date().toISOString(),
        }
        if (Object.keys(patch).length) {
          updatePayload.enriched_data = { ...(item.enriched_data as Record<string, unknown> ?? {}), ...patch }
          updatePayload.normalized_data = { ...n, ...Object.fromEntries(Object.entries(patch).filter(([_, v]) => v !== null)) }
        }
        await supabase.from('ingestion_staging').update(updatePayload).eq('id', item.id)

        await supabase.from('ingestion_events').insert({
          staging_id: item.id, stage: 'enrich', new_status: 'enriched',
          actor: 'pipeline-enrich-personality',
          payload: { keys: Object.keys(patch) },
        })
      }
      enriched++
    }

    return jsonResponse({ success: true, items: enriched, items_processed: enriched, items_succeeded: enriched, dry_run: dryRun }, 200, req)
  } catch (error) {
    console.error('pipeline-enrich-personality:', error)
    return errorResponse((error as Error).message, 500, req)
  }
}))

function formatDate(v: string | null): string | null {
  if (!v) return null
  const m = v.match(/^\+?(-?\d{4})-(\d{2})-(\d{2})/)
  if (!m || m[1].startsWith('-')) return null
  const mm = m[2] === '00' ? '01' : m[2]
  const dd = m[3] === '00' ? '01' : m[3]
  return `${m[1].padStart(4, '0')}-${mm}-${dd}`
}
