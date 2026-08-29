#!/usr/bin/env node
// Operator driver for the LLM remainder of the taxonomy-v3 re-filing
// (2026-08-29 program, PR C). The deterministic migration
// (20261006140100) covers ~94% of active tags; this drives the deployed
// `categorize-tags` edge function with `only_misfiled: true` over the rest —
// tags whose primary category still sits outside the v3 tree. Unlike
// `recategorize`, that mode never overwrites a correct v3 filing.
//
// The cron sweep (`tag-enrichment-sweep`, <=50 categorizations / 2h) would
// take weeks to drain this; explicit batches finish in minutes.
//
// It is a REFINEMENT, not a merge gate. The cutover (20261006150000) re-files
// whatever is left on the retired tree itself, mapping a v2 line to its v3
// line and a dissolved stop to its successor — the same map the URL redirects
// use. That is honest but coarse: it preserves "this tag belongs to this
// line" without inventing a stop. This driver is what turns a line-level
// filing into a stop, and the nightly sweep keeps doing it afterwards.
//
// It calls the edge function from Postgres via pg_net (service secrets never
// leave the database), then reports the remaining count from the same query
// the dry-run used, so the number cannot diverge from what the migration
// measured.
//
// Auth: Supabase Management API PAT (macOS keychain via the CLI, or
// SUPABASE_PAT).
//
// Usage:
//   node scripts/data-quality/refile-tag-remainder.mjs --status   # count only
//   node scripts/data-quality/refile-tag-remainder.mjs            # drive to zero
//   node scripts/data-quality/refile-tag-remainder.mjs --rounds 3 # cap rounds

import { execFileSync } from 'node:child_process'

const PROJECT = 'xqeacpakadqfxjxjcewc'
const args = process.argv.slice(2)
const STATUS_ONLY = args.includes('--status')
const MAX_ROUNDS = Number(args[args.indexOf('--rounds') + 1]) || 10

function token() {
  if (process.env.SUPABASE_PAT) return process.env.SUPABASE_PAT
  const raw = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-w'], {
    encoding: 'utf8',
  }).trim()
  return Buffer.from(raw.replace(/^go-keyring-base64:/, ''), 'base64').toString('utf8')
}

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error(`SQL ${res.status}: ${await res.text()}`)
  return res.json()
}

const V3_ROOTS = `'identity','sex-kink','relationships-family','health','safety-consent','culture-community','history-rights','places-scene'`

async function remainder() {
  const rows = await sql(`
    select count(*)::int as n
    from unified_tags t
    join tag_category_assignments a on a.tag_id = t.id and a.is_primary
    join tag_categories c on c.id = a.category_id
    left join tag_categories p on p.id = c.parent_id
    where t.status = 'active' and t.merged_into_id is null
      and coalesce(p.slug, c.slug) not in (${V3_ROOTS})`)
  return rows[0].n
}

async function driveBatch() {
  // Invoke categorize-tags via pg_net so the service key stays in the DB;
  // poll the response by REQUEST ID (never by recency — shared table).
  const rows = await sql(`
    with req as (
      select net.http_post(
        url := 'https://${PROJECT}.supabase.co/functions/v1/categorize-tags',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-internal-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'internal_invoke_secret')
        ),
        body := jsonb_build_object('only_misfiled', true, 'batch_size', 50),
        timeout_milliseconds := 120000
      ) as id
    ) select id from req`)
  const reqId = rows[0].id
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 5000))
    const resp = await sql(
      `select status_code, left(content, 400) as body from net._http_response where id = ${reqId}`,
    )
    if (resp.length > 0 && resp[0].status_code != null) return resp[0]
  }
  return { status_code: null, body: 'timed out waiting for pg_net response (function may still be running)' }
}

const before = await remainder()
console.log(`remainder on old tree: ${before} active tags`)
if (STATUS_ONLY || before === 0) process.exit(0)

for (let round = 1; round <= MAX_ROUNDS; round++) {
  const res = await driveBatch()
  const now = await remainder()
  console.log(`round ${round}: fn=${res.status_code} ${res.body?.slice(0, 200) ?? ''} — remainder ${now}`)
  if (now === 0) break
  if (res.status_code == null) {
    console.log('no verifiable response; stopping rather than hammering (absence of evidence)')
    break
  }
}
console.log(`final remainder: ${await remainder()}`)
