#!/usr/bin/env node
// Operator driver for the venue description backfill.
//
// Drives the deployed `venue-description-backfill` edge function in a loop until the
// description-less backlog is drained (or --max is hit). The edge fn is the perpetual
// path (daily cron `venue_description_backfill`, batch 12); this script is for a fast
// initial backfill of the ~17.9k venues that have no description.
//
// It calls the edge fn from Postgres via pg_net (so the internal secret never leaves
// the database), polling net._http_response per batch — same pattern as
// classify-personhood.mjs.
//
// Auth: Supabase personal access token (Management API). On macOS read from the
// keychain automatically; otherwise set SUPABASE_PAT.
//
// Usage:
//   node scripts/data-quality/enrich-venue-descriptions.mjs --dry-run     # preview
//   node scripts/data-quality/enrich-venue-descriptions.mjs               # live, full drain
//   node scripts/data-quality/enrich-venue-descriptions.mjs --batch 12 --max 2000

import { execFileSync } from 'node:child_process'

const PROJECT = 'xqeacpakadqfxjxjcewc'
const FN_URL = `https://${PROJECT}.supabase.co/functions/v1/venue-description-backfill`
const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const BATCH = Number(args[args.indexOf('--batch') + 1]) || 12 // ~12 sequential CF AI calls fit the edge wall-clock
const MAX = Number(args[args.indexOf('--max') + 1]) || Infinity

function token() {
  if (process.env.SUPABASE_PAT) return process.env.SUPABASE_PAT
  const raw = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-w'], { encoding: 'utf8' }).trim()
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

async function invoke() {
  // daily_cap high so a manual drain isn't blocked by the cron's own cap accounting.
  const body = JSON.stringify({ batch_limit: BATCH, daily_cap: 1000000, dry_run: DRY_RUN }).replace(/'/g, "''")
  const send = `select net.http_post(
    url:='${FN_URL}',
    headers:=jsonb_build_object('Content-Type','application/json','x-internal-secret',(select decrypted_secret from vault.decrypted_secrets where name='internal_invoke_secret')),
    body:='${body}'::jsonb, timeout_milliseconds:=150000) as request_id;`
  const rid = (await sql(send))[0].request_id
  for (let i = 0; i < 40; i++) {
    await sleep(6000)
    const r = await sql(`select status_code, content from net._http_response where id=${rid};`)
    if (r[0]?.status_code != null) return { status: r[0].status_code, data: JSON.parse(r[0].content) }
  }
  throw new Error(`timeout polling request ${rid}`)
}

async function main() {
  console.log(`venue description backfill — batch ${BATCH}, max ${MAX}, dry_run=${DRY_RUN}`)
  const total = { processed: 0, filled: 0, skipped: 0, failed: 0 }
  let round = 0
  while (total.processed < MAX) {
    round++
    const { status, data } = await invoke()
    if (status !== 200) { console.error(`  batch ${round} HTTP ${status}:`, JSON.stringify(data).slice(0, 300)); break }
    if (data.circuit_open) { console.log('  LLM circuit open — stopping.'); break }
    console.log(`  batch ${round} [${status}] processed=${data.processed} filled=${data.filled} skipped=${data.skipped} failed=${data.failed}`)
    for (const k of Object.keys(total)) total[k] += data[k] || 0
    if (!data.processed || data.message === 'no venues due') { console.log('  backlog drained.'); break }
  }
  console.log('\nTOTAL', JSON.stringify(total))
}

main().catch((e) => { console.error(e); process.exit(1) })
