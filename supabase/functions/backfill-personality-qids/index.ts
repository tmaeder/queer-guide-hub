// ============================================================
// backfill-personality-qids
// Iterates personalities missing wikidata_qid, matches them by name
// on Wikidata, fills qid + description/image/external_ids if blank.
// Designed to run in batches (admin-invoked or cron). Rate-limited
// to 3 req/s to respect Wikidata's terms.
// ============================================================

import { getServiceClient, jsonResponse, errorResponse, corsResponse, getCorsHeaders, requireAdmin } from '../_shared/supabase-client.ts'

const UA = 'QueerGuide/1.0 (https://queer.guide; contact@queer.guide)'
const WD_EXT: Record<string, string> = {
  P345: 'imdb_id', P214: 'viaf', P213: 'isni',
  P434: 'musicbrainz_id', P646: 'freebase_id',
  P2002: 'twitter', P2003: 'instagram', P2013: 'facebook',
}

async function wdSearch(name: string) {
  const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(name)}&language=en&format=json&limit=3`
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) return null
  const data = await res.json()
  return data.search?.[0] ?? null
}

async function wdEntity(qid: string) {
  const res = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`, { headers: { 'User-Agent': UA } })
  if (!res.ok) return null
  const data = await res.json()
  return data.entities?.[qid] ?? null
}

function claim(entity: Record<string, unknown>, prop: string): string | null {
  const c = (entity.claims as Record<string, unknown>)?.[prop] as Array<Record<string, unknown>> | undefined
  if (!c?.length) return null
  const m = (c[0].mainsnak as Record<string, unknown>)?.datavalue as Record<string, unknown> | undefined
  if (!m) return null
  const v = m.value
  if (typeof v === 'string') return v
  if (typeof v === 'object' && v !== null) {
    const vv = v as Record<string, unknown>
    return (vv.id as string) ?? (vv.time as string) ?? (vv.text as string) ?? null
  }
  return null
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
    const minScore = (body.min_match_score as number) || 0.7

    const { data: rows, error } = await supabase.from('personalities')
      .select('id, name, description, image_url, external_ids, birth_date, death_date, profession, nationality')
      .is('wikidata_qid', null)
      .order('view_count', { ascending: false, nullsFirst: false })
      .limit(limit)
    if (error) return errorResponse(`load: ${error.message}`, 500, req)
    if (!rows?.length) return jsonResponse({ success: true, message: 'no rows need qid', scanned: 0 }, 200, req)

    let matched = 0, updated = 0, skipped = 0

    for (const row of rows) {
      // Politeness delay ~300ms per row
      await new Promise(r => setTimeout(r, 300))

      const hit = await wdSearch(row.name)
      if (!hit?.id) { skipped++; continue }

      // Basic similarity sanity check
      const label = String(hit.label ?? '').toLowerCase()
      const nameL = String(row.name).toLowerCase()
      const sim = label === nameL ? 1.0 : (label.includes(nameL) || nameL.includes(label) ? 0.85 : 0.6)
      if (sim < minScore) { skipped++; continue }

      matched++
      const patch: Record<string, unknown> = { wikidata_qid: hit.id }
      const ent = await wdEntity(hit.id)
      if (ent) {
        if (!row.description && hit.description) patch.description = hit.description
        if (!row.birth_date) { const b = fmtDate(claim(ent, 'P569')); if (b) patch.birth_date = b }
        if (!row.death_date) { const d = fmtDate(claim(ent, 'P570')); if (d) patch.death_date = d }
        if (!row.image_url) {
          const img = claim(ent, 'P18')
          if (img) patch.image_url = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(img)}`
        }
        const ext: Record<string, string> = { ...((row.external_ids as Record<string, string>) ?? {}) }
        for (const [prop, key] of Object.entries(WD_EXT)) {
          const v = claim(ent, prop)
          if (v && !ext[key]) ext[key] = v
        }
        if (Object.keys(ext).length) patch.external_ids = ext
      }

      if (!dryRun) {
        const { error: upErr } = await supabase.from('personalities')
          .update({ ...patch, last_refreshed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('id', row.id)
        if (!upErr) {
          updated++
          await supabase.from('personality_sources').insert({
            personality_id: row.id,
            source_slug: 'wikidata-backfill',
            source_entity_id: hit.id,
            raw: { hit, qid: hit.id },
            confidence: sim,
          }).select().maybeSingle()
        }
      } else {
        updated++
      }
    }

    return jsonResponse({ success: true, scanned: rows.length, matched, updated, skipped, dry_run: dryRun }, 200, req)
  } catch (error) {
    console.error('backfill-personality-qids:', error)
    return errorResponse((error as Error).message, 500, req)
  }
})
