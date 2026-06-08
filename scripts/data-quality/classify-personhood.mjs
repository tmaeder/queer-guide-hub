#!/usr/bin/env node
// One-time / ad-hoc driver for the personhood disposition pass.
//
// Detects organizations / venues / teams misfiled in `personalities` and
// reversibly archives the confirmed non-persons by driving the deployed
// `pipeline-classify-personhood` edge function in batches. The edge function is
// the perpetual path (weekly cron `wf-classify-personhood`); this script is for
// backfills and operator-driven sweeps with a broader recall net than the tight
// `personalities_nonperson_candidates` selector.
//
// It calls the edge function from Postgres via pg_net (so the INTERNAL_INVOKE
// secret never leaves the database), polling net._http_response for each batch.
//
// Auth: a Supabase personal access token (Management API). On macOS the CLI
// token is read from the keychain automatically; otherwise set SUPABASE_PAT.
//
// Usage:
//   node scripts/data-quality/classify-personhood.mjs --dry-run        # preview
//   node scripts/data-quality/classify-personhood.mjs                  # live
//   node scripts/data-quality/classify-personhood.mjs --batch 12       # batch size
//   node scripts/data-quality/classify-personhood.mjs --selector       # tight RPC pool only
//
// Disposition (hybrid-by-confidence, conservative):
//   non_person & confidence>=0.8 → archive_personality_as_nonperson (reversible)
//   uncertain                    → enrichment_status.personhood (needs_attention)
//   person                       → confirmed, excluded from future runs

import { execFileSync } from 'node:child_process'

const PROJECT = 'xqeacpakadqfxjxjcewc'
const FN_URL = `https://${PROJECT}.supabase.co/functions/v1/pipeline-classify-personhood`
const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const SELECTOR_ONLY = args.includes('--selector')
const BATCH = Number(args[args.indexOf('--batch') + 1]) || 12

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

// Broad recall net (bio describes an org/venue/team OR org-suffix name). The LLM
// grounded in the bio is the precision gate, so recall can be generous.
const BROAD_NET = `
  select coalesce(jsonb_agg(id), '[]'::jsonb) ids from (
    select id from public.personalities
    where duplicate_of_id is null
      and coalesce(enrichment_status->'personhood'->>'verdict','')=''
      and coalesce(trim(bio),trim(description),'') <> ''
      and (
        coalesce(bio,description,'') ~* '\\m(is|was)\\s+(a|an|the)\\s+([a-z''-]+\\s+){0,4}(organization|organisation|non-?profit|nonprofit|charity|charitable|foundation|ngo|association|collective|cooperative|team\\M|club\\M|sports|restaurant|eatery|bistro|diner|caf[eé]|coffee|bar\\M|pub\\M|nightclub|bathhouse|sauna|guesthouse|guest\\s?house|hostel|hotel\\M|venue|festival|chorus|chorale|choir|orchestra|ensemble|band\\M|record\\s+label|magazine|newspaper|publication|website|app\\M|platform|company|business|brand|shop|store|gallery|museum|theatre|theater|spa\\M)'
        or coalesce(bio,description,'') ~* '\\m(located in|located at|offers|serves|based in|opening hours|founded in|established in|members of the|guesthouse)\\M'
        or name ~* '\\m(inc\\.?|llc|ltd\\.?|gmbh|e\\.v\\.|foundation|project|collective|chorus|club|society|association|network|coalition|alliance|ministries|church|temple|\\bfc\\b|united|water\\s?polo|rugby)\\M'
      )
    order by (visibility='public') desc, name
  ) q;`

const SELECTOR = `select coalesce(jsonb_agg(id),'[]'::jsonb) ids from public.personalities_nonperson_candidates(100000);`

async function invoke(ids) {
  const body = JSON.stringify({ dry_run: DRY_RUN, ids }).replace(/'/g, "''")
  const send = `select net.http_post(
    url:='${FN_URL}',
    headers:=jsonb_build_object('Content-Type','application/json','x-internal-secret',(select decrypted_secret from vault.decrypted_secrets where name='internal_invoke_secret')),
    body:='${body}'::jsonb, timeout_milliseconds:=150000) as request_id;`
  const rid = (await sql(send))[0].request_id
  for (let i = 0; i < 30; i++) {
    await sleep(6000)
    const r = await sql(`select status_code, content from net._http_response where id=${rid};`)
    if (r[0]?.status_code != null) return { status: r[0].status_code, data: JSON.parse(r[0].content) }
  }
  throw new Error(`timeout polling request ${rid}`)
}

async function main() {
  const idsRes = await sql(SELECTOR_ONLY ? SELECTOR : BROAD_NET)
  const ids = idsRes[0].ids
  console.log(`${ids.length} candidates (${SELECTOR_ONLY ? 'selector RPC' : 'broad net'}), batch ${BATCH}, dry_run=${DRY_RUN}`)
  const total = { archived: 0, flagged: 0, confirmed_person: 0, errors: 0 }
  const archived = []
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH)
    const { status, data } = await invoke(chunk)
    console.log(`  batch ${i / BATCH + 1} [${status}] archived=${data.archived} flagged=${data.flagged} person=${data.confirmed_person} errors=${data.errors} circuit_open=${data.circuit_open}`)
    for (const k of Object.keys(total)) total[k] += data[k] || 0
    for (const r of data.results || []) if (r.action === 'archived' || r.action === 'would_archive') archived.push(`${r.name} → ${r.type} (${r.confidence})`)
    if (data.circuit_open) { console.log('  LLM circuit open — stopping.'); break }
  }
  console.log('\nTOTAL', JSON.stringify(total))
  console.log('NON-PERSONS', JSON.stringify(archived, null, 1))
}

main().catch((e) => { console.error(e); process.exit(1) })
