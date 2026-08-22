#!/usr/bin/env node
// Operator driver for the marketplace brand-logo backfill.
//
// Context: marketplace_brands.logo_url was non-null on ZERO of 5,142 rows, so
// every maker plate on /marketplace/brands, every maker masthead and the weekly
// brand spotlight rendered a monogram. See migration
// 20260917100000_marketplace_brand_logos.sql for why the domain cannot simply
// be taken from a listing's merchant_domain, and
// supabase/functions/_shared/site-icon.ts for how a mark is found on the shop.
//
// Like backfill-city-fields.mjs this calls the edge function FROM POSTGRES via
// pg_net and polls net._http_response, so no function secret ever leaves the
// database — the operator only needs a Supabase PAT.
//
// Usage:
//   node scripts/data-quality/backfill-brand-logos.mjs --dry-run
//   node scripts/data-quality/backfill-brand-logos.mjs
//   node scripts/data-quality/backfill-brand-logos.mjs --batch 20 --max-batches 5
//
// Pacing: the cost is entirely upstream HTTP — one page fetch plus up to four
// image fetches per brand, each with a 12s ceiling. Batch 30 lands around two
// minutes, comfortably inside the 300s pg_net window; raising it risks the
// invocation being cut off mid-batch, which costs the fetches but loses nothing
// (an unstamped row is simply retried).
//
// Resumability is free: a brand is stamped logo_fetched_at whichever way it
// ends — resolved, no corroborating domain, or nothing found — so the work-list
// only ever shrinks. A MIRROR failure deliberately leaves the stamp null so the
// row is retried on the next run rather than being written off.

import { execFileSync } from 'node:child_process'

const PROJECT = 'xqeacpakadqfxjxjcewc'
const FN_URL = `https://${PROJECT}.supabase.co/functions/v1/enrich-logos`

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback
}
const DRY_RUN = args.includes('--dry-run')
const BATCH = Number(flag('batch', 30))
const MAX_BATCHES = Number(flag('max-batches', 60))
const SLEEP_MS = Number(flag('sleep', 2000))

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

async function invoke(body, timeoutMs = 300000) {
  const payload = JSON.stringify(body).replace(/'/g, "''")
  const rid = (
    await sql(`select net.http_post(
      url:='${FN_URL}',
      headers:=jsonb_build_object('Content-Type','application/json',
        'x-internal-secret',(select decrypted_secret from vault.decrypted_secrets where name='internal_invoke_secret')),
      body:='${payload}'::jsonb, timeout_milliseconds:=${timeoutMs}) as request_id;`)
  )[0].request_id

  for (let i = 0; i < 80; i++) {
    await sleep(5000)
    const r = await sql(`select status_code, content, error_msg from net._http_response where id=${rid};`)
    if (r[0]?.status_code != null) return { status: r[0].status_code, data: JSON.parse(r[0].content) }
    if (r[0]?.error_msg) throw new Error(`pg_net error: ${r[0].error_msg}`)
  }
  throw new Error(`timeout polling request ${rid}`)
}

async function remaining() {
  const r = await sql(`select count(*) n from public.marketplace_brands
    where status='approved' and coalesce(product_count,0) > 0
      and logo_url is null and logo_fetched_at is null;`)
  return Number(r[0].n)
}

async function main() {
  console.log(`batch=${BATCH} dry_run=${DRY_RUN}`)
  console.log(`${await remaining()} brands remaining`)

  const total = { processed: 0, logos_found: 0, from_logodev: 0, from_site: 0, no_domain: 0, not_found: 0, mirror_failed: 0, errors: 0 }

  for (let b = 1; b <= MAX_BATCHES; b++) {
    const { status, data } = await invoke({
      table: 'marketplace_brands',
      batch_size: BATCH,
      dry_run: DRY_RUN,
    })
    if (status !== 200) throw new Error(`HTTP ${status}: ${JSON.stringify(data).slice(0, 300)}`)

    const r = data.marketplace_brands
    for (const k of Object.keys(total)) total[k] += r[k] ?? 0
    console.log(
      `  batch ${b}: ${r.logos_found}/${r.processed} found ` +
        `(logodev ${r.from_logodev}, site ${r.from_site}) · no-domain ${r.no_domain} · ` +
        `none ${r.not_found} · mirror-failed ${r.mirror_failed} · remaining ${r.remaining}`,
    )

    if (r.processed === 0) break
    // A dry run writes nothing, so the work-list never shrinks and the same head
    // would be re-measured forever. One batch is the whole point of --dry-run.
    if (DRY_RUN) break
    if (r.remaining <= 0) break
    await sleep(SLEEP_MS)
  }

  console.log(`\ntotal: ${JSON.stringify(total)}`)
  console.log(`${await remaining()} brands remaining`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
