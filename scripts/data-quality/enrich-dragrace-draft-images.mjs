#!/usr/bin/env node
// ============================================================
// enrich-dragrace-draft-images.mjs
//
// Second pass over the Drag Race import: the draft contestants lack an image
// (no English Wikipedia article), which is why they didn't auto-publish. This
// pulls a Commons photo from Wikidata (P18) — using each contestant's known QID
// or a name search constrained to drag performers — so they can go public.
//
// Reads out-dragrace/records.ndjson (from import-dragrace-contestants.mjs),
// enriches only the draft-classified rows, writes out-dragrace/enrich-images.json
// = [{ name, qid, image_url }]. Network only; HTTP cached under out-dragrace/cache.
// ============================================================

import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, 'out-dragrace')
const CACHE = join(OUT, 'cache')
mkdirSync(CACHE, { recursive: true })

const UA = 'queer.guide-dragrace-import/1.0 (https://queer.guide; admin@queer.guide)'
const WD = 'https://www.wikidata.org/w/api.php'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const normKey = s => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/["'`]/g, '').replace(/\s+/g, ' ').trim()

async function fetchCached(url, key) {
  const cf = join(CACHE, key.replace(/[^a-z0-9]+/gi, '_').slice(0, 180) + '.json')
  if (existsSync(cf)) { try { return JSON.parse(readFileSync(cf, 'utf8')) } catch {} }
  for (let a = 0; a < 4; a++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
      if (!res.ok) throw new Error('HTTP ' + res.status)
      const j = await res.json(); writeFileSync(cf, JSON.stringify(j)); return j
    } catch (e) { if (a === 3) { console.warn('  ! ' + key + ': ' + e.message); return null } await sleep(600 * (a + 1)) }
  }
}

// Wikidata name search constrained to drag performers (description mentions drag/queen).
async function searchQid(name) {
  const url = WD + '?' + new URLSearchParams({ action: 'wbsearchentities', format: 'json', language: 'en', uselang: 'en', type: 'item', limit: '7', search: name })
  const j = await fetchCached(url, 'wbs_' + name)
  for (const r of j?.search ?? []) {
    const desc = (r.description || '').toLowerCase()
    if (/drag|queen|rupaul|perform/.test(desc) && normKey(r.label || '') === normKey(name)) return r.id
  }
  return null
}

const commonsUrl = file => `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file.replace(/ /g, '_'))}?width=500`
// preferred sitelink wikis (en first, then the franchise languages)
const WIKI_PREF = ['en', 'es', 'fr', 'it', 'pt', 'de', 'nl', 'th', 'sv', 'fil', 'ceb']

// Fetch each entity's P18 image AND its Wikipedia sitelinks (title per lang).
async function getEntityMedia(qids) {
  const map = new Map() // qid -> { p18, sitelinks: [{lang,title}] }
  for (let i = 0; i < qids.length; i += 50) {
    const batch = qids.slice(i, i + 50)
    const url = WD + '?' + new URLSearchParams({ action: 'wbgetentities', format: 'json', props: 'claims|sitelinks', ids: batch.join('|') })
    const j = await fetchCached(url, 'media_' + createHash('md5').update(batch.join('|')).digest('hex'))
    for (const qid of batch) {
      const ent = j?.entities?.[qid]
      if (!ent) continue
      const p18 = ent.claims?.P18?.[0]?.mainsnak?.datavalue?.value || null
      const sitelinks = Object.entries(ent.sitelinks || {})
        .filter(([k]) => k.endsWith('wiki') && !k.includes('wikiquote') && !k.includes('commons'))
        .map(([k, v]) => ({ lang: k.replace(/wiki$/, ''), title: v.title }))
      map.set(qid, { p18, sitelinks })
    }
  }
  return map
}

// Lead image (pageimages) from a specific language Wikipedia, batched by lang.
async function pageImagesByLang(lang, titles) {
  const out = new Map()
  for (let i = 0; i < titles.length; i += 40) {
    const batch = titles.slice(i, i + 40)
    const url = `https://${lang}.wikipedia.org/w/api.php?` + new URLSearchParams({
      action: 'query', format: 'json', formatversion: '2', prop: 'pageimages',
      piprop: 'thumbnail', pithumbsize: '500', titles: batch.join('|'), redirects: '1',
    })
    const j = await fetchCached(url, `pi_${lang}_` + createHash('md5').update(batch.join('|')).digest('hex'))
    for (const p of j?.query?.pages ?? []) if (p.thumbnail?.source) out.set(p.title, p.thumbnail.source)
  }
  return out
}

async function getImages(qids) {
  const media = await getEntityMedia(qids)
  const map = new Map()
  // 1) Wikidata P18 (best)
  for (const [qid, m] of media) if (m.p18) map.set(qid, commonsUrl(m.p18))
  // 2) fallback: lead image from a sitelinked Wikipedia article (any language)
  const need = [...media].filter(([qid]) => !map.has(qid))
  const byLang = new Map() // lang -> [{qid,title}]
  for (const [qid, m] of need) {
    const pick = WIKI_PREF.map(l => m.sitelinks.find(s => s.lang === l)).find(Boolean) || m.sitelinks[0]
    if (pick) { if (!byLang.has(pick.lang)) byLang.set(pick.lang, []); byLang.get(pick.lang).push({ qid, title: pick.title }) }
  }
  for (const [lang, items] of byLang) {
    const imgs = await pageImagesByLang(lang, items.map(x => x.title))
    for (const it of items) { const img = imgs.get(it.title); if (img) map.set(it.qid, img) }
  }
  return map
}

async function main() {
  const recs = readFileSync(join(OUT, 'records.ndjson'), 'utf8').trim().split('\n').map(JSON.parse)
  const drafts = recs.filter(r => r.norm.visibility === 'draft' && !r.norm.image_url)
  console.log(`${drafts.length} draft contestants without an image.`)

  // resolve a QID for each (existing, else constrained name search)
  let resolved = 0
  for (const r of drafts) {
    r.qid = r.norm.wikidata_qid || await searchQid(r.norm.name)
    if (r.qid) resolved++
  }
  console.log(`${resolved} have a QID (after Wikidata search).`)

  const qids = [...new Set(drafts.filter(r => r.qid).map(r => r.qid))]
  console.log(`Fetching P18 images for ${qids.length} entities…`)
  const imgMap = await getImages(qids)

  const out = []
  for (const r of drafts) {
    const img = r.qid ? imgMap.get(r.qid) : null
    if (img) out.push({ name: r.norm.name, qid: r.qid, image_url: img })
  }
  writeFileSync(join(OUT, 'enrich-images.json'), JSON.stringify(out))
  console.log(`\nGot images for ${out.length} of ${drafts.length} drafts → enrich-images.json`)
}
main().catch(e => { console.error(e); process.exit(1) })
