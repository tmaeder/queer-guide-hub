#!/usr/bin/env node
// Classify the deprecated-with-prose glossary backlog by what Wikidata says the
// term IS, so a revival decision rests on the term's class and not on its
// usage_count.
//
// WHY THIS EXISTS. Two one-shot sweeps deprecated 3,893 tags for having zero
// ENTITY assignments; 2,452 of them carry real prose. For a facet vocabulary
// that rule is right. For a glossary it is not: no venue is ever tagged
// "homonationalism", and /tags is a glossary. But "revive everything with
// prose" is equally wrong — the same corpus contains scrape residue, and this
// codebase has twice paid for a rule-based verdict published unread.
//
// SO THIS SCRIPT DECIDES NOTHING. It narrows ~2,452 rows to a hand-readable
// candidate list and writes the evidence for each one to
// out/theory-cohort-review.json. A human reads every survivor and records
// accept/reject with a reason. Only accepted rows reach a migration.
//
// THE EARLIER 35-ROW REVIVAL USED A HEURISTIC THAT IS TOO COARSE HERE.
// migration 20261205143900 excluded any row an `admin:*` actor had touched, on
// the reasoning that an admin action means deliberate curation. Measured on this
// cohort that is false: the `admin:*` actors on these rows are
// `admin:tag-category-resync`, `admin:roundtrip-test` and
// `admin:lgbtqa-prevention-2-20260829` — mechanical jobs that happen to carry an
// `admin:` prefix. Treating them as human decisions hides ~330 rows that no
// human ever ruled on. MECHANICAL_ACTORS below is that correction, and it is an
// allowlist of three known job names rather than a pattern, so a genuine
// `admin:<person>` action still protects a row.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/data-quality/classify-theory-cohort.mjs
//   ... --limit 50        smaller probe run
//   ... --cached-only     re-derive the report from out/wikidata-cache.json

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, 'out')
const CACHE = join(OUT, 'wikidata-cache.json')
const REPORT = join(OUT, 'theory-cohort-review.json')

const UA = 'queer.guide-dataquality/1.0 (tmaeder@me.com)'
const args = process.argv.slice(2)
const LIMIT = Number(args[args.indexOf('--limit') + 1]) || 0
const CACHED_ONLY = args.includes('--cached-only')

// Actors that are jobs wearing an `admin:` prefix. Not evidence of a human
// decision. Allowlist, never a pattern — see header.
const MECHANICAL_ACTORS = new Set([
  'admin:tag-category-resync',
  'admin:roundtrip-test',
  'admin:lgbtqa-prevention-2-20260829',
])

// Wikidata classes that make a term a candidate for a theory/scholarship
// glossary. Matched against the ENGLISH LABEL of every P31 and P279 value, not
// against QIDs, because the corpus reaches these classes by many routes and a
// frozen QID list silently stops matching when Wikidata re-parents an item.
const CLASS_PATTERNS = [
  /\bacademic (discipline|major|field)\b/i,
  /\bfield of (study|research|work)\b/i,
  /\b(theory|theories)\b/i,
  /\bphilosophical (concept|theory|movement|school)\b/i,
  /\bsocial (concept|theory|phenomenon|movement|norm|science)\b/i,
  /\b(school of thought|intellectual movement)\b/i,
  /\bconcept\b/i,
  /\bideology\b/i,
  /\bcritique\b/i,
  /\b(area|branch) of\b/i,
  /\bstudies\b/i,
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// PostgREST, not a SQL RPC — this project has no exec_sql endpoint and the
// sibling scripts all query tables directly.
function creds() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    // "could not look" must never read as "nothing found".
    console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (or use --cached-only)')
    process.exit(2)
  }
  return { url, key }
}

async function rest(path) {
  const { url, key } = creds()
  const res = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key, authorization: `Bearer ${key}` },
  })
  if (!res.ok) throw new Error(`rest ${res.status} on ${path}: ${await res.text()}`)
  return res.json()
}

// `in.(…)` is a URL, and this project has measured it breaking around 600 ids.
async function restIn(table, column, ids, select, extra = '') {
  const out = []
  for (let i = 0; i < ids.length; i += 400) {
    const chunk = ids.slice(i, i + 400)
    out.push(...await rest(`${table}?${column}=in.(${chunk.join(',')})&select=${select}${extra}`))
  }
  return out
}

// Which of these tags did a REAL human admin ever act on? Anything in
// MECHANICAL_ACTORS is a job wearing an `admin:` prefix and does not count.
async function realAdminTouched(ids) {
  const rows = await restIn('tag_change_log', 'tag_id', ids, 'tag_id,actor', '&actor=like.admin:*')
  const touched = new Set()
  for (const r of rows) if (!MECHANICAL_ACTORS.has(r.actor)) touched.add(r.tag_id)
  return touched
}

async function wbgetentities(ids) {
  const out = {}
  for (let i = 0; i < ids.length; i += 40) {
    const chunk = ids.slice(i, i + 40)
    const u = new URL('https://www.wikidata.org/w/api.php')
    u.search = new URLSearchParams({
      action: 'wbgetentities', ids: chunk.join('|'), format: 'json',
      props: 'labels|descriptions|claims', languages: 'en',
    }).toString()
    const res = await fetch(u, { headers: { 'user-agent': UA } })
    if (!res.ok) throw new Error(`wikidata ${res.status}`)
    const { entities } = await res.json()
    Object.assign(out, entities)
    await sleep(300)
  }
  return out
}

function claimIds(claims, prop) {
  return (claims?.[prop] ?? [])
    .filter((s) => s.rank !== 'deprecated')
    .map((s) => s.mainsnak?.datavalue?.value?.id)
    .filter(Boolean)
}

async function main() {
  mkdirSync(OUT, { recursive: true })

  let rows
  if (CACHED_ONLY) {
    if (!existsSync(CACHE)) { console.error('no cache to re-derive from'); process.exit(2) }
    ;({ rows } = JSON.parse(readFileSync(CACHE, 'utf8')))
  } else {
    const raw = await rest(
      'unified_tags?status=eq.deprecated&merged_into_id=is.null&wikidata_id=not.is.null'
      + '&select=id,slug,name,wikidata_id,category,description,long_description,deprecation_reason'
      + '&order=slug&limit=5000',
    )
    // Length filter client-side: PostgREST has no length() operator.
    rows = raw.filter((r) => (r.description ?? '').length >= 200)
    const touched = await realAdminTouched(rows.map((r) => r.id))
    for (const r of rows) r.real_admin = touched.has(r.id)
  }

  const eligible = rows.filter((r) => !r.real_admin)
  const qids = [...new Set(eligible.map((r) => r.wikidata_id))]
  console.error(`${rows.length} deprecated prose rows with a QID; ${eligible.length} with no human decision`)

  let entities
  if (CACHED_ONLY && existsSync(CACHE)) {
    entities = JSON.parse(readFileSync(CACHE, 'utf8')).entities
  } else {
    const use = LIMIT ? qids.slice(0, LIMIT) : qids
    console.error(`resolving ${use.length} QIDs…`)
    entities = await wbgetentities(use)
    writeFileSync(CACHE, JSON.stringify({ rows, entities }, null, 2))
  }

  // One pass to collect every class QID, then ONE batched label lookup. The
  // naive shape re-requests the same class label once per tag.
  const classIds = new Set()
  for (const e of Object.values(entities)) {
    if (e.missing !== undefined) continue
    for (const p of ['P31', 'P279']) for (const id of claimIds(e.claims, p)) classIds.add(id)
  }
  const classEnts = await wbgetentities([...classIds])
  const classLabel = Object.fromEntries(
    Object.entries(classEnts).map(([q, e]) => [q, e.labels?.en?.value ?? '']),
  )

  const candidates = []
  const rejected = []
  for (const r of eligible) {
    const e = entities[r.wikidata_id]
    if (!e || e.missing !== undefined) {
      rejected.push({ ...slim(r), why: 'wikidata item missing' })
      continue
    }
    const classes = [...new Set([...claimIds(e.claims, 'P31'), ...claimIds(e.claims, 'P279')])]
      .map((q) => ({ qid: q, label: classLabel[q] ?? '' }))
    const matched = classes.filter((c) => CLASS_PATTERNS.some((p) => p.test(c.label)))
    const rec = {
      ...slim(r),
      wikidataLabel: e.labels?.en?.value ?? '',
      wikidataDescription: e.descriptions?.en?.value ?? '',
      classes: classes.map((c) => `${c.qid} ${c.label}`),
      matchedClasses: matched.map((c) => `${c.qid} ${c.label}`),
      // A human fills these two in. Nothing is revived until `decision` is set.
      decision: null,
      decisionReason: null,
    }
    if (matched.length) candidates.push(rec)
    else rejected.push({ ...rec, why: 'no theory/field/concept class' })
  }

  const report = {
    generatedFrom: 'scripts/data-quality/classify-theory-cohort.mjs',
    note:
      'candidates[] is a WORK LIST, not a verdict. Every entry needs decision '
      + '("accept"|"reject") and decisionReason filled in by a human before it may enter a '
      + 'migration. rejected[] is kept so the exclusion is auditable rather than silent.',
    counts: {
      deprecatedProseWithQid: rows.length,
      noHumanDecision: eligible.length,
      candidates: candidates.length,
      rejected: rejected.length,
    },
    candidates,
    rejected,
  }
  writeFileSync(REPORT, JSON.stringify(report, null, 2))
  console.error(`candidates: ${candidates.length}  rejected: ${rejected.length}  -> ${REPORT}`)
  if (candidates.length > 150) {
    console.error('MORE THAN 150 CANDIDATES — re-scope rather than widening the rule (see plan).')
  }
}

function slim(r) {
  return {
    slug: r.slug,
    name: r.name,
    wikidata_id: r.wikidata_id,
    category: r.category,
    deprecation_reason: r.deprecation_reason,
    description: (r.description ?? '').slice(0, 400),
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
