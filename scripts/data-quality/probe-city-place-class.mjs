#!/usr/bin/env node
// Fill public.city_place_class_probe from Wikidata P31.
//
// Context: `cities` has no place-class column, so a Stadtteil filed as a city is
// indistinguishable from a city. Measured over a random sample of 48 live,
// seo_indexable, QID-bearing, venue-bearing rows, NINE are not an ordinary city
// — `Kensington` is "area of London" with 15 venues on it. See migration
// 99991790173993_city_place_class_probe.sql for the vocabulary and for why the
// verdict REPORTS and never acts.
//
// This writes `classes` ONLY. The verdict is derived in SQL by
// `city_place_class_verdict()`, so a vocabulary change reclassifies the whole
// corpus without re-probing anything.
//
// Usage:
//   node scripts/data-quality/probe-city-place-class.mjs --dry-run
//   node scripts/data-quality/probe-city-place-class.mjs
//   node scripts/data-quality/probe-city-place-class.mjs --batch 50 --max-batches 10
//   node scripts/data-quality/probe-city-place-class.mjs --refresh   # re-probe everything
//
// Resumability is free: a QID already in the probe table is skipped unless
// --refresh, so the work list only shrinks and an interrupted run costs nothing.
//
// An entity with NO P31 at all is stored as an EMPTY array rather than skipped.
// Skipping it would re-offer the same unresolvable QID on every future run;
// storing the empty answer makes it `undetermined`, which is what it is.
// Absence of a class is a finding, not a reason to keep asking.

import { execFileSync } from 'node:child_process'

const PROJECT = 'xqeacpakadqfxjxjcewc'
const SPARQL = 'https://query.wikidata.org/sparql'
const UA = 'queer.guide city place-class probe (https://queer.guide; ops@queer.guide)'

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback
}
const DRY_RUN = args.includes('--dry-run')
const REFRESH = args.includes('--refresh')
const BATCH = Number(flag('batch', 50))
const MAX_BATCHES = Number(flag('max-batches', 80))
const SLEEP_MS = Number(flag('sleep', 1200))

function token() {
  if (process.env.SUPABASE_PAT) return process.env.SUPABASE_PAT
  const raw = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-w'], {
    encoding: 'utf8',
  }).trim()
  return Buffer.from(raw.replace(/^go-keyring-base64:/, ''), 'base64').toString('utf8')
}
const TOKEN = token()

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error(`mgmt API ${res.status}: ${(await res.text()).slice(0, 300)}`)
  return res.json()
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`

/**
 * P31 English labels for up to `BATCH` QIDs.
 *
 * SPARQL rather than wbgetentities: the label service resolves each class QID
 * to its English label in the same request, where wbgetentities returns class
 * QIDs that would each need a second lookup.
 *
 * An empty result for a QID is not an error — the entity exists and has no
 * P31 — so the caller distinguishes "not in the response" from "the request
 * failed", and only the latter aborts.
 */
async function fetchClasses(qids) {
  const values = qids.map((q) => `wd:${q}`).join(' ')
  const query = `SELECT ?item ?classLabel WHERE {
    VALUES ?item { ${values} }
    ?item wdt:P31 ?class .
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
  }`
  const res = await fetch(`${SPARQL}?format=json&query=${encodeURIComponent(query)}`, {
    headers: { Accept: 'application/sparql-results+json', 'User-Agent': UA },
  })
  if (!res.ok) throw new Error(`WDQS ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const body = await res.json()
  const out = new Map()
  for (const row of body.results?.bindings ?? []) {
    const qid = String(row.item?.value ?? '').replace(/^.*\/entity\//, '')
    const label = row.classLabel?.value
    if (!qid || !label) continue
    if (!out.has(qid)) out.set(qid, [])
    // A class whose label the service could not resolve comes back as the bare
    // QID. Keeping it is honest: it lands as `undetermined` and is REPORTED in
    // unrecognised_classes rather than silently dropped.
    out.get(qid).push(label)
  }
  return out
}

async function main() {
  const pending = (
    await sql(`select c.wikidata_qid
                 from public.cities c
                 ${REFRESH ? '' : 'left join public.city_place_class_probe p on p.wikidata_qid = c.wikidata_qid'}
                where c.duplicate_of_id is null
                  and c.wikidata_qid is not null
                  ${REFRESH ? '' : 'and p.wikidata_qid is null'}
                group by c.wikidata_qid
                order by c.wikidata_qid;`)
  ).map((r) => r.wikidata_qid)

  console.log(`${pending.length} QID(s) to probe${REFRESH ? ' (refresh)' : ''}, batch ${BATCH}`)
  if (pending.length === 0) return

  let written = 0
  let noClass = 0
  for (let b = 0; b < MAX_BATCHES && b * BATCH < pending.length; b++) {
    const slice = pending.slice(b * BATCH, (b + 1) * BATCH)
    let classes
    try {
      classes = await fetchClasses(slice)
    } catch (e) {
      // A WDQS failure is "ask again later", never evidence about the entity.
      // Writing an empty array here would stamp a whole batch as undetermined
      // on an upstream outage — the "absence of evidence recorded as evidence
      // of absence" failure this repo has paid for twice.
      console.error(`batch ${b}: ${e.message} — stopping, nothing written for this batch`)
      break
    }

    const rows = slice.map((q) => {
      const labels = classes.get(q) ?? []
      if (labels.length === 0) noClass++
      return `(${lit(q)}, ARRAY[${labels.map(lit).join(',')}]::text[])`
    })

    if (DRY_RUN) {
      for (const q of slice) {
        console.log(`  ${q}: ${(classes.get(q) ?? []).join(', ') || '<no P31>'}`)
      }
    } else {
      await sql(`insert into public.city_place_class_probe (wikidata_qid, classes)
                 values ${rows.join(',')}
                 on conflict (wikidata_qid) do update
                   set classes = excluded.classes, probed_at = now();`)
    }
    written += slice.length
    console.log(`batch ${b}: ${slice.length} probed (${written}/${pending.length})`)
    await sleep(SLEEP_MS)
  }

  console.log(`\n${DRY_RUN ? 'would write' : 'wrote'} ${written} row(s); ${noClass} had no P31`)
  if (!DRY_RUN) {
    const sig = (await sql('select public.city_place_class_signals() as s;'))[0].s
    console.log('city_place_class_signals:', JSON.stringify(sig, null, 2))
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
