#!/usr/bin/env node
/**
 * Drive `tag-imagery` through the indexable glossary.
 *
 * Glossary photography was retired on 2026-08-28 and re-introduced on
 * 2026-10-10 under a write-time contract. This is the operator loop; every
 * decision about WHETHER a given photograph may publish lives in the edge
 * function and the database, not here.
 *
 *   node scripts/data-quality/backfill-tag-images.mjs --tier p18 --dry-run
 *   node scripts/data-quality/backfill-tag-images.mjs --tier p18 --batch 20
 *   node scripts/data-quality/backfill-tag-images.mjs --tier commons --batch 20
 *
 * READ THE PER-ROW `results`, NOT THE TALLIES. `refused: 6` reads the same
 * whether the six were right or half wrong — the lesson from `city_qid_gap_link`,
 * where aggregate counters hid three false refusals that would have written most
 * of China off permanently. `--verbose` prints every row; the first real run of
 * each tier should be read that way before it is trusted.
 *
 * Invoked through `pg_net` rather than with a bearer token, so the function's
 * internal secret never leaves the database — the pattern
 * backfill-brand-logos.mjs established.
 */
import { execFileSync } from 'node:child_process'

const PROJECT = 'xqeacpakadqfxjxjcewc'
const args = process.argv.slice(2)

function flag(name, fallback) {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback
}

const DRY_RUN = args.includes('--dry-run')
const VERBOSE = args.includes('--verbose') || DRY_RUN
const TIER = flag('tier', 'p18')
const BATCH = Number(flag('batch', 20))
const MAX_BATCHES = Number(flag('max-batches', 40))
const SLEEP_MS = Number(flag('sleep', 3000))
const SLUG = flag('slug', null)

if (!['p18', 'commons', 'stock'].includes(TIER)) {
  console.error(`✗ --tier must be p18 | commons | stock (got ${TIER})`)
  process.exit(2)
}

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

/** Fire the function through pg_net and poll for its response body. */
async function invoke(body, timeoutMs = 300000) {
  const rows = await sql(`
    select net.http_post(
      url := (select 'https://' || '${PROJECT}' || '.supabase.co/functions/v1/tag-imagery'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-secret',
        (select decrypted_secret from vault.decrypted_secrets where name = 'internal_invoke_secret')
      ),
      body := '${JSON.stringify(body).replace(/'/g, "''")}'::jsonb,
      timeout_milliseconds := ${timeoutMs}
    ) as request_id`)
  const requestId = rows?.[0]?.request_id
  if (!requestId) throw new Error('pg_net returned no request id')

  for (let i = 0; i < 80; i++) {
    await sleep(5000)
    const r = await sql(
      `select status_code, content, error_msg from net._http_response where id = ${requestId}`,
    )
    const row = r?.[0]
    if (!row) continue
    if (row.error_msg) throw new Error(`pg_net: ${row.error_msg}`)
    if (row.status_code) {
      try {
        return JSON.parse(row.content)
      } catch {
        throw new Error(`non-JSON response: ${String(row.content).slice(0, 300)}`)
      }
    }
  }
  throw new Error('timed out waiting for the function response')
}

async function remaining() {
  const r = await sql(`
    select count(*)::int as n from unified_tags
     where status = 'active' and seo_indexable and image_url is null
       and coalesce(enrichment_status -> 'tag_image' ->> 'state', '') <> 'data_unavailable'
       ${TIER === 'p18' ? 'and wikidata_id is not null' : ''}`)
  return r?.[0]?.n ?? 0
}

console.log(`tag-imagery · tier=${TIER} batch=${BATCH} dry_run=${DRY_RUN}`)
console.log(`${await remaining()} candidate tags remain for this tier`)

let published = 0
let queued = 0
let refused = 0
let errors = 0
const whyCounts = new Map()

for (let b = 0; b < MAX_BATCHES; b++) {
  const body = { tier: TIER, batch_size: BATCH, dry_run: DRY_RUN }
  if (SLUG) body.slug = SLUG

  let out
  try {
    out = await invoke(body)
  } catch (err) {
    console.error(`✗ batch ${b + 1} failed: ${err.message}`)
    break
  }

  // The function reports the tier it WORKED, not the one it was asked for. An
  // engine that silently works a different list is indistinguishable from a
  // healthy one — the defect that hid for months in `cities_due_for_refresh`.
  if (out.tier !== TIER) {
    console.error(`✗ asked for tier=${TIER} and the function reports tier=${out.tier} — stopping`)
    break
  }

  published += out.published ?? 0
  queued += out.queued ?? 0
  refused += out.refused ?? 0
  errors += out.errors ?? 0
  for (const r of out.results ?? []) {
    whyCounts.set(`${r.decision}:${r.why}`, (whyCounts.get(`${r.decision}:${r.why}`) ?? 0) + 1)
    if (VERBOSE) console.log(`   ${r.decision.padEnd(9)} ${r.slug.padEnd(34)} ${r.why}`)
  }

  console.log(
    `batch ${b + 1}: considered=${out.considered} eligible=${out.eligible} ` +
      `published=${out.published} queued=${out.queued} refused=${out.refused} errors=${out.errors}`,
  )

  // A dry run writes nothing, so the work list never shrinks and the loop would
  // re-offer the same head forever. Same deliberate stop as
  // backfill-brand-logos.mjs.
  if (DRY_RUN) {
    console.log('(dry run — stopping after one batch, since nothing was written)')
    break
  }
  if ((out.eligible ?? 0) === 0) {
    console.log('(no eligible tags left)')
    break
  }
  if (SLUG) break
  await sleep(SLEEP_MS)
}

console.log('')
console.log(`total: published=${published} queued=${queued} refused=${refused} errors=${errors}`)
console.log('outcome breakdown:')
for (const [k, n] of [...whyCounts.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  ${k}`)
}
console.log(`${await remaining()} candidate tags still remain for this tier`)
