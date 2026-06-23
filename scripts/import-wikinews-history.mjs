#!/usr/bin/env node
// Import the full Wikinews Category:LGBT historical archive.
//
// Wikinews has no usable category RSS feed, so the source-rss-news edge function
// pulls it via the MediaWiki Action API. This driver calls that function in
// "backfill mode": each call fetches one page (≤50) of category members for the
// Wikinews source, stages the articles into ingestion_staging, and returns the
// next `cmcontinue` cursor. We thread the cursor until the category is
// exhausted. Staged rows are then processed by the normal hourly news pipeline
// (normalize → enrich → dedup → quality → commit) and geo-linked afterwards.
//
// Idempotent: the news fingerprint (source + normalized title + published day)
// means re-running, or overlap with the live 6-hourly fetch, never
// double-inserts.
//
// Auth: service-role bearer token. Reads SUPABASE_URL (or PROJECT ref) and
// SUPABASE_SERVICE_ROLE_KEY from the environment.
//
// Usage:
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-wikinews-history.mjs
//   node scripts/import-wikinews-history.mjs --dry-run        # stage nothing, just count
//   node scripts/import-wikinews-history.mjs --limit 200      # cap total staged (testing)
//   node scripts/import-wikinews-history.mjs --page-size 50   # members per call (≤500)

const PROJECT = 'xqeacpakadqfxjxjcewc'
const args = process.argv.slice(2)
const DRY = args.includes('--dry-run')
const numArg = (flag, dflt) => {
  const i = args.indexOf(flag)
  return i >= 0 && args[i + 1] ? Number(args[i + 1]) : dflt
}
const LIMIT = numArg('--limit', Infinity)
const PAGE_SIZE = Math.min(numArg('--page-size', 50), 500)
const MAX_PAGES = 1000 // hard safety stop

const BASE = (process.env.SUPABASE_URL || `https://${PROJECT}.supabase.co`).replace(/\/$/, '')
const FN_URL = `${BASE}/functions/v1/source-rss-news`
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
if (!KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY) in the environment.')
  process.exit(1)
}

// Resolve the Wikinews source id via PostgREST.
async function resolveSourceId() {
  const url = `${BASE}/rest/v1/news_sources?select=id,name,url&url=eq.${encodeURIComponent('https://en.wikinews.org/wiki/Category:LGBT')}`
  const res = await fetch(url, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } })
  if (!res.ok) throw new Error(`news_sources lookup failed: HTTP ${res.status} ${await res.text()}`)
  const rows = await res.json()
  if (!rows.length) {
    throw new Error('Wikinews source row not found. Apply migration 20260623170000_add_wikinews_source.sql first.')
  }
  return rows[0].id
}

async function callBackfill(sourceId, cmcontinue) {
  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      wikinews_backfill_source_id: sourceId,
      cmcontinue: cmcontinue ?? undefined,
      limit: PAGE_SIZE,
      dry_run: DRY,
    }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`backfill call failed: HTTP ${res.status} ${text}`)
  return JSON.parse(text)
}

async function main() {
  console.log(`Wikinews backfill → ${FN_URL}${DRY ? ' (dry run)' : ''}`)
  const sourceId = await resolveSourceId()
  console.log(`Source id: ${sourceId}`)

  let cmcontinue = null
  let pages = 0
  let totalFound = 0
  let totalStaged = 0

  do {
    const r = await callBackfill(sourceId, cmcontinue)
    pages++
    totalFound += r.items_total ?? 0
    totalStaged += DRY ? 0 : (r.items ?? 0)
    cmcontinue = r.cmcontinue ?? null
    console.log(
      `page ${pages}: members=${r.page_ids ?? 0} found=${r.items_total ?? 0} ` +
      `staged=${DRY ? '(dry)' : (r.items ?? 0)} cmcontinue=${cmcontinue ? 'yes' : 'done'}`,
    )
    if (totalStaged >= LIMIT || totalFound >= LIMIT) {
      console.log(`Reached --limit ${LIMIT}; stopping.`)
      break
    }
    if (pages >= MAX_PAGES) {
      console.warn(`Hit MAX_PAGES (${MAX_PAGES}); stopping.`)
      break
    }
  } while (cmcontinue)

  console.log(`\nDone. pages=${pages} articles_found=${totalFound} staged=${DRY ? '(dry run)' : totalStaged}`)
  if (!DRY) {
    console.log('Staged rows will be enriched, deduped, quality-scored, committed and geo-linked by the news pipeline crons.')
  }
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
