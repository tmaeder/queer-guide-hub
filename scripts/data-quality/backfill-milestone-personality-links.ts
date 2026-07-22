#!/usr/bin/env npx tsx
// Backfill milestone → personality links by matching milestone text against
// personality names. The milestone_links table (rendered as "People & places
// involved" on /history/:slug) was starved (~16 rows / 3.2k milestones); this
// populates it from the person spine we already have.
//
// Matching strategy (deliberately conservative — false positives are the enemy;
// see the WHOLE-festival dedup traps: single first names / common names):
//   • Candidates: PUBLIC, non-duplicate personalities only.
//   • Unicode word-boundary matching (accent-folded, case-insensitive) so
//     "Milk" never matches inside "milkman" and "René" matches "Rene".
//   • HIGH  — a UNIQUE, multi-token full name appearing verbatim in the
//             milestone TITLE → inserted straight into milestone_links (role
//             null). Verbatim full-name title matches are unambiguous.
//   • MEDIUM — a unique multi-token full name in the DESCRIPTION only → staged
//             in milestone_link_proposals for admin review.
//   • LOW   — a mononym (single-token name, len ≥ 5, TITLE only) OR an
//             ambiguous name shared by >1 personality → staged for review.
// Nothing low-confidence ever reaches milestone_links directly.
//
// Idempotent: milestone_links + milestone_link_proposals inserts are
// ON CONFLICT DO NOTHING; pairs already linked (or already proposed) are
// skipped. Safe to re-run.
//
// Auth: Supabase Management API via the macOS-keychain CLI token (house
// pattern; set SUPABASE_PAT to override). Writes in batches of 100 to keep the
// disk-constrained DB happy (milestone_links has no search-sync trigger).
//
// Usage:
//   npx tsx scripts/data-quality/backfill-milestone-personality-links.ts --dry-run
//   npx tsx scripts/data-quality/backfill-milestone-personality-links.ts
//   npx tsx scripts/data-quality/backfill-milestone-personality-links.ts --published-only

import { execFileSync } from 'node:child_process'

const PROJECT = 'xqeacpakadqfxjxjcewc'
const DRY_RUN = process.argv.includes('--dry-run')
const PUBLISHED_ONLY = process.argv.includes('--published-only')
const BATCH = 100

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

const lit = (s: string) => `'${s.replace(/'/g, "''")}'`
const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
// Note: in `u`-mode regex, `\-` outside a char class is an invalid escape, so
// `-` is intentionally NOT escaped here.
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Unicode word-boundary regex on accent-folded text.
function boundaryRe(foldedName: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(foldedName)}(?![\\p{L}\\p{N}])`, 'u')
}
// Accent-folded word tokens present in a string (for first-token bucketing).
function wordTokens(foldedText: string): Set<string> {
  const set = new Set<string>()
  for (const m of foldedText.matchAll(/[\p{L}\p{N}]+/gu)) set.add(m[0])
  return set
}

interface Person {
  id: string
  name: string
}
interface Candidate {
  displayName: string
  foldedName: string
  firstToken: string
  mononym: boolean
  ambiguous: boolean
  ids: string[]
  re: RegExp
}

async function main() {
  console.log(`\nBackfill milestone→personality links${DRY_RUN ? ' (DRY RUN)' : ''}\n`)

  const persons = (await sql(
    `select id, btrim(name) as name from personalities
     where visibility='public' and duplicate_of_id is null
       and name is not null and btrim(name) <> ''`,
  )) as unknown as Person[]

  // Group by folded name string → detect ambiguity (same name, >1 person).
  const byFolded = new Map<string, { displayName: string; ids: string[] }>()
  for (const p of persons) {
    const f = fold(p.name)
    const g = byFolded.get(f)
    if (g) g.ids.push(p.id)
    else byFolded.set(f, { displayName: p.name, ids: [p.id] })
  }

  const candidates: Candidate[] = []
  for (const [foldedName, { displayName, ids }] of byFolded) {
    const tokens = foldedName.split(/\s+/).filter(Boolean)
    if (tokens.length === 0) continue
    const mononym = tokens.length === 1
    // Drop junk / too-short mononyms outright — high false-positive risk.
    if (mononym && foldedName.length < 5) continue
    candidates.push({
      displayName,
      foldedName,
      firstToken: tokens[0],
      mononym,
      ambiguous: ids.length > 1,
      ids,
      re: boundaryRe(foldedName),
    })
  }

  const byFirstToken = new Map<string, Candidate[]>()
  for (const c of candidates) {
    const arr = byFirstToken.get(c.firstToken)
    if (arr) arr.push(c)
    else byFirstToken.set(c.firstToken, [c])
  }
  console.log(
    `Personalities: ${persons.length} public • candidates: ${candidates.length} ` +
      `(${candidates.filter((c) => c.mononym).length} mononym, ` +
      `${candidates.filter((c) => c.ambiguous).length} ambiguous)`,
  )

  const milestones = (await sql(
    `select id, title, coalesce(description,'') as description from milestones
     where duplicate_of_id is null${PUBLISHED_ONLY ? " and status='published'" : ''}`,
  )) as unknown as Array<{ id: string; title: string; description: string }>
  console.log(`Milestones to scan: ${milestones.length}\n`)

  // Existing links + proposals → skip (idempotent, avoid dupes).
  const existingLinks = new Set<string>()
  for (const r of await sql(
    `select milestone_id, entity_id from milestone_links where entity_type='personality'`,
  ))
    existingLinks.add(`${r.milestone_id}:${r.entity_id}`)
  const existingProposals = new Set<string>()
  for (const r of await sql(
    `select milestone_id, entity_id from milestone_link_proposals where entity_type='personality'`,
  ))
    existingProposals.add(`${r.milestone_id}:${r.entity_id}`)

  type Hit = { milestone_id: string; entity_id: string; matched_name: string; field: 'title' | 'description' }
  const highLinks: Hit[] = []
  const proposals: Array<Hit & { confidence: 'medium' | 'low' }> = []
  const seenHigh = new Set<string>()

  for (const m of milestones) {
    const foldedTitle = fold(m.title || '')
    const foldedDesc = fold(m.description || '')
    const titleTokens = wordTokens(foldedTitle)
    const descTokens = wordTokens(foldedDesc)

    const queueProposal = (
      id: string,
      displayName: string,
      confidence: 'medium' | 'low',
      field: 'title' | 'description',
    ) => {
      const key = `${m.id}:${id}`
      if (existingLinks.has(key) || existingProposals.has(key)) return
      existingProposals.add(key) // de-dup within this run too
      proposals.push({ milestone_id: m.id, entity_id: id, matched_name: displayName, field, confidence })
    }

    // Only test candidates whose first token appears somewhere in the text.
    const firstTokens = new Set<string>([...titleTokens, ...descTokens])
    for (const ft of firstTokens) {
      const bucket = byFirstToken.get(ft)
      if (!bucket) continue
      for (const c of bucket) {
        const inTitle = titleTokens.has(c.firstToken) && c.re.test(foldedTitle)
        const inDesc = !inTitle && descTokens.has(c.firstToken) && c.re.test(foldedDesc)
        if (!inTitle && !inDesc) continue

        // Mononyms: title-only, always low-confidence review.
        if (c.mononym) {
          if (!inTitle) continue
          for (const id of c.ids) queueProposal(id, c.displayName, 'low', 'title')
          continue
        }
        // Ambiguous multi-token name: can't pick which person → review each.
        if (c.ambiguous) {
          for (const id of c.ids) queueProposal(id, c.displayName, 'low', inTitle ? 'title' : 'description')
          continue
        }
        // Unique multi-token full name.
        const id = c.ids[0]
        if (inTitle) {
          const key = `${m.id}:${id}`
          if (existingLinks.has(key) || seenHigh.has(key)) continue
          seenHigh.add(key)
          highLinks.push({ milestone_id: m.id, entity_id: id, matched_name: c.displayName, field: 'title' })
        } else {
          queueProposal(id, c.displayName, 'medium', 'description')
        }
      }
    }
  }

  // A pair promoted to a HIGH link must not also sit in the proposal queue.
  const highKeys = new Set(highLinks.map((h) => `${h.milestone_id}:${h.entity_id}`))
  const finalProposals = proposals.filter((p) => !highKeys.has(`${p.milestone_id}:${p.entity_id}`))

  console.log(`HIGH (direct milestone_links inserts): ${highLinks.length}`)
  console.log(
    `PROPOSALS (staged for review): ${finalProposals.length} ` +
      `(${finalProposals.filter((p) => p.confidence === 'medium').length} medium, ` +
      `${finalProposals.filter((p) => p.confidence === 'low').length} low)\n`,
  )

  const sample = (arr: Hit[], n: number) =>
    arr.slice(0, n).forEach((h) => console.log(`   • ${h.matched_name}  [${h.field}]  ms=${h.milestone_id}`))
  console.log('Sample HIGH links:')
  sample(highLinks, 12)
  console.log('\nSample proposals:')
  sample(finalProposals as Hit[], 12)

  if (DRY_RUN) {
    console.log('\nDry run — no writes.')
    return
  }

  // --- Writes ---------------------------------------------------------------
  let written = 0
  for (let i = 0; i < highLinks.length; i += BATCH) {
    const rows = highLinks.slice(i, i + BATCH)
    const values = rows
      .map((h) => `(${lit(h.milestone_id)}, 'personality', ${lit(h.entity_id)}, null, 0)`)
      .join(',\n')
    await sql(
      `insert into milestone_links (milestone_id, entity_type, entity_id, role, sort_order)
       values ${values}
       on conflict (milestone_id, entity_type, entity_id) do nothing;`,
    )
    written += rows.length
    console.log(`  links: ${written}/${highLinks.length}`)
  }

  let pwritten = 0
  for (let i = 0; i < finalProposals.length; i += BATCH) {
    const rows = finalProposals.slice(i, i + BATCH)
    const values = rows
      .map(
        (p) =>
          `(${lit(p.milestone_id)}, 'personality', ${lit(p.entity_id)}, ${lit(p.matched_name)}, ${lit(
            p.field,
          )}, ${lit(p.confidence)})`,
      )
      .join(',\n')
    await sql(
      `insert into milestone_link_proposals
         (milestone_id, entity_type, entity_id, matched_name, matched_field, confidence)
       values ${values}
       on conflict (milestone_id, entity_type, entity_id) do nothing;`,
    )
    pwritten += rows.length
    console.log(`  proposals: ${pwritten}/${finalProposals.length}`)
  }

  console.log(`\nDone. Inserted ${highLinks.length} links, staged ${finalProposals.length} proposals.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
