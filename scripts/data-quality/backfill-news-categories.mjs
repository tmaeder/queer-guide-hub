#!/usr/bin/env node
// Operator driver for the news category backfill.
//
// Context: no pipeline step has ever assigned a news category, so 93% of live
// articles — and 100% of everything published in the last 30 days — sit on the
// 'general' sentinel. Migration 20260808120000 fixes that going forward (a
// BEFORE INSERT trigger on news_articles) and adds run_news_category_backfill()
// for the ~23.7k row historical backlog. This drives that runner.
//
// Unlike backfill-city-fields.mjs this needs NO pg_net indirection: the work is
// pure SQL with no edge function and no webhook secret, so it calls the RPC
// straight through the Management API.
//
// Auth: Supabase personal access token. On macOS the CLI token is read from the
// keychain automatically; otherwise set SUPABASE_PAT.
//
// Usage:
//   node scripts/data-quality/backfill-news-categories.mjs --dry-run
//   node scripts/data-quality/backfill-news-categories.mjs
//   node scripts/data-quality/backfill-news-categories.mjs --batches 4 --sleep 5000
//
// Pacing: the binding constraint is write amplification, not CPU. Every
// news_articles UPDATE fires trg_search_documents_news →
// search_documents_index_news, an upsert against 3 GIN + 1 GIST index; the
// sibling marketplace trigger was measured at ~55 ms/row and 99.5% of runtime
// (see 20260806100000). So ~23.7k rows is 20-30 minutes of pure trigger time,
// and a single unbatched statement would hit the timeout and roll back
// everything. RUN THIS OFF-PEAK — search latency degrades while it runs.
//
// Resumability is free: the runner is keyset-paged and its selector only
// returns rows still on the sentinel, so a restart simply continues.

import { execFileSync } from 'node:child_process'

const PROJECT = 'xqeacpakadqfxjxjcewc'

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback
}
const DRY_RUN = args.includes('--dry-run')
// Batches of 500 rows per RPC call. 2 keeps a call near ~35-55s, comfortably
// inside the Management API's HTTP window.
const BATCHES = Number(flag('batches', 2))
const SLEEP_MS = Number(flag('sleep', 3000))
const MAX_CALLS = Number(flag('max-calls', 200))

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

async function remaining() {
  const [row] = await sql(`select count(*)::int as n from public.news_articles
      where duplicate_of_id is null and coalesce(category_canonical,'general') = 'general'`)
  return row.n
}

async function main() {
  const before = await remaining()
  console.log(`unclassified before: ${before}`)

  if (DRY_RUN) {
    // Report what the classifier WOULD produce without writing anything, so the
    // distribution can be sanity-checked before 23.7k search reindexes.
    const rows = await sql(`
      select coalesce(public.news_category_from_text(title, content, tags), '(still general)') as cat,
             count(*)::int as n
        from public.news_articles
       where duplicate_of_id is null and coalesce(category_canonical,'general') = 'general'
       group by 1 order by 2 desc`)
    console.log('\nprojected distribution (no writes):')
    for (const r of rows) console.log(`  ${String(r.n).padStart(6)}  ${r.cat}`)
    const unmatched = rows.find((r) => r.cat === '(still general)')?.n ?? 0
    console.log(`\ncoverage: ${(((before - unmatched) / before) * 100).toFixed(1)}%`)
    return
  }

  let cursor = null
  let totalChanged = 0
  for (let call = 1; call <= MAX_CALLS; call++) {
    const after = cursor ? `'${cursor}'::uuid` : 'null'
    const started = Date.now()
    const [row] = await sql(
      `select public.run_news_category_backfill(${after}, ${BATCHES}) as r`,
    )
    const r = row.r
    if (r.error) throw new Error(`runner error: ${r.error}`)
    totalChanged += r.classified ?? 0
    cursor = r.last_id
    const secs = ((Date.now() - started) / 1000).toFixed(1)
    console.log(
      `call ${String(call).padStart(3)}  examined=${String(r.examined).padStart(4)}  ` +
        `classified=${String(r.classified).padStart(4)}  ${secs}s  cursor=${cursor?.slice(0, 8)}`,
    )
    if (r.done) {
      console.log('\nrunner reports done.')
      break
    }
    await sleep(SLEEP_MS)
  }

  const left = await remaining()
  console.log(`\nclassified this run: ${totalChanged}`)
  console.log(`unclassified after:  ${left}  (was ${before})`)

  const dist = await sql(`
    select category_canonical as cat, count(*)::int as n
      from public.news_articles where duplicate_of_id is null
     group by 1 order by 2 desc`)
  console.log('\nfinal distribution:')
  for (const d of dist) console.log(`  ${String(d.n).padStart(6)}  ${d.cat ?? '(null)'}`)
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
