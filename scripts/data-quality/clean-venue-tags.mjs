#!/usr/bin/env node
// Driver for the venue-tag controlled-vocabulary cleanup.
//
// venues.tags held uncontrolled TripAdvisor scraper noise (2,144 distinct values
// across 4,370 venues — food ingredients, atmosphere adjectives, source names,
// geography) rendered as clickable /resources/{tag} chips. This drains
// run_venue_tag_cleanup() in small batches so the search_documents sync trigger
// never storms (the DB is disk-constrained). Each batch is its own transaction;
// the RPC snapshots the raw value into enrichment_status.tags_cleanup
// (reversible) and only touches rows whose tags differ from the normalized
// fixed point, so re-runs are idempotent and safe to resume.
//
// The controlled vocabulary lives in public.amenities (kind in queer/venue_type);
// the default-reject normalizer is public.normalize_venue_tags(text[]) and is
// also wired into commit_venue_staging_item so noise can never re-enter on
// ingest. See migration 20260613120000_venue_tag_controlled_vocabulary.sql.
//
// Auth: a Supabase personal access token (Management API). On macOS the CLI
//   token is read from the keychain automatically; otherwise set SUPABASE_PAT.
//
// Usage:
//   node scripts/data-quality/clean-venue-tags.mjs            # drain (live)
//   node scripts/data-quality/clean-venue-tags.mjs --batch 200
//   node scripts/data-quality/clean-venue-tags.mjs --audit    # before/after only

import { execFileSync } from 'node:child_process'

const PROJECT = 'xqeacpakadqfxjxjcewc'
const args = process.argv.slice(2)
const AUDIT_ONLY = args.includes('--audit')
const BATCH = Number(args[args.indexOf('--batch') + 1]) || 300

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

async function audit(label) {
  const [r] = await sql(`
    SELECT (SELECT count(*) FROM (SELECT DISTINCT lower(t) FROM venues v, unnest(v.tags) t) s) AS distinct_tags,
           (SELECT max(cardinality(tags)) FROM venues) AS max_tags,
           (SELECT count(*) FROM venues WHERE tags IS NOT NULL AND cardinality(tags)>0) AS venues_with_tags;`)
  console.log(`[${label}] distinct=${r.distinct_tags} max_tags=${r.max_tags} venues_with_tags=${r.venues_with_tags}`)
}

await audit('before')
if (!AUDIT_ONLY) {
  let total = 0
  for (;;) {
    const [row] = await sql(`SELECT * FROM public.run_venue_tag_cleanup(${BATCH});`)
    const processed = Number(row?.processed ?? 0)
    total += processed
    if (processed > 0) console.log(`  cleaned ${processed} (dropped ${row.dropped_terms} terms), running total ${total}`)
    if (processed === 0) break
    await sleep(400) // let WAL / search-sync settle between batches
  }
  console.log(`done — ${total} venues normalized`)
  await audit('after')
}
