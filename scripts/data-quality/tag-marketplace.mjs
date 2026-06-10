#!/usr/bin/env node
// One-time / ad-hoc driver for the marketplace tag backfill (P1b evidence ladder).
//
// Drives the deployed `marketplace-tag-backfill` edge function in bounded batches
// until every active listing has been classified once (classified_at >= run start).
// The daily cron (batch 150) is the perpetual path; this drains the initial 13.8k.
//
// Each batch performs <=150 listing UPDATEs (each fires the search-doc trigger), so
// the inter-batch sleep keeps the disk-constrained search sync comfortable.
//
// It calls the edge function from Postgres via pg_net (so the webhook secret never
// leaves the database), polling net._http_response for each batch.
//
// Auth: Supabase personal access token (Management API); macOS keychain fallback.
//
// Usage:
//   node scripts/data-quality/tag-marketplace.mjs --dry-run        # one preview batch
//   node scripts/data-quality/tag-marketplace.mjs                  # drain (extract only)
//   node scripts/data-quality/tag-marketplace.mjs --llm            # extract + LLM gap-fill
//   node scripts/data-quality/tag-marketplace.mjs --batch 100      # batch size

import { execFileSync } from 'node:child_process'

const PROJECT = 'xqeacpakadqfxjxjcewc'
const FN_URL = `https://${PROJECT}.supabase.co/functions/v1/marketplace-tag-backfill`
const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const WANT_LLM = args.includes('--llm')
const BATCH = Number(args[args.indexOf('--batch') + 1]) || (WANT_LLM ? 40 : 150)
const SLEEP_BETWEEN_BATCHES_MS = 8000

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
  const sources = WANT_LLM ? ['extract', 'llm'] : ['extract']
  const body = JSON.stringify({ sources, batch_limit: BATCH, daily_cap: 999999, dry_run: DRY_RUN })
  const send = `select net.http_post(
    url:='${FN_URL}',
    headers:=jsonb_build_object('Content-Type','application/json','X-Webhook-Secret',(select decrypted_secret from vault.decrypted_secrets where name='marketplace_tag_webhook_secret')),
    body:='${body}'::jsonb, timeout_milliseconds:=150000) as request_id;`
  const rid = (await sql(send))[0].request_id
  for (let i = 0; i < 30; i++) {
    await sleep(6000)
    const r = await sql(`select status_code, content from net._http_response where id=${rid};`)
    if (r[0]?.status_code != null) return { status: r[0].status_code, data: JSON.parse(r[0].content) }
  }
  throw new Error(`timeout polling request ${rid}`)
}

async function remaining(runStart) {
  const r = await sql(`select count(*)::int n from public.marketplace_listings
    where status='active' and (tagged_at is null or tagged_at < '${runStart}');`)
  return r[0].n
}

async function main() {
  const runStart = new Date().toISOString()
  let left = await remaining(runStart)
  console.log(`${left} active listings unclassified this run; batch ${BATCH}, llm=${WANT_LLM}, dry_run=${DRY_RUN}`)
  const total = { processed: 0, retyped: 0, attrs_added: 0, gated: 0, relevance_updated: 0 }
  let batchNo = 0
  while (left > 0) {
    batchNo++
    const { status, data } = await invoke()
    for (const k of Object.keys(total)) total[k] += data[k] || 0
    console.log(`  batch ${batchNo} [${status}] processed=${data.processed} retyped=${data.retyped} attrs=${data.attrs_added} gated=${data.gated} relevance=${data.relevance_updated}${data.circuit_open ? ' CIRCUIT_OPEN' : ''}`)
    if (DRY_RUN) { console.log('  dry run — one batch only.'); break }
    if (data.circuit_open) { console.log('  LLM circuit open — stopping.'); break }
    if (!data.processed) break
    left = await remaining(runStart)
    console.log(`  ${left} remaining`)
    await sleep(SLEEP_BETWEEN_BATCHES_MS)
  }
  console.log('\nTOTAL', JSON.stringify(total))
}

main().catch((e) => { console.error(e); process.exit(1) })
