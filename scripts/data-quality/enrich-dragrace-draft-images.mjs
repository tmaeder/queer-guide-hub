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

async function getImages(qids) {
  const map = new Map()
  for (let i = 0; i < qids.length; i += 50) {
    const batch = qids.slice(i, i + 50)
    const url = WD + '?' + new URLSearchParams({ action: 'wbgetentities', format: 'json', props: 'claims', ids: batch.join('|') })
    const j = await fetchCached(url, 'p18_' + createHash('md5').update(batch.join('|')).digest('hex'))
    for (const qid of batch) {
      const file = j?.entities?.[qid]?.claims?.P18?.[0]?.mainsnak?.datavalue?.value
      if (file) map.set(qid, `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file.replace(/ /g, '_'))}?width=500`)
    }
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
