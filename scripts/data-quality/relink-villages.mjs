#!/usr/bin/env node
// Backfill venue↔queer_village links by proximity (Village Truth Engine).
//
// A queer village (gayborhood) page exists to aggregate the LGBTQ+ venues inside
// it, but only ~24% of villages had any venue linked — ingestion never set
// venues.queer_village_id, so 145/190 pages were empty shells. This driver links
// each currently-unlinked, in-bounds venue to its single NEAREST village within a
// radius (default 800 m, gayborhood-scale) that shares the venue's city, via the
// pure-SQL run_village_relink_batch() RPC. It only ever fills NULLs (never
// overrides a manual/existing link), so it is reversible by nulling the column.
//
// Writes are bounded per call (<=300 venue UPDATEs) to spare the disk-constrained
// DB + the search_documents sync trigger that fires per venue row; the loop
// repeats until a batch links zero.
//
// Auth: Supabase Management API via the macOS-keychain CLI token (house pattern;
//   set SUPABASE_PAT to override). No service-role key needed.
//
// Usage:
//   node scripts/data-quality/relink-villages.mjs               # link at 800 m
//   node scripts/data-quality/relink-villages.mjs --radius 1000 # wider radius
//   node scripts/data-quality/relink-villages.mjs --dry-run     # count only

import { execFileSync } from 'node:child_process'

const PROJECT = 'xqeacpakadqfxjxjcewc'
const args = process.argv.slice(2)
const DRY = args.includes('--dry-run')
const RADIUS = Number(args[args.indexOf('--radius') + 1]) || 800
const BATCH = 300

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

async function main() {
  if (DRY) {
    const rows = await sql(`
      WITH unlinked AS (
        SELECT v.id, v.city_id,
               extensions.ST_SetSRID(extensions.ST_MakePoint(v.longitude, v.latitude),4326)::extensions.geography AS g
        FROM public.venues v
        WHERE v.queer_village_id IS NULL AND v.duplicate_of_id IS NULL
          AND v.latitude IS NOT NULL AND v.longitude IS NOT NULL AND NOT (v.latitude=0 AND v.longitude=0)
      ),
      nearest AS (
        SELECT u.id, q.dist FROM unlinked u
        JOIN LATERAL (
          SELECT extensions.ST_Distance(u.g, extensions.ST_SetSRID(extensions.ST_MakePoint(q.longitude,q.latitude),4326)::extensions.geography) AS dist
          FROM public.queer_villages q
          WHERE (q.city_id IS NULL OR q.city_id = u.city_id)
            AND q.latitude IS NOT NULL AND q.longitude IS NOT NULL AND NOT (q.latitude=0 AND q.longitude=0)
          ORDER BY u.g <-> extensions.ST_SetSRID(extensions.ST_MakePoint(q.longitude,q.latitude),4326)::extensions.geography
          LIMIT 1
        ) q ON true
      )
      SELECT count(*) FILTER (WHERE dist <= ${RADIUS}) AS would_link FROM nearest;`)
    console.log(`[dry-run] radius=${RADIUS}m would link ${rows[0]?.would_link ?? 0} venues`)
    return
  }

  let total = 0, batch = 0
  for (;;) {
    const rows = await sql(`SELECT public.run_village_relink_batch(${RADIUS}, ${BATCH}) AS linked;`)
    const linked = Number(rows[0]?.linked ?? 0)
    total += linked
    console.log(`batch ${++batch}: linked ${linked} (total ${total})`)
    if (linked === 0) break
  }

  // Refresh scores so the new linkage lands in completeness/trust immediately.
  await sql('SELECT public.run_village_completeness_recompute(true);')
  await sql('SELECT public.run_village_trust_recompute(true);')
  await sql('SELECT public.run_village_coverage_radar(true);')
  console.log(`done: linked ${total} venues at ${RADIUS}m; scores recomputed.`)
}

main().catch((e) => { console.error(e); process.exit(1) })
