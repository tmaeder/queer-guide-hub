#!/usr/bin/env node
/**
 * link-adult-profiles — drives `personality-link-adult-profiles` in batches.
 *
 * Same shape as classify-personhood.mjs: every DB interaction goes through the
 * Supabase Management API, and the edge function is invoked through pg_net so
 * the webhook secret is read from Vault INSIDE the database and never reaches
 * this process.
 *
 *   node scripts/data-quality/link-adult-profiles.mjs                  # dry run
 *   node scripts/data-quality/link-adult-profiles.mjs --apply
 *   node scripts/data-quality/link-adult-profiles.mjs --apply --batch 40 --rounds 20
 *   node scripts/data-quality/link-adult-profiles.mjs --platform pornhub
 *
 * Flags
 *   --apply            actually write (default is a dry run)
 *   --batch N          personalities per invocation (default 40, max 200)
 *   --rounds N         how many invocations (default 1)
 *   --platform p       restrict to one platform; repeatable
 *   --verbose          print each sample decision
 *
 * The loop ABORTS as soon as the function reports circuit_open, so a platform
 * that starts refusing traffic stops the sweep instead of hammering it.
 */

import { execFileSync } from 'node:child_process'

const PROJECT = 'xqeacpakadqfxjxjcewc'
const FN_URL = `https://${PROJECT}.supabase.co/functions/v1/personality-link-adult-profiles`

const argv = process.argv.slice(2)
const has = (f) => argv.includes(f)
const val = (f, d) => {
  const i = argv.indexOf(f)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d
}
const all = (f) => argv.reduce((a, v, i) => (v === f && argv[i + 1] ? [...a, argv[i + 1]] : a), [])

const APPLY = has('--apply')
const BATCH = Math.max(1, Math.min(Number(val('--batch', '40')), 200))
const ROUNDS = Math.max(1, Number(val('--rounds', '1')))
const PLATFORMS = all('--platform')
const VERBOSE = has('--verbose')

function token() {
  if (process.env.SUPABASE_PAT) return process.env.SUPABASE_PAT
  try {
    // The keychain entry is prefixed `go-keyring-base64:` — decoding without
    // stripping it yields mojibake that fails as an HTTP header value.
    const raw = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-w'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return Buffer.from(raw.replace(/^go-keyring-base64:/, ''), 'base64').toString('utf8').trim()
  } catch {
    throw new Error('No Supabase token. Set SUPABASE_PAT.')
  }
}

const PAT = token()

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error(`Management API ${res.status}: ${await res.text()}`)
  return res.json()
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Invoke through pg_net and poll net._http_response. The secret is pulled from
 * Vault inside the statement, so it stays in the database.
 */
async function invoke(body) {
  const payload = JSON.stringify(body).replace(/'/g, "''")
  const rows = await sql(`
    select net.http_post(
      url := '${FN_URL}',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-webhook-secret', (select decrypted_secret from vault.decrypted_secrets where name='WEBHOOK_SECRET')),
      body := '${payload}'::jsonb,
      timeout_milliseconds := 150000) as request_id;`)
  const id = rows[0].request_id

  for (let i = 0; i < 40; i++) {
    await sleep(6000)
    const r = await sql(`select status_code, content from net._http_response where id = ${id};`)
    if (r[0]?.status_code != null) {
      let data
      try {
        data = JSON.parse(r[0].content)
      } catch {
        data = { raw: r[0].content }
      }
      return { status: r[0].status_code, data }
    }
  }
  throw new Error(`timed out waiting for request ${id}`)
}

async function main() {
  console.log(
    `link-adult-profiles — ${APPLY ? 'APPLY' : 'DRY RUN'}, batch ${BATCH}, rounds ${ROUNDS}` +
      (PLATFORMS.length ? `, platforms ${PLATFORMS.join(',')}` : ''),
  )

  const before = await sql(`
    select count(*) filter (where social_links ? 'pornhub')  as pornhub,
           count(*) filter (where social_links ? 'xhamster') as xhamster,
           count(*) filter (where social_links ? 'xvideos')  as xvideos
      from personalities where is_adult;`)
  console.log('before:', before[0])

  const totals = { examined: 0, linked: 0, queued: 0, missed: 0, retired: 0 }

  for (let round = 1; round <= ROUNDS; round++) {
    const body = { batch_size: BATCH }
    if (!APPLY) body.dry_run = true
    if (PLATFORMS.length) body.platforms = PLATFORMS

    const { status, data } = await invoke(body)
    if (status !== 200 || !data?.success) {
      console.error(`round ${round}: HTTP ${status}`, data)
      break
    }

    for (const k of Object.keys(totals)) totals[k] += data[k] ?? 0
    console.log(
      `round ${round}/${ROUNDS}: examined ${data.examined}, linked ${data.linked}, ` +
        `queued ${data.queued}, missed ${data.missed}, retired ${data.retired}`,
    )
    if (VERBOSE) {
      for (const s of data.samples ?? []) {
        console.log(`   ${s.tier.padEnd(6)} ${s.platform.padEnd(9)} ${s.name} — ${s.reason}` +
          (s.display_name ? ` (page says "${s.display_name}")` : ''))
      }
    }

    if (data.circuit_open) {
      console.error(`circuit open for ${(data.circuits_open ?? []).join(', ')} — stopping.`)
      break
    }
    if (data.examined === 0) {
      console.log('nothing left to do.')
      break
    }
  }

  console.log('totals:', totals)

  const after = await sql(`
    select count(*) filter (where social_links ? 'pornhub')  as pornhub,
           count(*) filter (where social_links ? 'xhamster') as xhamster,
           count(*) filter (where social_links ? 'xvideos')  as xvideos
      from personalities where is_adult;`)
  console.log('after: ', after[0])

  const open = await sql(`
    select count(*) as open_reviews from entity_review_queue
     where entity_type='personality' and field like 'social_links.%' and status='open';`)
  console.log(`open reviews awaiting a human: ${open[0].open_reviews}`)
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
