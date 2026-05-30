// ============================================================
// backfill-personality-qids
// Iterates personalities missing wikidata_qid, matches them by name
// on Wikidata, fills qid + description/image/external_ids if blank.
// Designed to run in batches (admin-invoked or cron). Rate-limited
// to 3 req/s to respect Wikidata's terms.
// ============================================================

import { getServiceClient, jsonResponse, errorResponse, corsResponse, getCorsHeaders, requireAdmin } from '../_shared/supabase-client.ts'
import { resolveByNameAndProfession, readClaim as claim, readEntityLabel as wdLabel, readEntityDescription } from '../_shared/wikidata-resolve.ts'

const UA = 'QueerGuide/1.0 (https://queer.guide; contact@queer.guide)'
const WD_EXT: Record<string, string> = {
  P345: 'imdb_id', P214: 'viaf', P213: 'isni',
  P434: 'musicbrainz_id', P646: 'freebase_id',
  P2002: 'twitter', P2003: 'instagram', P2013: 'facebook',
}

async function wdEntity(qid: string) {
  const res = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`, { headers: { 'User-Agent': UA } })
  if (!res.ok) return null
  const data = await res.json()
  return data.entities?.[qid] ?? null
}

function fmtDate(v: string | null): string | null {
  if (!v) return null
  const m = v.match(/^\+?(-?\d{4})-(\d{2})-(\d{2})/)
  if (!m || m[1].startsWith('-')) return null
  const mm = m[2] === '00' ? '01' : m[2]
  const dd = m[3] === '00' ? '01' : m[3]
  return `${m[1].padStart(4, '0')}-${mm}-${dd}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: getCorsHeaders(req) })

  const supabase = getServiceClient()
  const auth = await requireAdmin(req, supabase)
  if (auth instanceof Response) return auth

  try {
    const body = await req.json().catch(() => ({}))
    const limit = Math.min((body.limit as number) || 50, 200)
    const dryRun = body.dry_run as boolean || false
    // `minScore` retained for API compatibility; disambiguation now happens
    // inside resolveByNameAndProfession (occupation overlap, not name-similarity).
    const _minScore = (body.min_match_score as number) || 0.7

    const mode = (body.mode as string) || 'qid' // 'qid' = find QIDs, 'enrich' = fill birth_place for those with QIDs

    let rows: Array<Record<string, unknown>> | null = null
    let error: { message: string } | null = null

    if (mode === 'enrich') {
      // Enrich personalities that have QID but missing birth_place
      const res = await supabase.from('personalities')
        .select('id, name, description, image_url, external_ids, birth_date, death_date, profession, nationality, wikidata_qid, birth_place')
        .not('wikidata_qid', 'is', null)
        .or('birth_place.is.null,birth_place.eq.')
        .is('city_id', null)
        .is('duplicate_of_id', null)
        .order('view_count', { ascending: false, nullsFirst: false })
        .limit(limit)
      rows = res.data
      error = res.error
    } else {
      const res = await supabase.from('personalities')
        .select('id, name, description, image_url, external_ids, birth_date, death_date, profession, nationality, birth_place')
        .is('wikidata_qid', null)
        .is('duplicate_of_id', null)
        .order('view_count', { ascending: false, nullsFirst: false })
        .limit(limit)
      rows = res.data
      error = res.error
    }
    if (error) return errorResponse(`load: ${error.message}`, 500, req)
    if (!rows?.length) return jsonResponse({ success: true, message: 'no rows need qid', scanned: 0 }, 200, req)

    let matched = 0, updated = 0, skipped = 0

    for (const row of rows) {
      // Politeness delay ~300ms per row
      await new Promise(r => setTimeout(r, 300))

      let qid: string | null = null
      let sim = 1.0
      let resolvedEntity: Record<string, unknown> | null = null
      let resolvedDescription: string | null = null

      if (mode === 'enrich') {
        // Already have QID
        qid = row.wikidata_qid as string
      } else {
        // Refuse to backfill rows without a profession — name-only matching
        // is what produced 614 polluted rows. Operator should set profession
        // before requesting a QID backfill.
        const profession = row.profession as string | null
        if (!profession || !profession.trim()) { skipped++; continue }
        const match = await resolveByNameAndProfession(String(row.name), profession)
        if (!match) { skipped++; continue }
        qid = match.qid
        sim = match.score
        resolvedEntity = match.entity
        resolvedDescription = match.description ?? readEntityDescription(match.entity)
      }

      matched++
      const patch: Record<string, unknown> = mode === 'enrich' ? {} : { wikidata_qid: qid }
      const ent = resolvedEntity ?? await wdEntity(qid!)
      if (ent) {
        if (!row.description && mode !== 'enrich') {
          const desc = resolvedDescription ?? readEntityDescription(ent)
          if (desc) patch.description = desc
        }
        if (!row.birth_date) { const b = fmtDate(claim(ent, 'P569')); if (b) patch.birth_date = b }
        if (!row.death_date) { const d = fmtDate(claim(ent, 'P570')); if (d) patch.death_date = d }
        if (!row.image_url) {
          const img = claim(ent, 'P18')
          if (img) patch.image_url = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(img)}`
        }
        // P19 = place of birth → birth_place
        if (!row.birth_place) {
          const placeQid = claim(ent, 'P19')
          if (placeQid) {
            const placeName = await wdLabel(placeQid)
            if (placeName) patch.birth_place = placeName
          }
        }
        // P27 = country of citizenship → nationality
        if (!row.nationality) {
          const citizenQid = claim(ent, 'P27')
          if (citizenQid) {
            const citizenName = await wdLabel(citizenQid)
            if (citizenName) patch.nationality = citizenName
          }
        }
        if (mode !== 'enrich') {
          const ext: Record<string, string> = { ...((row.external_ids as Record<string, string>) ?? {}) }
          for (const [prop, key] of Object.entries(WD_EXT)) {
            const v = claim(ent, prop)
            if (v && !ext[key]) ext[key] = v
          }
          if (Object.keys(ext).length) patch.external_ids = ext
        }
      }

      if (Object.keys(patch).length === 0) { skipped++; continue }

      if (!dryRun) {
        const { error: upErr } = await supabase.from('personalities')
          .update({ ...patch, last_refreshed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('id', row.id)
        if (!upErr) {
          updated++
          if (mode !== 'enrich') {
            await supabase.from('personality_sources').insert({
              personality_id: row.id,
              source_slug: 'wikidata-backfill',
              source_entity_id: qid,
              raw: { qid },
              confidence: sim,
            }).select().maybeSingle()
          }
        }
      } else {
        updated++
      }
    }

    return jsonResponse({ success: true, mode, scanned: rows.length, matched, updated, skipped, dry_run: dryRun }, 200, req)
  } catch (error) {
    console.error('backfill-personality-qids:', error)
    return errorResponse((error as Error).message, 500, req)
  }
})
