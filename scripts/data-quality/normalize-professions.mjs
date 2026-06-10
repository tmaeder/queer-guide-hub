#!/usr/bin/env node
// Driver for the profession data-quality pass.
//
// Phase 1 (deterministic, free): drains run_profession_normalize_backfill() in
//   small batches so the search_documents sync trigger never storms (the DB is
//   disk-constrained). Each batch is its own transaction; the RPC snapshots the
//   raw value into enrichment_status.profession (reversible) and marks the row
//   done, so re-runs are idempotent and safe to resume.
//
// Phase 2 (backfill empty, modest): for personalities with an empty profession
//   but a Wikidata QID, fetch P106 occupation and map it through the same
//   vocabulary normalizer. Yield is intentionally small — most empties are
//   bare-name draft rows with no QID, which Wikidata cannot resolve. Those are
//   left null and surface as profession debt in `personality_data_health`.
//
// Not done here: LLM extraction from bio for the ~70 empty-with-bio rows. That
//   path belongs to a circuit-broken edge function (reuse extractVenueAmenities-
//   style prompting in _shared/ai-enrichment.ts, CF content coerced to string);
//   left as a follow-up to avoid standing up LLM infra for a handful of rows.
//
// Auth: a Supabase personal access token (Management API). On macOS the CLI
//   token is read from the keychain automatically; otherwise set SUPABASE_PAT.
//
// Usage:
//   node scripts/data-quality/normalize-professions.mjs              # phase 1 + 2
//   node scripts/data-quality/normalize-professions.mjs --phase1     # normalize only
//   node scripts/data-quality/normalize-professions.mjs --phase2     # wikidata fill only
//   node scripts/data-quality/normalize-professions.mjs --batch 500  # phase-1 batch size

import { execFileSync } from 'node:child_process'

const PROJECT = 'xqeacpakadqfxjxjcewc'
const args = process.argv.slice(2)
const ONLY_1 = args.includes('--phase1')
const ONLY_2 = args.includes('--phase2')
const BATCH = Number(args[args.indexOf('--batch') + 1]) || 500
const WD_UA = 'queer.guide-dataquality/1.0 (tmaeder@me.com)'

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
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error(`mgmt API ${res.status}: ${(await res.text()).slice(0, 300)}`)
  return res.json()
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`

async function phase1() {
  console.log(`[phase1] draining run_profession_normalize_backfill(${BATCH}) …`)
  let total = 0
  for (;;) {
    const [row] = await sql(`SELECT * FROM run_profession_normalize_backfill(${BATCH});`)
    const processed = Number(row?.processed ?? 0)
    total += processed
    if (processed > 0) console.log(`  processed ${processed} (changed ${row.changed}), running total ${total}`)
    if (processed === 0) break
    await sleep(200) // let WAL / search-sync settle between batches
  }
  console.log(`[phase1] done — ${total} rows normalized`)
}

async function phase2() {
  const [{ values_clause: clause, n }] = await sql(`
    SELECT string_agg('wd:'||wikidata_qid, ' ') AS values_clause, count(*) n
    FROM personalities
    WHERE (profession IS NULL OR btrim(profession)='')
      AND wikidata_qid ~ '^Q[0-9]+$';`)
  if (!clause) return console.log('[phase2] no empty-with-QID rows; nothing to fill')
  console.log(`[phase2] ${n} empty-with-QID rows — querying Wikidata P106 …`)

  const q = `SELECT ?item ?occLabel WHERE { VALUES ?item { ${clause} } ?item wdt:P106 ?occ. ?occ rdfs:label ?occLabel. FILTER(LANG(?occLabel)="en") }`
  const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(q)}`
  const res = await fetch(url, { headers: { Accept: 'application/sparql-results+json', 'User-Agent': WD_UA } })
  if (!res.ok) throw new Error(`wikidata ${res.status}`)
  const data = await res.json()

  const first = new Map() // qid -> primary occupation label
  for (const r of data.results.bindings) {
    const qid = r.item.value.split('/').pop()
    if (!first.has(qid)) first.set(qid, r.occLabel.value)
  }
  if (first.size === 0) return console.log('[phase2] no occupations returned')

  const values = [...first].map(([qid, occ]) => `(${lit(qid)},${lit(occ)})`).join(',')
  const r = await sql(`
    WITH m(qid, occ) AS (VALUES ${values})
    UPDATE public.personalities p SET
      profession = public.normalize_profession(m.occ),
      enrichment_status = jsonb_set(
        coalesce(p.enrichment_status,'{}'::jsonb), '{profession}',
        jsonb_build_object('raw', m.occ, 'all', to_jsonb(ARRAY[m.occ]),
                           'normalized_at', now(), 'source', 'wikidata_p106'), true)
    FROM m
    WHERE p.wikidata_qid = m.qid AND (p.profession IS NULL OR btrim(p.profession)='')
    RETURNING 1;`)
  console.log(`[phase2] filled ${Array.isArray(r) ? r.length : 0} of ${first.size} resolvable rows`)
}

if (!ONLY_2) await phase1()
if (!ONLY_1) await phase2()
console.log('done.')
