#!/usr/bin/env node
// Operator driver for the city fields backfill.
//
// Context: 13 city columns (climate_type, local_language, mayor, postal_codes,
// area_codes, sister_cities, universities, economy_sectors, cost_of_living,
// transportation_info, demographics, best_time_to_visit, notable_landmarks)
// were at literal 0% because nothing ever wrote them, and the engine that wrote
// the other eight had been filling nothing for 36 days — cities_due_for_refresh
// had starved onto ~545 unresolvable import shells. See the migrations
// 20260801133714 / 20260801133923 and supabase/functions/_shared/wikidata-city.ts.
//
// Like classify-personhood.mjs, this calls the edge function FROM POSTGRES via
// pg_net and polls net._http_response, so CITY_QUALITY_WEBHOOK_SECRET never
// leaves the database — the operator only needs a Supabase PAT.
//
// Auth: Supabase personal access token. On macOS the CLI token is read from the
// keychain automatically; otherwise set SUPABASE_PAT.
//
// Usage:
//   node scripts/data-quality/backfill-city-fields.mjs --phase link --scope content_only --dry-run
//   node scripts/data-quality/backfill-city-fields.mjs --phase link --scope content_only
//   node scripts/data-quality/backfill-city-fields.mjs --phase sparql --scope content_only
//   node scripts/data-quality/backfill-city-fields.mjs --phase derived
//   node scripts/data-quality/backfill-city-fields.mjs --phase link --scope all
//
// Pacing: the binding constraint is NOT the upstream APIs, it is the write
// amplification. One cities UPDATE fans out through trg_sync_geo_spine into
// geo_places + a ~40-column geo_city_profiles upsert and a search_documents
// delete+insert (HNSW maintenance). Hence batch<=300 and a deliberate inter-batch
// sleep. Resumability is free: the selector no longer returns rows that are
// resolved or terminally unresolvable, so a restart simply continues.

import { execFileSync } from 'node:child_process'

const PROJECT = 'xqeacpakadqfxjxjcewc'
const FN_URL = `https://${PROJECT}.supabase.co/functions/v1/city-factual-backfill`

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback
}
const DRY_RUN = args.includes('--dry-run')
// Re-resolve the cached QID instead of trusting it. Needed after a resolver fix:
// the cache makes a repeat visit cheap, so a wrong QID is otherwise sticky.
const RELINK = args.includes('--relink')
const PHASE = flag('phase', 'link')
const SCOPE = flag('scope', 'content_first')
const BATCH = Number(flag('batch', PHASE === 'sparql' ? 24 : 40))
const SLEEP_MS = Number(flag('sleep', 3000))
const MAX_BATCHES = Number(flag('max-batches', 500))
const DRY_STREAK_LIMIT = Number(flag('dry-streak', 3))

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

async function invoke(body, timeoutMs = 150000) {
  const payload = JSON.stringify(body).replace(/'/g, "''")
  const send = `select net.http_post(
    url:='${FN_URL}',
    headers:=jsonb_build_object('Content-Type','application/json',
      'X-Webhook-Secret',(select decrypted_secret from vault.decrypted_secrets where name='city_quality_webhook_secret')),
    body:='${payload}'::jsonb, timeout_milliseconds:=${timeoutMs}) as request_id;`
  const rid = (await sql(send))[0].request_id
  for (let i = 0; i < 40; i++) {
    await sleep(5000)
    const r = await sql(`select status_code, content, error_msg from net._http_response where id=${rid};`)
    if (r[0]?.status_code != null) return { status: r[0].status_code, data: JSON.parse(r[0].content) }
    if (r[0]?.error_msg) throw new Error(`pg_net error: ${r[0].error_msg}`)
  }
  throw new Error(`timeout polling request ${rid}`)
}

/** Rows the selector still considers workable for this scope. */
async function remaining() {
  const scopeFilter = SCOPE === 'content_only'
    ? `and (exists (select 1 from public.venues v where v.city_id=c.id)
            or exists (select 1 from public.events e where e.city_id=c.id))`
    : ''
  const linkedFilter = PHASE === 'sparql'
    ? `and c.wikidata_qid is not null
       and coalesce(c.enrichment_status->'airports'->>'state','') not in ('resolved','data_unavailable')`
    : `and coalesce(c.enrichment_status->'wikidata_link'->>'state','') <> 'resolved'`
  const r = await sql(`
    select count(*) n from public.cities c
    where c.duplicate_of_id is null and c.shell_status <> 'merged'
      and coalesce(c.enrichment_status->'wikidata_link'->>'state','') <> 'data_unavailable'
      and coalesce(c.enrichment_status->'disposition'->>'state','') <> 'not_a_city'
      ${linkedFilter} ${scopeFilter};`)
  return Number(r[0].n)
}

async function runDerived() {
  // Pure-SQL appliers; both are internally capped at 300 rows per call.
  for (const fn of ['run_city_cost_of_living_backfill', 'run_city_timezone_backfill']) {
    let guard = 0
    for (;;) {
      const r = await sql(`select public.${fn}(300) as out;`)
      const out = r[0].out
      console.log(`  ${fn}: ${JSON.stringify(out)}`)
      if (!out || (out.updated ?? 0) === 0 || ++guard > 60) break
      await sleep(1000)
    }
  }
}

async function main() {
  console.log(`phase=${PHASE} scope=${SCOPE} batch=${BATCH} sleep=${SLEEP_MS}ms dry_run=${DRY_RUN}`)

  if (PHASE === 'derived') {
    await runDerived()
    return
  }

  const before = await remaining()
  console.log(`${before} cities remaining for this phase`)

  const total = { processed: 0, updated: 0, skipped: 0, failed: 0 }
  const filledCounts = {}
  // The selector round-robins by last_refreshed_at and never returns empty, so
  // once the pool is exhausted it just keeps handing back cities that have
  // nothing left to fill. Without this the driver spins forever making upstream
  // calls for nothing (observed: batches 130-192 all 0/40).
  let dryStreak = 0

  for (let b = 1; b <= MAX_BATCHES; b++) {
    const { status, data } = await invoke({
      phase: PHASE, scope: SCOPE, batch_limit: BATCH, dry_run: DRY_RUN, relink: RELINK,
    }, PHASE === 'sparql' ? 240000 : 150000)

    if (data.circuit_open) {
      // A tripped breaker means the upstream is degraded, not that the work is
      // done. Back off and retry rather than burning through the work-list.
      console.log(`  batch ${b}: circuit open (${data.circuit_open}) — backing off 60s`)
      await sleep(60000)
      continue
    }
    if (data.error) { console.error(`  batch ${b} error: ${data.error}`); break }
    if (!data.processed) { console.log(`  batch ${b}: nothing due — done`); break }

    for (const k of Object.keys(total)) total[k] += data[k] || 0
    for (const r of data.results || []) for (const f of r.filled || []) filledCounts[f] = (filledCounts[f] || 0) + 1

    console.log(
      `  batch ${b} [${status}] processed=${data.processed} updated=${data.updated} ` +
      `skipped=${data.skipped} failed=${data.failed ?? 0} (running updated=${total.updated})`,
    )

    dryStreak = data.updated > 0 ? 0 : dryStreak + 1
    if (dryStreak >= DRY_STREAK_LIMIT) {
      console.log(`  ${DRY_STREAK_LIMIT} consecutive batches filled nothing — pool exhausted, stopping.`)
      break
    }

    if (DRY_RUN) break            // a dry run must not loop: it changes no state
    await sleep(SLEEP_MS)
  }

  const after = await remaining()
  console.log(`\nTOTAL ${JSON.stringify(total)}`)
  console.log(`remaining ${before} -> ${after}`)
  console.log('fields filled:', JSON.stringify(filledCounts, null, 1))
}

main().catch((e) => { console.error(e); process.exit(1) })
