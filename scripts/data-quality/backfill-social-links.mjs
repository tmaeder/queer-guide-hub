#!/usr/bin/env node
// One-shot / ad-hoc backfill of social_links from entity websites.
//
// For entities that have a website but no social links yet, fetch the homepage
// and harvest social profile URLs (schema.org sameAs + rel="me" + known-host
// anchors), then merge them into the entity's social jsonb column. This is the
// immediate coverage win for Pillar C; the perpetual path is the ingestion
// pipeline (pipeline-normalize → pipeline-commit) which now extracts socials on
// every ingest.
//
// Self-contained: fetches pages directly (no extract-worker secret needed) and
// writes via the Supabase Management API. Platform keys mirror
// src/lib/social/registry.ts; the frontend canonicalizes URLs on display.
//
// Auth: Supabase PAT (keychain on macOS, or SUPABASE_PAT env).
//
// Usage:
//   node scripts/data-quality/backfill-social-links.mjs --dry-run
//   node scripts/data-quality/backfill-social-links.mjs --table venues --limit 200
//   node scripts/data-quality/backfill-social-links.mjs            # all tables, live

import { execFileSync } from 'node:child_process'

const PROJECT = 'xqeacpakadqfxjxjcewc'
const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const ONLY_TABLE = args[args.indexOf('--table') + 1] && !args[args.indexOf('--table') + 1].startsWith('--')
  ? args[args.indexOf('--table') + 1] : null
const LIMIT = Number(args[args.indexOf('--limit') + 1]) || 150

// table -> { websiteCol, socialCol }
const TARGETS = {
  venues:               { website: 'website',          social: 'social_links' },
  events:               { website: 'website',          social: 'social_links' },
  cities:               { website: 'official_website',  social: 'social_links' },
  queer_villages:       { website: 'website',          social: 'social_links' },
  organizations:        { website: 'website',          social: 'social' },
  personalities:        { website: 'website_url',      social: 'social_links' },
  marketplace_listings: { website: 'website',          social: 'social_media' },
}

// platform key -> host regex (capture group 1 = handle). Mirrors the registry.
const PLATFORMS = [
  ['instagram', /^https?:\/\/(?:www\.)?instagram\.com\/[a-z0-9._]{1,30}/i],
  ['tiktok',    /^https?:\/\/(?:www\.)?tiktok\.com\/@[a-z0-9._]{2,24}/i],
  ['youtube',   /^https?:\/\/(?:www\.)?youtube\.com\/(@[a-z0-9._-]+|channel\/[a-z0-9_-]+|c\/[a-z0-9._-]+|user\/[a-z0-9._-]+)/i],
  ['facebook',  /^https?:\/\/(?:www\.|m\.|web\.)?facebook\.com\/[a-z0-9.]{2,}/i],
  ['twitter',   /^https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[a-z0-9_]{1,15}/i],
  ['threads',   /^https?:\/\/(?:www\.)?threads\.(?:net|com)\/@?[a-z0-9._]{1,30}/i],
  ['bluesky',   /^https?:\/\/(?:www\.)?bsky\.app\/profile\/[a-z0-9.:-]+/i],
  ['linkedin',  /^https?:\/\/(?:www\.)?linkedin\.com\/(in|company)\/[a-z0-9-]{2,100}/i],
  ['telegram',  /^https?:\/\/(?:t\.me|telegram\.me)\/[a-z0-9_]{4,32}/i],
  ['twitch',    /^https?:\/\/(?:www\.)?twitch\.tv\/[a-z0-9_]{3,25}/i],
  ['spotify',   /^https?:\/\/open\.spotify\.com\/(artist|user|show)\/[0-9a-z._-]{3,40}/i],
  ['patreon',   /^https?:\/\/(?:www\.)?patreon\.com\/[a-z0-9_-]{3,100}/i],
  ['kofi',      /^https?:\/\/(?:www\.)?ko-fi\.com\/[a-z0-9_-]{3,30}/i],
  // creator / adult / hookup (18+)
  ['onlyfans',  /^https?:\/\/(?:www\.)?onlyfans\.com\/[a-z0-9._-]{3,50}/i],
  ['fansly',    /^https?:\/\/(?:www\.)?fansly\.com\/[a-z0-9._-]{2,50}/i],
  ['fetlife',   /^https?:\/\/(?:www\.)?fetlife\.com\/(users\/\d+|[a-z0-9._-]{2,40})/i],
  ['joyclub',   /^https?:\/\/(?:www\.)?joyclub\.(?:de|com)\//i],
  ['romeo',     /^https?:\/\/(?:www\.)?(?:romeo|planetromeo|gayromeo)\.com\/[a-z0-9._-]{2,40}/i],
  ['grindr',    /^https?:\/\/(?:www\.)?grindr\.com\/(?:profile\/)?[a-z0-9._-]{3,40}/i],
  ['scruff',    /^https?:\/\/(?:www\.)?scruff\.com\/[a-z0-9._-]{2,40}/i],
  ['recon',     /^https?:\/\/(?:www\.)?recon\.com\/[a-z0-9._-]{2,40}/i],
  ['pornhub',   /^https?:\/\/(?:[a-z]+\.)?pornhub\.com\/(?:model|pornstar|users)\/[a-z0-9._-]{2,50}/i],
  ['xhamster',  /^https?:\/\/(?:[a-z]+\.)?xhamster\.com\/(?:creators|users)\/[a-z0-9._-]{2,50}/i],
  ['xtube',     /^https?:\/\/(?:www\.)?xtube\.com\/[a-z0-9._-]{2,50}/i],
]

function token() {
  if (process.env.SUPABASE_PAT) return process.env.SUPABASE_PAT
  const raw = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-w'], { encoding: 'utf8' }).trim()
  return Buffer.from(raw.replace(/^go-keyring-base64:/, ''), 'base64').toString('utf8')
}
const TOKEN = token()

async function sql(query, attempt = 0) {
  let res
  try {
    res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    })
  } catch (e) {
    if (attempt < 4) { await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt)); return sql(query, attempt + 1) }
    throw e
  }
  // Retry transient Management-API failures (502/503/504/429) with backoff.
  if ([429, 502, 503, 504].includes(res.status) && attempt < 4) {
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt))
    return sql(query, attempt + 1)
  }
  if (!res.ok) throw new Error(`SQL ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return res.json()
}

const esc = (s) => String(s).replace(/'/g, "''")

function detectPlatform(url) {
  for (const [key, re] of PLATFORMS) if (re.test(url)) return key
  return null
}

function harvest(html) {
  const out = {}
  // schema.org sameAs in JSON-LD + any social URL in the markup.
  const urls = html.match(/https?:\/\/[^\s"'<>)\\]+/gi) ?? []
  for (const raw of urls) {
    const url = raw.replace(/[.,);]+$/, '').split('?')[0]
    const key = detectPlatform(url)
    if (key && !out[key]) out[key] = url
  }
  return out
}

async function fetchPage(url) {
  const ctrl = AbortSignal.timeout(12000)
  const res = await fetch(url, {
    redirect: 'follow',
    signal: ctrl,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; QueerGuideBot/1.0; +https://queer.guide)' },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const ct = res.headers.get('content-type') ?? ''
  if (!ct.includes('text/html')) throw new Error(`non-html ${ct}`)
  return (await res.text()).slice(0, 400_000)
}

async function backfillTable(table) {
  const { website, social } = TARGETS[table]
  const res = await sql(`
    select id, ${website} as website
    from public.${table}
    where ${website} is not null and ${website} <> ''
      and coalesce(${social}, '{}'::jsonb) = '{}'::jsonb
    order by updated_at desc nulls last
    limit ${LIMIT}
  `)
  const list = Array.isArray(res) ? res : (res.result ?? [])
  let scanned = 0, found = 0, wrote = 0
  for (const row of list) {
    scanned++
    let html
    try { html = await fetchPage(row.website) } catch { continue }
    const links = harvest(html)
    if (Object.keys(links).length === 0) continue
    found++
    if (DRY_RUN) {
      console.log(`  [dry] ${table} ${row.id} ${row.website} ->`, links)
      continue
    }
    const json = esc(JSON.stringify(links))
    await sql(`
      update public.${table}
      set ${social} = coalesce(${social}, '{}'::jsonb) || '${json}'::jsonb
      where id = '${esc(row.id)}'
    `)
    wrote++
  }
  console.log(`${table}: scanned ${scanned}, found socials ${found}, wrote ${wrote}${DRY_RUN ? ' (dry-run)' : ''}`)
}

const tables = ONLY_TABLE ? [ONLY_TABLE] : Object.keys(TARGETS)
for (const t of tables) {
  if (!TARGETS[t]) { console.error(`unknown table ${t}`); continue }
  try {
    await backfillTable(t)
  } catch (e) {
    console.error(`${t}: aborted — ${e?.message ?? e}`)
  }
}
console.log('done.')
