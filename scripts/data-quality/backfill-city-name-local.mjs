#!/usr/bin/env node
// One-shot driver: fill cities.name_local / name_local_lang for every city that
// already carries a wikidata_qid, by posting explicit city_ids to the
// city-factual-backfill link phase (migration 99991791356589_cities_name_local).
//
// The link phase reads P1705 / the label in the country's official language
// from the entity it already fetches, inside the class + coordinate gated
// "settlement" branch, and writes fill-if-empty. New rows get the value through
// the normal crons; this only works through the existing backlog.
//
// Calls the edge function FROM POSTGRES via pg_net (same as
// backfill-city-fields.mjs) so the webhook secret never leaves the database.
// Auth: SUPABASE_PAT, or the Supabase CLI token from the macOS keychain.
//
// Usage:
//   node scripts/data-quality/backfill-city-name-local.mjs --dry-run           # one batch, prints values
//   node scripts/data-quality/backfill-city-name-local.mjs                     # full sweep
//   node scripts/data-quality/backfill-city-name-local.mjs --batch 40 --max-batches 5
//
// Pacing: every cities UPDATE fans out through trg_sync_geo_spine into the
// spine + search_reindex_queue, hence small batches and a sleep between them.
// Resumable: the work list is "has a QID and name_local IS NULL", ordered by id
// with a cursor, so a restart continues; rows the link phase could not fill are
// passed over by the cursor rather than re-offered.

import { execFileSync } from 'node:child_process'

const PROJECT = 'xqeacpakadqfxjxjcewc'
const FN_URL = `https://${PROJECT}.supabase.co/functions/v1/city-factual-backfill`

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback
}
const DRY_RUN = args.includes('--dry-run')
const BATCH = Math.min(40, Number(flag('batch', 30)))
const SLEEP_MS = Number(flag('sleep', 3000))
const MAX_BATCHES = Number(flag('max-batches', 500))

function token() {
  if (process.env.SUPABASE_PAT) return process.env.SUPABASE_PAT
  const raw = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-w'], { encoding: 'utf8' }).trim()
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

async function invoke(body, timeoutMs = 150000) {
  const payload = JSON.stringify(body).replace(/'/g, "''")
  const rid = (await sql(`select net.http_post(
    url:='${FN_URL}',
    headers:=jsonb_build_object('Content-Type','application/json',
      'X-Webhook-Secret',(select decrypted_secret from vault.decrypted_secrets where name='city_quality_webhook_secret')),
    body:='${payload}'::jsonb, timeout_milliseconds:=${timeoutMs}) as request_id;`))[0].request_id
  // Resolved BY REQUEST ID: net._http_response is shared by every caller.
  for (let i = 0; i < 40; i++) {
    await sleep(5000)
    const r = await sql(`select status_code, content, error_msg, timed_out from net._http_response where id=${rid};`)
    if (r[0]?.status_code != null) return { status: r[0].status_code, data: JSON.parse(r[0].content) }
    if (r[0]?.timed_out) throw new Error(`request ${rid} timed out client-side`)
    if (r[0]?.error_msg) throw new Error(`pg_net error: ${r[0].error_msg}`)
  }
  throw new Error(`timeout polling request ${rid}`)
}

async function nextIds(afterId) {
  const rows = await sql(`
    select c.id from public.cities c
    where c.duplicate_of_id is null
      and c.wikidata_qid is not null
      and c.name_local is null
      and coalesce(c.shell_status::text,'real') <> 'merged'
      ${afterId ? `and c.id > '${afterId}'` : ''}
    order by c.id limit ${BATCH};`)
  return rows.map((r) => r.id)
}

async function coverage() {
  const r = await sql(`
    select count(*) filter (where wikidata_qid is not null) as with_qid,
           count(*) filter (where wikidata_qid is not null and name_local is not null) as filled,
           count(*) filter (where name_local is not null) as filled_total
    from public.cities where duplicate_of_id is null;`)
  return r[0]
}

async function main() {
  console.log(`batch=${BATCH} sleep=${SLEEP_MS}ms dry_run=${DRY_RUN}`)
  console.log('before:', await coverage())
  let cursor = null
  let filled = 0
  const unmapped = new Set()
  for (let b = 1; b <= MAX_BATCHES; b++) {
    const ids = await nextIds(cursor)
    if (!ids.length) { console.log('  work list empty — done'); break }
    cursor = ids[ids.length - 1]
    const { status, data } = await invoke({ phase: 'link', city_ids: ids, batch_limit: ids.length, dry_run: DRY_RUN })
    if (data.circuit_open) { console.log(`  batch ${b}: circuit open (${data.circuit_open}) — backing off 60s`); await sleep(60000); continue }
    if (data.error) { console.error(`  batch ${b} error: ${data.error}`); break }
    filled += data.name_local_filled || 0
    for (const u of data.name_local_unmapped_languages || []) unmapped.add(u)
    console.log(`  batch ${b} [${status}] processed=${data.processed} name_local_filled=${data.name_local_filled ?? 0} (running ${filled})`)
    if (DRY_RUN) {
      for (const r of data.results || []) {
        console.log(`    ${r.name} -> ${r.name_local ?? '∅'}${r.name_local_lang ? ` [${r.name_local_lang}]` : ''}${r.reason ? `  (${r.reason})` : ''}`)
      }
      break
    }
    await sleep(SLEEP_MS)
  }
  if (unmapped.size) console.log('unmapped country languages:', [...unmapped].sort().join(', '))
  console.log('after:', await coverage())
}

main().catch((e) => { console.error(e); process.exit(1) })
