// Loop A — continuous refresh of EXISTING personalities.
// Pulls the highest-priority stale/incomplete records from
// personality_data_health, fetches Wikidata + Wikipedia, fills ONLY blank
// columns (never clobbers curated data), writes a personality_sources
// provenance row, stamps last_refreshed_at, recomputes quality_score.

import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'
import { fillBlanks, parseWikipediaSummary } from '../_shared/personality-enrich-core.ts'
import { personalityQualityScore } from '../_shared/personality-quality.ts'
import { resolvePersonality } from '../_shared/wikidata-resolve.ts'
import { deriveLgbtiConnection, deriveConnectionFromCategories, combineConnection, shouldUpgradeConnection, type LgbtiDerivation } from '../_shared/lgbti-connection.ts'

const UA = 'QueerGuide/1.0 (https://queer.guide; contact@queer.guide)'
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const WD_EXT: Record<string, string> = {
  P345: 'imdb_id', P214: 'viaf', P213: 'isni', P434: 'musicbrainz_id',
  P646: 'freebase_id', P2002: 'twitter', P2003: 'instagram', P2013: 'facebook',
}

async function wdEntity(qid: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`, { headers: { 'User-Agent': UA } })
    const data = await res.json()
    return data.entities?.[qid] ?? null
  } catch { return null }
}
function claimValue(entity: Record<string, unknown>, prop: string): string | null {
  const claims = (entity.claims as Record<string, unknown>)?.[prop] as Array<Record<string, unknown>> | undefined
  if (!claims?.length) return null
  const main = (claims[0].mainsnak as Record<string, unknown>)?.datavalue as Record<string, unknown> | undefined
  if (!main) return null
  const v = main.value
  if (typeof v === 'string') return v
  if (typeof v === 'object' && v !== null) {
    const vv = v as Record<string, unknown>
    return (vv.id as string) ?? (vv.time as string) ?? (vv.text as string) ?? null
  }
  return null
}
// A real Wikidata item id, not a 'SKIP_<uuid>' sentinel (written to mark "no
// Wikidata match, don't retry"). SKIP rows are not anchored and must not drive
// entity fetches, connection derivation, or provenance.
function isRealQid(q: unknown): q is string {
  return typeof q === 'string' && /^Q[0-9]+$/.test(q)
}
// All QID values for a (possibly multi-valued) entity property — e.g. P91, P21.
function claimQids(entity: Record<string, unknown>, prop: string): string[] {
  const claims = (entity.claims as Record<string, unknown>)?.[prop] as Array<Record<string, unknown>> | undefined
  if (!claims?.length) return []
  const ids: string[] = []
  for (const c of claims) {
    const v = (c.mainsnak as Record<string, unknown>)?.datavalue as Record<string, unknown> | undefined
    const id = (v?.value as Record<string, unknown>)?.id as string | undefined
    if (id) ids.push(id)
  }
  return ids
}
function formatDate(v: string | null): string | null {
  if (!v) return null
  const m = v.match(/^\+?(-?\d{4})-(\d{2})-(\d{2})/)
  if (!m || m[1].startsWith('-')) return null
  const mm = m[2] === '00' ? '01' : m[2]
  const dd = m[3] === '00' ? '01' : m[3]
  return `${m[1].padStart(4, '0')}-${mm}-${dd}`
}
async function imageOk(url: string | null): Promise<boolean> {
  if (!url || !/^https?:\/\//i.test(url)) return false
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow' })
    return res.ok && (res.headers.get('content-type') ?? '').startsWith('image/')
  } catch { return false }
}
function wikiSitelinkTitle(entity: Record<string, unknown>): string | null {
  const sl = (entity.sitelinks as Record<string, { title?: string }> | undefined)?.enwiki
  return sl?.title ?? null
}
async function fetchWikipedia(title: string) {
  try {
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, { headers: { 'User-Agent': UA } })
    if (!res.ok) return parseWikipediaSummary({})
    return parseWikipediaSummary(await res.json())
  } catch { return parseWikipediaSummary({}) }
}
// Wikipedia category titles for an article — editorially maintained and, for
// living people, governed by WP:BLPCAT (self-identification required), so a
// sound provenance for an lgbti_connection.
async function fetchWikipediaCategories(title: string): Promise<string[]> {
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&prop=categories&titles=${encodeURIComponent(title)}&cllimit=max&clshow=!hidden&format=json`
    const res = await fetch(url, { headers: { 'User-Agent': UA } })
    if (!res.ok) return []
    const data = await res.json()
    const pages = (data?.query?.pages ?? {}) as Record<string, { categories?: Array<{ title: string }> }>
    const cats: string[] = []
    for (const p of Object.values(pages)) for (const c of p.categories ?? []) if (c.title) cats.push(c.title)
    return cats
  } catch { return [] }
}

type Row = Record<string, unknown>

Deno.serve(withErrorReporting('personality-refresh', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()
  try {
    const body = await req.json().catch(() => ({}))
    const batchSize = Math.min((body.batch_size as number) || 25, 100)
    const dryRun = body.dry_run === true

    // Highest-priority stale/incomplete records first.
    const { data: targets, error: tErr } = await supabase
      .from('personality_data_health')
      .select('id, name')
      .eq('is_stale', true)
      .gt('debt_score', 0)
      .order('priority', { ascending: false })
      .limit(batchSize)
    if (tErr) return errorResponse(`scan: ${tErr.message}`, 500, req)
    if (!targets?.length) return jsonResponse({ success: true, items: 0, candidates: 0, dry_run: dryRun, results: [] }, 200, req)

    let updated = 0
    const results: Row[] = []
    for (const t of targets) {
      const id = t.id as string
      const { data: p } = await supabase.from('personalities').select('*').eq('id', id).single()
      if (!p) continue

      const incoming: Row = {}
      // SKIP_ sentinels mean "no Wikidata match, don't retry" — respect them: no
      // resolve, no entity fetch, no fake provenance. A real Q anchors normally.
      const skipped = typeof p.wikidata_qid === 'string' && (p.wikidata_qid as string).startsWith('SKIP_')
      let qid: string | null = isRealQid(p.wikidata_qid) ? (p.wikidata_qid as string) : null
      let entity: Record<string, unknown> | null = null
      let wdUrl: string | null = null
      let matchConfidence: 'high' | 'medium' | 'low' | null = null
      let matchReasons: string[] = []
      let connectionEvidence: string[] = []
      let wdConnection: LgbtiDerivation = { connection: null, evidence: [] }

      // Evidence-based resolution (multilingual search + birth-year / nationality /
      // occupation disambiguation). Refuses on ambiguity or contradiction, and
      // applies a stricter bar to living people, so we never blind-pick the top
      // English search hit the way the old loop did.
      if (!qid && !skipped && p.name) {
        const res = await resolvePersonality({
          name: String(p.name),
          profession: p.profession as string | null,
          birthDate: p.birth_date as string | null,
          deathDate: p.death_date as string | null,
          nationality: p.nationality as string | null,
          isLiving: p.is_living as boolean | null,
        })
        if (res) {
          qid = res.qid
          entity = res.entity
          matchConfidence = res.confidence
          matchReasons = res.reasons
          if (res.description) incoming.description = res.description
        }
      }
      if (qid) {
        incoming.wikidata_qid = qid
        wdUrl = `https://www.wikidata.org/wiki/${qid}`
        entity = entity ?? await wdEntity(qid)
        if (entity) {
          const birth = formatDate(claimValue(entity, 'P569'))
          const death = formatDate(claimValue(entity, 'P570'))
          const image = claimValue(entity, 'P18')
          if (birth) incoming.birth_date = birth
          if (death) incoming.death_date = death
          if (image) incoming.image_url = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(image)}`
          const ext: Record<string, string> = { ...((p.external_ids as Record<string, string>) ?? {}) }
          let extChanged = false
          for (const [prop, key] of Object.entries(WD_EXT)) {
            const v = claimValue(entity, prop)
            if (v && !ext[key]) { ext[key] = v; extChanged = true }
          }
          if (extChanged) incoming.external_ids = ext

          // Wikidata orientation (P91) / gender identity (P21) — combined with
          // Wikipedia categories below into one SOURCED lgbti_connection.
          wdConnection = deriveLgbtiConnection(claimQids(entity, 'P91'), claimQids(entity, 'P21'))
        }
      }

      // Wikipedia is fetched ONLY via the Wikidata-confirmed enwiki sitelink — never by
      // raw name, which could attach a different person's biography to this record.
      let wikiUrl: string | null = null
      const title = entity ? wikiSitelinkTitle(entity) : null
      if (title) {
        const wiki = await fetchWikipedia(title)
        wikiUrl = wiki.source_url
        if (wiki.extract) {
          incoming.description = incoming.description ?? wiki.extract.slice(0, 280)
          incoming.bio = wiki.extract.slice(0, 4000)
        }
        if (wiki.image_url && !incoming.image_url) incoming.image_url = wiki.image_url
      }

      // Combine Wikipedia categories (high coverage, BLPCAT-sourced) with the
      // Wikidata P91/P21 signal into one SOURCED lgbti_connection. Upgrades the
      // non-committal "unclear" placeholder only; the QID/Wikipedia article are the
      // provenance the outing guard requires; never clobbers a curated value.
      if (qid && shouldUpgradeConnection(p.lgbti_connection as string | null)) {
        const cats = title ? await fetchWikipediaCategories(title) : []
        const combined = combineConnection(deriveConnectionFromCategories(cats), wdConnection)
        if (combined.connection) {
          incoming.lgbti_connection = combined.connection
          connectionEvidence = combined.evidence
        }
      }

      // Validate any candidate image before it lands.
      const candidateImg = (incoming.image_url as string) ?? null
      if (candidateImg && !(await imageOk(candidateImg))) delete incoming.image_url

      // Fill ONLY blank columns on the live record; external_ids is an additive merge.
      const patch = fillBlanks(p as Row, incoming)
      if (incoming.external_ids) patch.external_ids = incoming.external_ids
      // lgbti_connection is an intentional UPGRADE of the 'unclear' placeholder, so
      // it bypasses fillBlanks (which only fills truly-blank columns).
      if (incoming.lgbti_connection) patch.lgbti_connection = incoming.lgbti_connection

      const merged = { ...p, ...patch }
      // quality_score is intentionally recomputed and overwritten every run — it is a
      // derived rubric value, NOT curated data, so it does not go through fillBlanks.
      const newScore = personalityQualityScore(merged as Row)

      results.push({ id, name: p.name, changed_keys: Object.keys(patch), new_quality: newScore })
      await sleep(120)
      if (dryRun) continue

      // A fresh low-confidence match still cleared the resolver's bar (it has a
      // real corroborator) but is worth a human glance before it carries weight.
      const flagReview = matchConfidence === 'low'
      const { error: uErr } = await supabase.from('personalities').update({
        ...patch,
        quality_score: newScore,
        ...(flagReview ? { needs_attention: true } : {}),
        last_refreshed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', id)
      if (uErr) { results[results.length - 1].error = uErr.message; continue }

      // Provenance. personality_sources is UNIQUE on (source_slug, source_entity_id).
      // wikidata path is collision-safe: personalities.wikidata_qid is itself UNIQUE, so a
      // colliding QID fails the UPDATE above and we skip before writing provenance. wikipedia
      // path keys on the article URL; cross-personality collisions only occur for two records
      // sharing one enwiki article (i.e. likely duplicates) — accepted Phase-1 limitation for
      // an audit row; hardened in a later phase.
      if (qid) {
        const wdConfidence = matchConfidence === 'low' ? 0.6 : matchConfidence === 'medium' ? 0.8 : 1.0
        await supabase.from('personality_sources').upsert({
          personality_id: id, source_slug: 'wikidata', source_entity_id: qid,
          source_url: wdUrl, confidence: wdConfidence, is_primary: true, last_seen_at: new Date().toISOString(),
          raw: { refreshed_keys: Object.keys(patch), match_confidence: matchConfidence, match_reasons: matchReasons, connection_evidence: connectionEvidence },
        }, { onConflict: 'source_slug,source_entity_id' })
      }
      if (wikiUrl) {
        await supabase.from('personality_sources').upsert({
          personality_id: id, source_slug: 'wikipedia', source_entity_id: wikiUrl,
          source_url: wikiUrl, confidence: 0.9, is_primary: false, last_seen_at: new Date().toISOString(),
          raw: { refreshed_keys: Object.keys(patch) },
        }, { onConflict: 'source_slug,source_entity_id' })
      }
      updated++
    }

    return jsonResponse({ success: true, items: updated, candidates: results.length, dry_run: dryRun, results }, 200, req)
  } catch (error) {
    console.error('personality-refresh:', error)
    return errorResponse((error as Error).message, 500, req)
  }
}))
