#!/usr/bin/env npx tsx
// Stage C: merge enriched chunks → milestone-seed-history.json
//
// 1. Concat enriched/*.json (sorted), drop skips.
// 2. Assign deterministic slugs: <year>-<kebab-title> (+ -2/-3 on collision,
//    in sorted merge order; also collision-checked against the live table dump).
// 3. Build dedupe/candidates.json (cross-source pairs in the new data + pairs
//    vs existing-milestones.json). Apply dedupe/decisions.json when present.
//    REFUSES to emit the final seed while any candidate lacks a decision.
// 4. Apply the review/SEO policy and emit the seed in import-milestones.ts
//    --file shape.
//
// Usage:
//   npx tsx scripts/data-quality/history-import/merge-seeds.ts             # full run
//   npx tsx scripts/data-quality/history-import/merge-seeds.ts --candidates-only

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const CANDIDATES_ONLY = process.argv.includes('--candidates-only')

interface Enriched {
  ref: string
  title: string
  description: string
  date: string
  date_end?: string
  country_code: string
  country: string
  city?: string
  region?: string
  category: string
  impact: 'positive' | 'neutral' | 'negative'
  significance: number
  sources: Array<{ label: string; url: string }>
  needs_review?: boolean
  skip_reason?: string
  slug?: string // assigned below
}

interface ExistingRow {
  slug: string
  title: string
  date: string
  date_precision: string
  category: string
  significance: number
  country_code: string | null
}

// --- load ------------------------------------------------------------------
const enrichedDir = join(HERE, 'enriched')
const entries: Enriched[] = []
for (const f of readdirSync(enrichedDir).filter((x) => x.endsWith('.json')).sort()) {
  for (const e of JSON.parse(readFileSync(join(enrichedDir, f), 'utf8')) as Enriched[]) {
    if (!e.skip_reason) entries.push(e)
  }
}
console.log(`Merged ${entries.length} enriched entries`)

const existing: ExistingRow[] = JSON.parse(
  readFileSync(join(HERE, 'existing-milestones.json'), 'utf8'),
)

// --- slugs -----------------------------------------------------------------
const kebab = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const takenSlugs = new Set(existing.map((r) => r.slug))
for (const e of entries) {
  const year = e.date.slice(0, 4)
  let base = `${year}-${kebab(e.title)}`
  if (base.length > 65) base = base.slice(0, 65).replace(/-[^-]*$/, '')
  let slug = base
  for (let n = 2; takenSlugs.has(slug); n++) slug = `${base}-${n}`
  takenSlugs.add(slug)
  e.slug = slug
}

// --- dedupe candidates -----------------------------------------------------
const norm = (s: string) => kebab(s).replace(/-/g, ' ')
function trigrams(s: string): Set<string> {
  const t = new Set<string>()
  const p = `  ${s} `
  for (let i = 0; i < p.length - 2; i++) t.add(p.slice(i, i + 3))
  return t
}
function similarity(a: string, b: string): number {
  const ta = trigrams(norm(a))
  const tb = trigrams(norm(b))
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter++
  return inter / (ta.size + tb.size - inter)
}

interface Candidate {
  id: string
  kind: 'new-new' | 'new-existing'
  a: string // slug of the entry to keep by default
  b: string // slug of the suspected duplicate (dropped when verdict=duplicate)
  a_title: string
  b_title: string
  a_ctx: string // "date · country · category · desc-snippet"
  b_ctx: string
  reason: string
}

const enrichedByCtx = (e: Enriched) =>
  `${e.date} · ${e.country_code || 'global'} · ${e.category} · ${e.description.slice(0, 140)}`
const existingCtx = (r: ExistingRow) =>
  `${r.date} · ${r.country_code || 'global'} · ${r.category}`

// Categories where a shared (year, country) almost always means the same legal
// event even when titles are worded differently ("legalizes" vs "takes
// effect") — flag them regardless of title similarity to lift dedupe recall.
const LEGAL_CATS = new Set([
  'law-equality',
  'law-decriminalization',
  'law-criminalization',
  'depathologization',
])

const candidates: Candidate[] = []
let cid = 0
const byYearCc = new Map<string, Enriched[]>()
for (const e of entries) {
  const key = `${e.date.slice(0, 4)}|${e.country_code}`
  const list = byYearCc.get(key) ?? []
  // new-new: same year+country, similar titles / same day / same legal category
  for (const other of list) {
    const sim = similarity(e.title, other.title)
    const sameDay = e.date.length === 10 && e.date === other.date
    // Same legal event reworded across sources ("legalizes" vs "takes effect")
    // keeps some lexical overlap (country name + topic); require sim>0.2 so we
    // don't pair genuinely different same-year events in big federal countries.
    const sameLegal =
      !!e.country_code && e.category === other.category && LEGAL_CATS.has(e.category) && sim > 0.2
    if (sim > 0.45 || (sameDay && sim > 0.3) || sameLegal) {
      // keep the higher-significance / more detailed one by default
      const [keep, drop] =
        (other.significance ?? 0) >= (e.significance ?? 0) ? [other, e] : [e, other]
      candidates.push({
        id: `c${String(++cid).padStart(4, '0')}`,
        kind: 'new-new',
        a: keep.slug!,
        b: drop.slug!,
        a_title: keep.title,
        b_title: drop.title,
        a_ctx: enrichedByCtx(keep),
        b_ctx: enrichedByCtx(drop),
        reason: sameDay
          ? `same date ${e.date}, sim ${sim.toFixed(2)}`
          : sameLegal && sim <= 0.45
            ? `same ${e.category} in ${e.country_code} ${e.date.slice(0, 4)}, sim ${sim.toFixed(2)}`
            : `sim ${sim.toFixed(2)}`,
      })
    }
  }
  list.push(e)
  byYearCc.set(key, list)
}

// new-existing: same year + country (existing titles are German — every pair
// in the same year+country bucket goes to LLM review; the existing set is small)
const existingByYearCc = new Map<string, ExistingRow[]>()
for (const r of existing) {
  const key = `${r.date.slice(0, 4)}|${r.country_code ?? ''}`
  const list = existingByYearCc.get(key) ?? []
  list.push(r)
  existingByYearCc.set(key, list)
}
for (const e of entries) {
  const key = `${e.date.slice(0, 4)}|${e.country_code}`
  for (const r of existingByYearCc.get(key) ?? []) {
    candidates.push({
      id: `c${String(++cid).padStart(4, '0')}`,
      kind: 'new-existing',
      a: r.slug, // existing stays canonical
      b: e.slug!,
      a_title: r.title,
      b_title: e.title,
      a_ctx: existingCtx(r),
      b_ctx: enrichedByCtx(e),
      reason: `same year+country as existing '${r.slug}'`,
    })
  }
}

const dedupeDir = join(HERE, 'dedupe')
mkdirSync(dedupeDir, { recursive: true })
writeFileSync(join(dedupeDir, 'candidates.json'), JSON.stringify(candidates, null, 1))
console.log(
  `Candidates: ${candidates.length} (${candidates.filter((c) => c.kind === 'new-new').length} new-new, ${candidates.filter((c) => c.kind === 'new-existing').length} new-existing) → dedupe/candidates.json`,
)
if (CANDIDATES_ONLY) process.exit(0)

// --- apply decisions -------------------------------------------------------
interface Decision {
  id: string
  verdict: 'duplicate' | 'distinct'
}
// Decisions come from auto-decisions.json (high-similarity auto-marked) plus
// every reviewer verdict file in dedupe/verdicts/*.json.
const decisions: Decision[] = []
const autoPath = join(dedupeDir, 'auto-decisions.json')
if (existsSync(autoPath)) decisions.push(...JSON.parse(readFileSync(autoPath, 'utf8')))
const verdictsDir = join(dedupeDir, 'verdicts')
if (existsSync(verdictsDir)) {
  for (const f of readdirSync(verdictsDir).filter((x) => x.endsWith('.json'))) {
    decisions.push(...JSON.parse(readFileSync(join(verdictsDir, f), 'utf8')))
  }
}
const decisionById = new Map(decisions.map((d) => [d.id, d]))
const undecided = candidates.filter((c) => !decisionById.has(c.id))
if (undecided.length) {
  console.error(
    `✗ ${undecided.length} candidates lack a decision in dedupe/decisions.json — refusing to emit the seed.`,
  )
  process.exit(1)
}

// Union-find over all "duplicate" edges so transitive clusters (an event that
// recurs across many sources) collapse to ONE survivor, not a chain of pairwise
// drops. Existing-DB slugs (new-existing edges) are cluster members too; any
// cluster containing an existing slug means every NEW member is a duplicate of
// the canonical existing row → all dropped.
const parent = new Map<string, string>()
const find = (x: string): string => {
  if (!parent.has(x)) parent.set(x, x)
  let r = x
  while (parent.get(r) !== r) r = parent.get(r)!
  while (parent.get(x) !== r) {
    const nx = parent.get(x)!
    parent.set(x, r)
    x = nx
  }
  return r
}
const union = (a: string, b: string) => parent.set(find(a), find(b))

const existingSlugs = new Set(existing.map((r) => r.slug))
for (const c of candidates) {
  if (decisionById.get(c.id)!.verdict === 'duplicate') union(c.a, c.b)
}

// Group new entries by cluster root
const clusters = new Map<string, Enriched[]>()
const clusterHasExisting = new Map<string, boolean>()
for (const e of entries) {
  const root = find(e.slug!)
  const list = clusters.get(root) ?? []
  list.push(e)
  clusters.set(root, list)
}
// Mark clusters that include an existing slug
for (const s of existingSlugs) {
  if (parent.has(s)) clusterHasExisting.set(find(s), true)
}

const dropped = new Set<string>()
for (const [root, members] of clusters) {
  if (members.length === 1 && !clusterHasExisting.get(root)) continue
  // survivor = highest significance, then most sources, then earliest slug
  const survivor = clusterHasExisting.get(root)
    ? null // whole cluster duplicates an existing row → drop all new members
    : [...members].sort(
        (a, b) =>
          b.significance - a.significance ||
          b.sources.length - a.sources.length ||
          (a.slug! < b.slug! ? -1 : 1),
      )[0]
  for (const m of members) {
    if (m === survivor) continue
    dropped.add(m.slug!)
    if (survivor) {
      const seen = new Set(survivor.sources.map((s) => s.url))
      for (const s of m.sources) if (!seen.has(s.url)) survivor.sources.push(s)
    }
  }
}
console.log(
  `Dropped ${dropped.size} duplicates across ${[...clusters.values()].filter((m) => m.length > 1 || clusterHasExisting.get(find(m[0].slug!))).length} clusters`,
)

// --- emit seed -------------------------------------------------------------
const seed = entries
  .filter((e) => !dropped.has(e.slug!))
  .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.slug! < b.slug! ? -1 : 1))
  .map((e) => {
    const needsReview = !!e.needs_review
    return {
      id: e.slug!,
      title: e.title,
      date: e.date,
      ...(e.date_end ? { date_end: e.date_end } : {}),
      ...(e.city ? { city: e.city } : {}),
      ...(e.region ? { region: e.region } : {}),
      ...(e.country ? { country: e.country } : {}),
      ...(e.country_code ? { country_code: e.country_code } : {}),
      description: e.description,
      sources: e.sources,
      linked_persons: [],
      category: e.category,
      significance: e.significance,
      impact: e.impact,
      checked: false,
      review_status: needsReview ? 'pending' : 'approved',
      seo_indexable: !needsReview && e.significance >= 3,
    }
  })

writeFileSync(join(HERE, 'milestone-seed-history.json'), JSON.stringify(seed, null, 1))
const stats = {
  total: seed.length,
  pending: seed.filter((s) => s.review_status === 'pending').length,
  seo: seed.filter((s) => s.seo_indexable).length,
}
console.log(
  `Seed: ${stats.total} entries (${stats.pending} pending review, ${stats.seo} SEO-indexable) → milestone-seed-history.json`,
)
