#!/usr/bin/env npx tsx
// Repair the publish state of an imported milestone batch from its seed file.
//
// Why this exists: `import-milestones.ts` upserts on slug, and its ON CONFLICT
// clause deliberately leaves status/review_status/seo_indexable alone (they are
// admin-owned after launch). That guard was written for the ~110-row curated
// import. When the 3,014-row history import (#2239) reused the same script, the
// guard pinned every row to whatever the first insert wrote — so when the batch
// was later flipped wholesale to draft/pending, no amount of re-running the
// importer could undo it: each re-run refreshed the prose and silently left the
// publish state broken. 94% of /history 404'd as a result.
//
// This script touches ONLY those three columns, so prose, imagery and person
// links added since the import survive. Use it over `import-milestones.ts
// --sync-status` whenever you want to repair publish state WITHOUT rewriting
// content from the seed.
//
// Scoped by field_provenance->>'source' so a curated row can never be caught in
// the blast radius, and it only writes rows that actually differ (the per-row
// search_documents sync trigger costs ~55ms on the disk-constrained DB, so a
// no-op rewrite of 3k rows is a real outage risk, not just waste).
//
// Auth: Supabase Management API via the macOS-keychain CLI token (house
// pattern; set SUPABASE_PAT to override).
//
// Usage:
//   npx tsx scripts/data-quality/publish-milestone-backlog.ts --dry-run
//   npx tsx scripts/data-quality/publish-milestone-backlog.ts

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

interface SeedEntry {
  id: string
  significance: number
  review_status?: 'pending' | 'approved' | 'rejected'
  seo_indexable?: boolean
  checked?: boolean
}

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const HERE = dirname(fileURLToPath(import.meta.url))
const SEED_FILE = argValue('--file') ?? join(HERE, 'history-import/milestone-seed-history.json')
const PROVENANCE = argValue('--provenance') ?? 'history-import-2026-07'
const PROJECT = 'xqeacpakadqfxjxjcewc'
const DRY = process.argv.includes('--dry-run')
// Each row fires trg_search_documents_milestone (~55ms). 60/batch keeps a
// statement near ~3s, well inside the Management-API budget — a timeout there
// rolls the whole statement back silently, so staying short is load-bearing.
const BATCH = 60

function token(): string {
  if (process.env.SUPABASE_PAT) return process.env.SUPABASE_PAT
  const raw = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-w'], {
    encoding: 'utf8',
  }).trim()
  return Buffer.from(raw.replace(/^go-keyring-base64:/, ''), 'base64').toString('utf8')
}
const TOKEN = token()

type SqlRow = Record<string, unknown>

async function sql(query: string): Promise<SqlRow[]> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error(`mgmt API ${res.status}: ${(await res.text()).slice(0, 400)}`)
  return res.json() as Promise<SqlRow[]>
}

function jsonbLit(value: unknown): string {
  const s = JSON.stringify(value)
  if (s.includes('$mjson$')) throw new Error('dollar-quote tag collision')
  return `$mjson$${s}$mjson$::jsonb`
}

function strLit(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}
const SRC = strLit(PROVENANCE)

const seed: SeedEntry[] = JSON.parse(readFileSync(SEED_FILE, 'utf8'))

// The seed's own review_status/seo_indexable are authoritative; `checked` is the
// pre-#2239 fallback for seeds that predate those fields.
const target = seed.map((s) => {
  const review = s.review_status ?? (s.checked ? 'approved' : 'pending')
  return {
    slug: s.id,
    review_status: review,
    status: review === 'approved' ? 'published' : 'draft',
    seo_indexable: s.seo_indexable ?? (review === 'approved' && s.significance >= 3),
  }
})

const want = {
  published: target.filter((t) => t.status === 'published').length,
  draft: target.filter((t) => t.status === 'draft').length,
  seo: target.filter((t) => t.seo_indexable).length,
}
console.log(
  `Seed ${SEED_FILE}: ${target.length} entries → ${want.published} published, ${want.draft} draft (needs review), ${want.seo} SEO-indexable`
)

async function currentState() {
  const rows = await sql(`
    select status, review_status, count(*)::int as n
    from public.milestones
    where field_provenance->>'source' = ${SRC}
    group by 1, 2 order by 3 desc`)
  return rows
}

console.log('Current state on prod:', JSON.stringify(await currentState()))

// Count only the rows that would actually change.
async function pendingDiff(): Promise<number> {
  const [{ n }] = (await sql(`
    select count(*)::int as n
    from public.milestones m
    join jsonb_to_recordset(${jsonbLit(target)})
      as x(slug text, status text, review_status text, seo_indexable boolean)
      on x.slug = m.slug
    where m.field_provenance->>'source' = ${SRC}
      and (m.status is distinct from x.status
        or m.review_status is distinct from x.review_status
        or m.seo_indexable is distinct from x.seo_indexable)`)) as { n: number }[]
  return n
}

const toChange = await pendingDiff()
console.log(`Rows needing a publish-state change: ${toChange}`)

if (DRY) {
  console.log('[dry-run] no writes')
  process.exit(0)
}
if (toChange === 0) {
  console.log('Nothing to do.')
  process.exit(0)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
let done = 0
for (let i = 0; i < target.length; i += BATCH) {
  const slice = target.slice(i, i + BATCH)
  let ok = false
  for (let attempt = 0; attempt <= 2 && !ok; attempt++) {
    if (attempt > 0) {
      console.warn(`  ⚠ batch at ${i} incomplete — retry ${attempt}/2`)
      await sleep(1500)
    }
    try {
      await sql(`
        update public.milestones m set
          status = x.status,
          review_status = x.review_status,
          seo_indexable = x.seo_indexable
        from jsonb_to_recordset(${jsonbLit(slice)})
          as x(slug text, status text, review_status text, seo_indexable boolean)
        where x.slug = m.slug
          and m.field_provenance->>'source' = ${SRC}
          and (m.status is distinct from x.status
            or m.review_status is distinct from x.review_status
            or m.seo_indexable is distinct from x.seo_indexable)`)
    } catch (e) {
      console.warn(`  ⚠ batch at ${i} error: ${(e as Error).message.slice(0, 200)}`)
    }
    // Verify rather than trust: a Management-API timeout rolls back silently.
    const [{ n }] = (await sql(`
      select count(*)::int as n
      from public.milestones m
      join jsonb_to_recordset(${jsonbLit(slice)})
        as x(slug text, status text, review_status text, seo_indexable boolean)
        on x.slug = m.slug
      where m.status is distinct from x.status
         or m.review_status is distinct from x.review_status
         or m.seo_indexable is distinct from x.seo_indexable`)) as { n: number }[]
    ok = n === 0
  }
  if (!ok) throw new Error(`batch at ${i} still incomplete after retries — aborting`)
  done += slice.length
  console.log(`  reconciled ${done}/${target.length}`)
  await sleep(400)
}

console.log('Final state on prod:', JSON.stringify(await currentState()))
