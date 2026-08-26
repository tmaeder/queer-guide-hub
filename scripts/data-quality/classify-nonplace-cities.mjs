#!/usr/bin/env node
// Classify the `personality-birth-place` city shells so the non-places among
// them can be deleted by hand-reviewed id list.
//
// Why this exists: `public.cities` carries 1,832 rows stamped
// `data_source='personality-birth-place'` — minted from a personality's
// birth-place FREE TEXT. Every one of them has a `tmp-` slug and NOT ONE has a
// `wikidata_qid`, so nothing downstream has ever corroborated them. 1,459 hold
// no venue/event/hotel/news/village/organization at all, and all 1,459 sit live
// in `search_documents` (the city indexer filters only `duplicate_of_id`), so a
// search for "Hessen", "Texas" or "Americas" returns a city card.
//
// The cohort is NOT homogeneous, which is the whole reason for a classifier
// rather than a predicate:
//   * non-places   — Bundesländer, US/BR/MX states, prefectures, counties,
//                    countries ("Russland", "USA"), a continent ("Americas",
//                    population 1,035,298,985), historic states.
//   * exonym dupes — real cities under a foreign or qualified name:
//                    "Kapstadt", "Teheran", "Singapur", "Brasília, Distrito
//                    Federal". These must NOT be deleted as non-places.
//   * real towns   — the majority. Untouched.
//
// THE DB'S OWN REFERENCE LISTS CANNOT DO THIS. Matching against
// `countries.name` + `regions.name` + `cities.region_name` + a suffix regex
// hits 44 of 1,456: `Hessen` misses because no German city carries
// `region_name='Hessen'`, and `Russland`/`Singapur` miss because
// `countries.name` is English. Hence the external sources below.
//
// Sources — free, key-less, already trusted by backfill-country-facts.mjs:
//   S1 dr5hn/countries-states-cities-database states.json
//        every ISO-3166-2 subdivision with `name`, `native` and a `translations`
//        map (de/fr/es/...). This is the arm that catches Hessen.
//   S2 dr5hn countries.json + S3 mledoze/countries countries.json
//        country names in every language mledoze carries, plus altSpellings.
//        This is the arm that catches Russland / Großbritannien / Singapur.
//   S4 dr5hn countries+states+cities.json (46 MB, disk-cached)
//        the gazetteer that DEMOTES a match back out of `nonplace`. Two tests,
//        both structural rather than lexical:
//          (a) a city of this name exists in this country — "Babylon" is a
//              governorate of Iraq and a town on Long Island;
//          (b) the matched subdivision contains a city bearing the
//              subdivision's OWN name — Tehran province holds the city Tehran,
//              Piacenza province the city Piacenza, every Thai province its
//              capital, every Puerto Rican municipio its pueblo.
//        Test (b) is what makes the German exonyms tractable: "Teheran" and
//        "Damaskus" never match an English gazetteer entry, but the province
//        they resolve to is provably named after a city inside it, and that is
//        enough to say the NAME is ambiguous and must not be auto-deleted.
//
// ORDERING IS LOAD-BEARING: the duplicate check runs BEFORE the non-place arms
// and wins. "Singapur", "Luxemburg" and "Hong Kong" all match the country arm
// but are duplicates of real cities (canonical Singapore has 31 venues,
// Luxembourg 15, Hong Kong 23) — deleting them as non-places would throw away a
// correct personality→city link. A city-state is a city.
//
// This script DELETES NOTHING and WRITES NOTHING to the database. It emits
// three buckets for hand review; only the reviewed id list may reach a
// migration.
//
// Auth: Supabase personal access token (Management API), keychain or SUPABASE_PAT.
//
// Usage:
//   node scripts/data-quality/classify-nonplace-cities.mjs
//   node scripts/data-quality/classify-nonplace-cities.mjs --out /tmp/x.json
//   node scripts/data-quality/classify-nonplace-cities.mjs --print nonplace

import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'

const PROJECT = 'xqeacpakadqfxjxjcewc'
const UA = 'QueerGuideBackfill/1.0 (https://queer.guide; data-quality)'

const args = process.argv.slice(2)
const val = (n) => (args.indexOf(n) >= 0 ? args[args.indexOf(n) + 1] : undefined)
const OUT = val('--out') ?? 'scripts/data-quality/out/nonplace-city-candidates.json'
const PRINT = val('--print') ?? 'nonplace'
// Offline input, for running without a Management API token: a JSON file
// `{ shells, canonical, regions }` with the same row shapes the three queries
// below return. `canonical` may be pre-filtered to rows whose normalized name
// (or pre-comma head) equals one a shell carries — the index is only ever
// probed with shell keys, so a pre-filtered list gives identical verdicts.
const INPUT = val('--input')
// S4 is 46 MB. Cached on disk so a review loop costs one download, not twenty.
const CACHE_DIR = val('--cache-dir') ?? '/tmp/nonplace-city-cache'
// The `keep` bucket is the untouched majority (1,222 rows) and carries no
// decision, so it is summarised to a count in the written file and would churn
// the diff on every re-run. `--full` writes it out anyway.
const FULL = args.includes('--full')
// The hand review. A JSON `{ rejected: { <city id>: <reason> } }` naming rows
// that the arms put in `nonplace` and a human took back out. Rows in the bucket
// and not named there are the approved delete list. Passing no review file
// means nothing is approved — the arms rank, they never decide.
const REVIEW = val('--review') ?? 'scripts/data-quality/out/nonplace-city-review.json'

let _token
function token() {
  if (_token) return _token
  if (process.env.SUPABASE_PAT) return (_token = process.env.SUPABASE_PAT)
  const raw = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-w'], { encoding: 'utf8' }).trim()
  return (_token = Buffer.from(raw.replace(/^go-keyring-base64:/, ''), 'base64').toString('utf8'))
}

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error(`mgmt API ${res.status}: ${(await res.text()).slice(0, 400)}`)
  return res.json()
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Same as getJson, but keeps the body on disk. S4 is 46 MB; re-downloading it
 * on every run would make the hand-review loop unusable.
 */
async function getJsonCached(url, name) {
  const path = `${CACHE_DIR}/${name}`
  if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf8'))
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
  if (!res.ok) throw new Error(`${url} -> ${res.status}`)
  const body = await res.text()
  mkdirSync(CACHE_DIR, { recursive: true })
  writeFileSync(path, body)
  return JSON.parse(body)
}

async function getJson(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`${res.status}`)
      return await res.json()
    } catch (e) {
      if (i === tries - 1) throw e
      await sleep(1500 * (i + 1))
    }
  }
}

// ---------------------------------------------------------------- normalization

/**
 * Fold a place name to a comparison key. Diacritics go (Michoacán ↔ Michoacan),
 * case goes, and punctuation collapses to single spaces so "St. Gallen" and
 * "St Gallen" agree. Deliberately NOT stripping spaces entirely the way
 * `dedup_despace` does — "New York" and "Newyork" should not collide here,
 * because a false merge in the dupe arm silently rescues a genuine non-place.
 */
const FOLD = { '\u00df': 'ss', '\u00f8': 'o', '\u00e6': 'ae', '\u0153': 'oe', '\u0111': 'd', '\u0142': 'l', '\u00fe': 'th', '\u00f0': 'd' }
const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    // NFD cannot decompose these — "Großbritannien" would fold to
    // "gro britannien" and match nothing.
    .replace(/[\u00df\u00f8\u00e6\u0153\u0111\u0142\u00fe\u00f0]/g, (m) => FOLD[m])
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** "Brasília, Distrito Federal" → "Brasília". A qualified name's head is the place. */
const head = (s) => String(s ?? '').split(',')[0].trim()

// A subdivision word at the end of the name is its own signal — it says the row
// describes a container of places rather than a place. `-shire` is spelled out
// because "Hertfordshire" carries no separate word to match on.
//
// Two constraints, both learned from false positives in the first pass:
//   * it runs on the pre-comma HEAD only. "Blackburn, Lancashire" and
//     "Mora, Dalarna County" are real towns carrying a county qualifier; the
//     suffix belongs to the qualifier, not to the place.
//   * something must precede the suffix word. "Kanton" on its own is the German
//     name of Guangzhou, not a Swiss canton.
const SUFFIX_RE =
  /\S\s+(County|Parish|Prefecture|Province|Provincia|District|Distrito|Voivodeship|Województwo|Canton|Kanton|Oblast|Krai|Okrug|Governorate|Departamento|Département|Regione|Region|Metropolitan Area|Metro Area|Autonomous Region|Municipality)\s*$/i
const SHIRE_RE = /[a-z]shire$/i
// Historic polities. A city never carries these heads.
const HISTORIC_RE = /^(Electorate|Kingdom|Duchy|Grand Duchy|Principality|Empire|Republic|Free State|Dominion|Colony|Protectorate)\s+of\s+/i

// ---------------------------------------------------------------- main

const SHELL_PREDICATE = `
  c.data_source like 'personality-birth-place%'
  and c.slug like 'tmp-%'
  and c.duplicate_of_id is null
  and not exists (select 1 from venues v where v.city_id = c.id)
  and not exists (select 1 from events e where e.city_id = c.id)
  and not exists (select 1 from hotels h where h.city_id = c.id)
  and not exists (select 1 from queer_villages q where q.city_id = c.id)
  and not exists (select 1 from news_article_cities n where n.city_id = c.id)
  and not exists (select 1 from organizations o where o.city_id = c.id)
  and not exists (select 1 from milestones m where m.city_id = c.id)
  and not exists (select 1 from trip_destinations t where t.city_id = c.id)
  and not exists (select 1 from trip_places t where t.city_id = c.id)
  and not exists (select 1 from city_favorites f where f.city_id = c.id)
  and not exists (select 1 from guides g where g.city_id = c.id)
  and not exists (select 1 from trips tr where tr.primary_city_id = c.id)
  and not exists (select 1 from user_travel_preferences u where u.home_city_id = c.id)
`

async function loadShells() {
  const rows = await sql(`
    select c.id, c.name, c.slug, c.population, c.latitude, c.longitude,
           co.code as country_code, co.name as country_name,
           (select count(*) from personalities p where p.city_id = c.id) as birth_refs,
           (select count(*) from personalities p where p.death_city_id = c.id) as death_refs
    from public.cities c
    left join public.countries co on co.id = c.country_id
    where ${SHELL_PREDICATE}
    order by c.population desc nulls last, c.name
  `)
  return rows
}

/** Every non-shell city that could be the real place a shell is aping. */
async function loadCanonical() {
  return sql(`
    select c.id, c.name, c.slug, co.code as country_code,
           (select count(*) from venues v where v.city_id = c.id)
         + (select count(*) from events e where e.city_id = c.id)
         + (select count(*) from hotels h where h.city_id = c.id)
         + (select count(*) from news_article_cities n where n.city_id = c.id) as content
    from public.cities c
    left join public.countries co on co.id = c.country_id
    where c.duplicate_of_id is null and c.slug not like 'tmp-%'
  `)
}
// NOTE for the --input path: `canonical` must include, besides the rows whose
// name matches a shell key, every city named after its own country (Singapore,
// Luxembourg, Monaco, Vatican City) — the city-state bridge reads them by ISO2,
// not by name, so a pre-filter built from shell keys alone would miss them.

async function loadRegions() {
  return sql(`select name from public.regions`)
}

/**
 * From S4: which names are attested as CITIES, and which subdivisions are named
 * after a city inside themselves. Both are demotion signals — they never make a
 * row a non-place, they only stop one from being called a non-place.
 */
function buildGazetteer(csc) {
  const cityNamesByCountry = new Map()
  // Key: `${ISO2}|${normalized subdivision name}`. Stored per country because
  // "Victoria" is a self-named Australian state and something else elsewhere.
  const selfNamedStates = new Set()
  for (const country of csc) {
    const iso2 = country.iso2
    if (!cityNamesByCountry.has(iso2)) cityNamesByCountry.set(iso2, new Set())
    const bag = cityNamesByCountry.get(iso2)
    for (const st of country.states ?? []) {
      const stKey = norm(st.name)
      // Some countries administer themselves by city: dr5hn types Botswana's
      // Francistown as `city`. A subdivision that IS a city is not evidence
      // that the name denotes a container.
      let selfNamed = st.type === 'city'
      for (const city of st.cities ?? []) {
        const ck = norm(city.name)
        if (!ck) continue
        bag.add(ck)
        // Exact, or the capital carrying a status word: Jeju province holds
        // "Jeju City" and "Jeju-si", never a bare "Jeju".
        if (ck === stKey || (stKey && ck.startsWith(`${stKey} `))) selfNamed = true
      }
      if (selfNamed && stKey) {
        // Mark every language variant of the subdivision, so a German exonym
        // resolving to this state inherits the ambiguity.
        selfNamedStates.add(`${iso2}|${stKey}`)
        for (const alias of [st.native, ...Object.values(st.translations ?? {})]) {
          const ak = norm(alias)
          if (ak) selfNamedStates.add(`${iso2}|${ak}`)
        }
      }
    }
  }
  return { cityNamesByCountry, selfNamedStates }
}

function buildReferences({ states, countries, mledoze, regions }) {
  // Subdivisions, keyed by the country they belong to AND globally. The
  // per-country map is the trustworthy arm; the global one only ranks, because
  // "Victoria" is an Australian state and a Seychellois capital at once.
  const subByCountry = new Map()
  const subGlobal = new Map()
  for (const s of states) {
    const names = [s.name, s.native, ...Object.values(s.translations ?? {})]
    for (const n of names) {
      const k = norm(n)
      if (!k) continue
      if (!subByCountry.has(s.country_code)) subByCountry.set(s.country_code, new Map())
      if (!subByCountry.get(s.country_code).has(k)) subByCountry.get(s.country_code).set(k, s)
      if (!subGlobal.has(k)) subGlobal.set(k, s)
    }
  }

  // Country names in every language mledoze ships, plus altSpellings and the
  // dr5hn `native`. One flat set — a country name is a non-place no matter
  // which country the shell was mis-filed under.
  const countryNames = new Map()
  // Same names, grouped by ISO2. Needed for the city-state bridge below: a
  // shell called "Singapur" has to reach the canonical city called "Singapore",
  // and no amount of string matching gets from an exonym to an endonym.
  const countryNamesByIso = new Map()
  const addCountry = (n, iso2) => {
    const k = norm(n)
    if (!k) return
    if (!countryNames.has(k)) countryNames.set(k, iso2)
    if (!countryNamesByIso.has(iso2)) countryNamesByIso.set(iso2, new Set())
    countryNamesByIso.get(iso2).add(k)
  }
  for (const c of countries) {
    addCountry(c.name, c.iso2)
    addCountry(c.native, c.iso2)
  }
  for (const c of mledoze) {
    addCountry(c.name?.common, c.cca2)
    addCountry(c.name?.official, c.cca2)
    for (const alt of c.altSpellings ?? []) addCountry(alt, c.cca2)
    for (const t of Object.values(c.translations ?? {})) {
      addCountry(t.common, c.cca2)
      addCountry(t.official, c.cca2)
    }
  }
  // Two-letter altSpellings are ISO codes, not names — "IN", "OR", "ME" would
  // match ordinary words. Same trap the news geo guard documents.
  for (const k of [...countryNames.keys()]) if (k.length <= 3) countryNames.delete(k)
  for (const set of countryNamesByIso.values()) for (const k of [...set]) if (k.length <= 3) set.delete(k)

  const regionNames = new Set(regions.map((r) => norm(r.name)))
  // Continents are not in `regions` under every spelling.
  for (const c of ['africa', 'america', 'americas', 'north america', 'south america', 'asia', 'europe', 'oceania', 'antarctica', 'eurasia', 'middle east', 'caribbean', 'scandinavia', 'balkans', 'west indies']) regionNames.add(c)

  return { subByCountry, subGlobal, countryNames, countryNamesByIso, regionNames }
}

function classify(shell, ref, canonicalIndex, canonicalByCountry, gaz) {
  const raw = shell.name ?? ''
  const key = norm(raw)
  const headKey = norm(head(raw))

  // ---- arm 0: is this a real city wearing another name? Runs FIRST and wins.
  const dupes = []
  for (const k of new Set([key, headKey])) {
    for (const cand of canonicalIndex.get(k) ?? []) {
      if (cand.id === shell.id) continue
      dupes.push({
        id: cand.id,
        name: cand.name,
        slug: cand.slug,
        country_code: cand.country_code,
        content: Number(cand.content),
        same_country: cand.country_code === shell.country_code,
      })
    }
  }
  if (dupes.length) {
    dupes.sort((a, b) => b.content - a.content || Number(b.same_country) - Number(a.same_country))
    return { bucket: 'exonym_dupe', arms: ['canonical_match'], dupes: dupes.slice(0, 4) }
  }

  // ---- arm 0b: city-state bridge. A shell naming a country is normally a
  // non-place, but four of them ARE cities — Singapore, Luxembourg, Monaco,
  // Vatican City — and the shells spell them in German ("Singapur",
  // "Luxemburg"), so arm 0 cannot see the canonical row. Resolve the name to an
  // ISO2, then ask whether that country holds a city named after itself in ANY
  // language. Verified against prod: canonical Singapore (SG) carries 31
  // venues, Luxembourg (LU) 15 — deleting those shells as non-places would
  // throw away a correct personality→city link.
  const iso = ref.countryNames.get(key) ?? ref.countryNames.get(headKey)
  if (iso) {
    const selfNamed = (canonicalByCountry.get(iso) ?? []).filter((c) =>
      ref.countryNamesByIso.get(iso)?.has(norm(c.name)),
    )
    if (selfNamed.length) {
      selfNamed.sort((a, b) => Number(b.content) - Number(a.content))
      return {
        bucket: 'exonym_dupe',
        arms: ['city_state'],
        dupes: selfNamed.slice(0, 4).map((c) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          country_code: c.country_code,
          content: Number(c.content),
          same_country: c.country_code === shell.country_code,
        })),
      }
    }
  }

  // ---- non-place arms. Every hit is a reason, all are reported; a human reads
  // the whole row before any id reaches the delete list.
  const arms = []
  const detail = {}

  const perCountry = ref.subByCountry.get(shell.country_code)?.get(key)
  if (perCountry) {
    arms.push('subdivision')
    detail.subdivision = { name: perCountry.name, type: perCountry.type, iso: perCountry.iso3166_2, qid: perCountry.wikiDataId }
  } else {
    const global = ref.subGlobal.get(key)
    if (global) {
      arms.push('subdivision_other_country')
      detail.subdivision = { name: global.name, type: global.type, iso: global.iso3166_2, qid: global.wikiDataId, country: global.country_code }
    }
  }

  const asCountry = ref.countryNames.get(key)
  if (asCountry) {
    arms.push('country')
    detail.country = asCountry
  }

  if (ref.regionNames.has(key)) arms.push('macro_region')
  const rawHead = head(raw)
  if (SUFFIX_RE.test(rawHead) || SHIRE_RE.test(rawHead)) arms.push('suffix')
  if (HISTORIC_RE.test(raw)) arms.push('historic_polity')

  if (!arms.length) return { bucket: 'keep', arms: [] }

  // ---- demotion. An arm says "this name denotes a container of places". The
  // gazetteer answers whether the same name ALSO denotes a place, and if it
  // does the name cannot decide the row — a human would have to know which the
  // birth-place string meant, and the string is gone. Do not delete on a name
  // that is attested both ways.
  const demoted = []
  if (gaz.cityNamesByCountry.get(shell.country_code)?.has(key)) demoted.push('city_of_that_name_exists')
  const subKey = detail.subdivision ? norm(detail.subdivision.name) : null
  const subIso = detail.subdivision?.country ?? shell.country_code
  if (subKey && gaz.selfNamedStates.has(`${subIso}|${subKey}`)) demoted.push('subdivision_named_after_its_own_city')
  else if (subKey && gaz.selfNamedStates.has(`${subIso}|${key}`)) demoted.push('subdivision_named_after_its_own_city')
  if (demoted.length) return { bucket: 'ambiguous_place_name', arms, detail, demoted }

  return { bucket: 'nonplace', arms, detail }
}

async function main() {
  console.log(INPUT ? `Loading DB rows from ${INPUT}…` : 'Loading shells + canonical cities…')
  const [shells, canonical, regions] = INPUT
    ? (({ shells, canonical, regions }) => [shells, canonical, regions])(JSON.parse(readFileSync(INPUT, 'utf8')))
    : await Promise.all([loadShells(), loadCanonical(), loadRegions()])
  console.log(`  shells ${shells.length}   canonical ${canonical.length}   regions ${regions.length}`)

  console.log('Fetching reference sets…')
  const [states, countries, mledoze] = await Promise.all([
    getJson('https://raw.githubusercontent.com/dr5hn/countries-states-cities-database/master/json/states.json'),
    getJson('https://raw.githubusercontent.com/dr5hn/countries-states-cities-database/master/json/countries.json'),
    getJson('https://raw.githubusercontent.com/mledoze/countries/master/countries.json'),
  ])
  console.log(`  S1 states ${states.length}   S2 dr5hn ${countries.length}   S3 mledoze ${mledoze.length}`)

  const csc = await getJsonCached(
    'https://raw.githubusercontent.com/dr5hn/countries-states-cities-database/master/json/countries%2Bstates%2Bcities.json',
    'countries-states-cities.json',
  )
  const gaz = buildGazetteer(csc)
  console.log(`  S4 gazetteer: ${gaz.cityNamesByCountry.size} countries, ${gaz.selfNamedStates.size} self-named subdivision keys`)

  const ref = buildReferences({ states, countries, mledoze, regions })
  console.log(`  subdivision keys ${ref.subGlobal.size}   country keys ${ref.countryNames.size}   region keys ${ref.regionNames.size}`)

  // Index canonical cities by both their full name and their pre-comma head, so
  // "Brasília, Distrito Federal" finds "Brasília".
  const canonicalIndex = new Map()
  for (const c of canonical) {
    for (const k of new Set([norm(c.name), norm(head(c.name))])) {
      if (!k) continue
      if (!canonicalIndex.has(k)) canonicalIndex.set(k, [])
      canonicalIndex.get(k).push(c)
    }
  }

  const canonicalByCountry = new Map()
  for (const c of canonical) {
    if (!c.country_code) continue
    if (!canonicalByCountry.has(c.country_code)) canonicalByCountry.set(c.country_code, [])
    canonicalByCountry.get(c.country_code).push(c)
  }

  const buckets = { nonplace: [], ambiguous_place_name: [], exonym_dupe: [], keep: [] }
  for (const s of shells) {
    const verdict = classify(s, ref, canonicalIndex, canonicalByCountry, gaz)
    buckets[verdict.bucket].push({
      id: s.id,
      name: s.name,
      country: s.country_code,
      population: s.population,
      birth_refs: Number(s.birth_refs),
      death_refs: Number(s.death_refs),
      ...verdict,
    })
  }

  // ---- apply the hand review
  const review = existsSync(REVIEW) ? JSON.parse(readFileSync(REVIEW, 'utf8')) : { rejected: {} }
  const rejected = review.rejected ?? {}
  const stale = Object.keys(rejected).filter((id) => !buckets.nonplace.some((r) => r.id === id))
  buckets.rejected_by_review = buckets.nonplace.filter((r) => rejected[r.id])
  for (const r of buckets.rejected_by_review) r.review_reason = rejected[r.id]
  buckets.nonplace = buckets.nonplace.filter((r) => !rejected[r.id])

  const armCount = {}
  for (const r of buckets.nonplace) for (const a of r.arms) armCount[a] = (armCount[a] ?? 0) + 1

  console.log('')
  console.log(`nonplace (approved)   ${buckets.nonplace.length}`)
  console.log(`rejected_by_review    ${buckets.rejected_by_review.length}   (${existsSync(REVIEW) ? REVIEW : 'no review file — nothing approved'})`)
  console.log(`ambiguous_place_name  ${buckets.ambiguous_place_name.length}   (name denotes both — never auto-deleted)`)
  console.log(`exonym_dupe           ${buckets.exonym_dupe.length}   (out of scope — reported only)`)
  console.log(`keep                  ${buckets.keep.length}`)
  console.log(`arms         ${JSON.stringify(armCount)}`)

  // A reviewed id that no longer appears in the bucket is a stale decision: the
  // arms moved, and the reason on file may no longer describe anything. Say so
  // rather than silently carrying it.
  if (stale.length) console.log(`\nWARNING  ${stale.length} reviewed id(s) are no longer in the nonplace bucket: ${stale.join(', ')}`)

  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(
    OUT,
    JSON.stringify(
      {
        generated_from: 'scripts/data-quality/classify-nonplace-cities.mjs',
        shell_count: shells.length,
        counts: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.length])),
        arms: armCount,
        review_file: REVIEW,
        stale_review_ids: stale,
        approved_ids: buckets.nonplace.map((r) => r.id),
        buckets: FULL ? buckets : { ...buckets, keep: `${buckets.keep.length} rows omitted; re-run with --full` },
      },
      null,
      2,
    ) + '\n',
  )
  console.log(`\nwrote ${OUT}`)

  if (PRINT !== 'none' && buckets[PRINT]) {
    console.log(`\n--- ${PRINT} ---`)
    for (const r of buckets[PRINT]) {
      const extra = r.bucket === 'exonym_dupe' ? ` -> ${r.dupes.map((d) => `${d.name}/${d.country_code}(${d.content})`).join(', ')}` : ` [${r.arms.join('+')}]`
      console.log(`${r.country ?? '--'}  ${String(r.population ?? '').padStart(10)}  refs=${r.birth_refs + r.death_refs}  ${r.name}${extra}`)
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
