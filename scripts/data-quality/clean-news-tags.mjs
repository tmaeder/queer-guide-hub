#!/usr/bin/env node
// Driver for the news-tag controlled-vocabulary cleanup.
//
// news_articles.tags[] held an uncontrolled free-text vocabulary (~9,000 distinct
// lowercased values across 13.4k tagged articles): fragmented common concepts
// ("gay-marriage" / "same-sex-marriage" / "marriage-equality"; the whole
// "lgbtqia-<topic>" / "queer-<topic>" / "gay-<topic>" prefix family) plus LLM
// enrichment boilerplate ("access-to-inclusive-public-spaces" 2,511x,
// "acceptance" 2,335x). These render directly as chips (NewsCard / NewsDetail /
// NewsFilters) and link to /resources/{tag}.
//
// This drains public.run_news_tag_cleanup() in batches. Each batch snapshots the
// prior tags into news_tag_cleanup_backup_20260619 (reversible) and rewrites
// tags via public.normalize_news_tags(), which is also the perpetual write-gate
// (trg_normalize_news_tags BEFORE INSERT/UPDATE OF tags). Only rows not at the
// normalize fixed point are touched, so re-runs are idempotent and resumable.
//
// IMPORTANT — disk-constrained DB: news search_documents do NOT index tags
// (search_documents_index_news builds tsv/facets from title/category/excerpt
// only), so the AFTER trigger trg_search_documents_news can be safely disabled
// for the duration to avoid churning the search_documents/HNSW table. Pass
// --disable-search-trigger to do that (recommended for the initial full pass);
// the script re-enables it, reindexes any rows touched during the window, and
// vacuums. Without the flag it drains with the trigger live (slower, more WAL).
//
// See migration 20260619120000_news_tag_vocabulary.sql.
//
// Auth: a Supabase personal access token (Management API). On macOS the CLI
//   token is read from the keychain automatically; otherwise set SUPABASE_PAT.
//
// Usage:
//   node scripts/data-quality/clean-news-tags.mjs                          # drain (live)
//   node scripts/data-quality/clean-news-tags.mjs --disable-search-trigger # disk-safe full pass
//   node scripts/data-quality/clean-news-tags.mjs --batch 3000
//   node scripts/data-quality/clean-news-tags.mjs --audit                  # before/after only
//
// Rollback (restore pre-cleanup tags):
//   UPDATE news_articles n SET tags = b.tags
//   FROM news_tag_cleanup_backup_20260619 b WHERE n.id = b.id;

import { execFileSync } from 'node:child_process'

const PROJECT = 'xqeacpakadqfxjxjcewc'
const args = process.argv.slice(2)
const AUDIT_ONLY = args.includes('--audit')
const DISABLE_TRG = args.includes('--disable-search-trigger')
const BATCH = Number(args[args.indexOf('--batch') + 1]) || 3000

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

async function audit(label) {
  const [r] = await sql(`
    SELECT (SELECT count(DISTINCT lower(t)) FROM news_articles n, unnest(n.tags) t WHERE n.tags IS NOT NULL) AS distinct_tags,
           (SELECT max(cardinality(tags)) FROM news_articles) AS max_tags,
           (SELECT count(*) FROM news_articles WHERE tags IS NOT NULL AND cardinality(tags)>0) AS articles_with_tags;`)
  console.log(
    `[${label}] distinct=${r.distinct_tags} max_tags=${r.max_tags} articles_with_tags=${r.articles_with_tags}`,
  )
}

await audit('before')
if (!AUDIT_ONLY) {
  let windowStart
  if (DISABLE_TRG) {
    const [r] = await sql(
      `ALTER TABLE public.news_articles DISABLE TRIGGER trg_search_documents_news; SELECT now() AS t;`,
    )
    windowStart = r.t
    console.log(`search trigger disabled at ${windowStart}`)
  }
  try {
    let total = 0
    for (;;) {
      const [row] = await sql(`SELECT * FROM public.run_news_tag_cleanup(${BATCH});`)
      const processed = Number(row?.processed ?? 0)
      total += processed
      if (processed > 0)
        console.log(`  cleaned ${processed} (dropped ${row.terms_dropped} terms), running total ${total}`)
      if (processed === 0) break
      await sleep(400) // let WAL settle between batches
    }
    console.log(`done — ${total} articles normalized`)
  } finally {
    if (DISABLE_TRG) {
      await sql(`ALTER TABLE public.news_articles ENABLE TRIGGER trg_search_documents_news;`)
      const [r] = await sql(`
        SELECT count(*) AS reindexed FROM (
          SELECT public.search_documents_index_news(n.id)
          FROM public.news_articles n
          LEFT JOIN public.search_documents sd ON sd.entity_type='news' AND sd.entity_id=n.id
          WHERE n.duplicate_of_id IS NULL
            AND (sd.entity_id IS NULL OR n.updated_at > sd.updated_at)
            AND (n.created_at > '${windowStart}'::timestamptz OR n.updated_at > '${windowStart}'::timestamptz)
        ) x;`)
      console.log(`search trigger re-enabled; reindexed ${r.reindexed} rows touched during window`)
      await sql(`VACUUM (ANALYZE) public.news_articles;`)
    }
  }
  await audit('after')
}
