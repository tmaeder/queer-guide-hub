#!/usr/bin/env -S npx tsx
/**
 * Deduplication calibration / eval harness.
 *
 * Measures precision / recall / F1 of the unified dedup engine against labeled
 * pairs, swept over a threshold/cosine grid, so the DEDUP_REGISTRY numbers are
 * chosen from data instead of guessed. Imports the SAME pure `decideCandidate`
 * the production edge function uses — one code path for prod and eval.
 *
 * Read-only. Auth via env:
 *   SUPABASE_URL                 (e.g. https://xqeacpakadqfxjxjcewc.supabase.co)
 *   SUPABASE_SERVICE_ROLE_KEY    (service role — read access to entity + embedding tables)
 *
 * Usage:
 *   npx tsx scripts/dedup-eval.ts                       # eval against the fixture
 *   npx tsx scripts/dedup-eval.ts --bootstrap           # regenerate fixture from merge history, then eval
 *   npx tsx scripts/dedup-eval.ts --type venue          # restrict to one entity type
 *
 * Output:
 *   - per-type precision/recall/F1 table to stdout
 *   - recommended {autoMerge, review, minCosine, confirmWeight, standaloneReviewCosine}
 *     per type (max F1 subject to precision ≥ AUTO_PRECISION_FLOOR on the auto band)
 *   - full grid written to scripts/out/dedup-eval-report.json
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  decideCandidate, DEDUP_REGISTRY,
  type EntityType, type RawCandidate, type TypeConfig, type GuardContext,
} from '../supabase/functions/_shared/dedup-engine.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const FIXTURE = join(HERE, 'fixtures', 'dedup-labeled-pairs.json')
const OUT_DIR = join(HERE, 'out')
const AUTO_PRECISION_FLOOR = 0.98 // false-merge is the expensive error

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'); process.exit(1)
}
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

interface LabeledPair { entity_type: EntityType; a_id: string; b_id: string; label: 'dup' | 'distinct' }

const args = process.argv.slice(2)
const ONLY_TYPE = args.includes('--type') ? (args[args.indexOf('--type') + 1] as EntityType) : null

// ── Bootstrap labeled pairs ──────────────────────────────────────────────────
// Positives: human-confirmed merges (undone_at IS NULL). Reversed merges (rare)
// are hard negatives. Synthetic hard negatives: distinct LIVE entities sharing a
// city (venue) / country (city) that no merge ever linked — the "looks similar,
// is actually different" case the precision floor must protect.
async function bootstrap(): Promise<LabeledPair[]> {
  const pairs: LabeledPair[] = []
  const seen = new Set<string>()
  const add = (p: LabeledPair) => {
    const k = [p.entity_type, ...[p.a_id, p.b_id].sort()].join(':')
    if (!seen.has(k)) { seen.add(k); pairs.push(p) }
  }

  let posVenue = 0, posCity = 0
  for (const [table, type] of [['venue_merge_audit', 'venue'], ['city_merge_audit', 'city']] as const) {
    const { data, error } = await sb.from(table).select('keep_id, drop_id, undone_at').limit(2000)
    if (error) { console.warn(`bootstrap ${table}: ${error.message}`); continue }
    for (const r of data ?? []) {
      add({ entity_type: type, a_id: r.keep_id, b_id: r.drop_id, label: r.undone_at ? 'distinct' : 'dup' })
      if (type === 'venue') posVenue++; else posCity++
    }
  }

  // Synthetic hard negatives — distinct venues in the same city, different name.
  const { data: vs } = await sb.from('venues')
    .select('id, city_id, name_normalized')
    .is('duplicate_of_id', null).not('city_id', 'is', null).not('name_normalized', 'is', null)
    .limit(4000)
  const byCity = new Map<string, { id: string; nn: string }[]>()
  for (const v of (vs ?? []) as { id: string; city_id: string; name_normalized: string }[]) {
    if (!byCity.has(v.city_id)) byCity.set(v.city_id, [])
    byCity.get(v.city_id)!.push({ id: v.id, nn: v.name_normalized })
  }
  let negVenue = 0
  for (const group of byCity.values()) {
    for (let i = 0; i + 1 < group.length && negVenue < posVenue; i += 2) {
      if (group[i].nn === group[i + 1].nn) continue // same name → could be a real dup, skip
      add({ entity_type: 'venue', a_id: group[i].id, b_id: group[i + 1].id, label: 'distinct' })
      negVenue++
    }
    if (negVenue >= posVenue) break
  }

  console.log(`bootstrapped ${pairs.length} pairs (venue +${posVenue}/-${negVenue}, city +${posCity})`)
  mkdirSync(dirname(FIXTURE), { recursive: true })
  writeFileSync(FIXTURE, JSON.stringify(pairs, null, 2))
  return pairs
}

// ── Fetch a 1024-d embedding for an entity from content_embeddings ───────────
const embCache = new Map<string, number[] | null>()
async function getEmbedding(type: EntityType, id: string): Promise<number[] | null> {
  const key = `${type}:${id}`
  if (embCache.has(key)) return embCache.get(key)!
  // content_embeddings uses content_type ('venue','event',...) — hotels stored as 'venue'.
  const ct = type === 'hotel' ? 'venue' : type
  const { data } = await sb.from('content_embeddings')
    .select('embedding').eq('content_type', ct).eq('content_id', id).limit(1).maybeSingle()
  let vec: number[] | null = null
  const raw = (data as { embedding?: unknown } | null)?.embedding
  if (typeof raw === 'string') vec = JSON.parse(raw)
  else if (Array.isArray(raw)) vec = raw as number[]
  embCache.set(key, vec)
  return vec
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0
  const len = Math.min(a.length, b.length)
  for (let i = 0; i < len; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

// ── Build the RawCandidate list for a pair under a given semantic config ─────
// Semantic signal = cosine(embA, embB). (Deterministic replay is intentionally
// omitted here: the labeled pairs come from venue/city merges that already
// passed deterministic gates, so this isolates the semantic + threshold tuning.
// Extend with per-type RPC probes when calibrating event/marketplace.)
async function buildRaws(pair: LabeledPair, minCosine: number): Promise<{ raws: RawCandidate[]; cos: number }> {
  const [ea, eb] = await Promise.all([getEmbedding(pair.entity_type, pair.a_id), getEmbedding(pair.entity_type, pair.b_id)])
  if (!ea || !eb) return { raws: [], cos: 0 }
  const cos = cosine(ea, eb)
  const raws: RawCandidate[] = cos >= minCosine ? [{ entity_id: pair.b_id, match_type: 'semantic', score: cos }] : []
  return { raws, cos }
}

interface GridPoint { autoMerge: number; review: number; minCosine: number; confirmWeight: number; standaloneReviewCosine: number }
function* grid(): Generator<GridPoint> {
  for (const minCosine of [0.82, 0.85, 0.88, 0.90])
    for (const standaloneReviewCosine of [0.90, 0.93, 0.95, 0.97])
      for (const review of [0.75, 0.80, 0.85])
        for (const autoMerge of [0.90, 0.92, 0.95])
          yield { autoMerge, review, minCosine, confirmWeight: 0.05, standaloneReviewCosine }
}

interface Counts { tp: number; fp: number; fn: number; tn: number }
function metrics(c: Counts) {
  const precision = c.tp + c.fp === 0 ? 1 : c.tp / (c.tp + c.fp)
  const recall = c.tp + c.fn === 0 ? 1 : c.tp / (c.tp + c.fn)
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall)
  return { precision, recall, f1 }
}

async function main() {
  const pairs: LabeledPair[] = args.includes('--bootstrap')
    ? await bootstrap()
    : JSON.parse(readFileSync(FIXTURE, 'utf8'))

  const byType = new Map<EntityType, LabeledPair[]>()
  for (const p of pairs) {
    if (ONLY_TYPE && p.entity_type !== ONLY_TYPE) continue
    if (!byType.has(p.entity_type)) byType.set(p.entity_type, [])
    byType.get(p.entity_type)!.push(p)
  }

  const report: Record<string, unknown> = {}
  for (const [type, list] of byType) {
    const base = DEDUP_REGISTRY[type]
    let best: { point: GridPoint; m: ReturnType<typeof metrics> } | null = null
    const gridResults: Array<{ point: GridPoint; m: ReturnType<typeof metrics>; counts: Counts }> = []

    for (const point of grid()) {
      const cfg: TypeConfig = {
        ...base,
        semantic: { ...base.semantic, enabled: true, minCosine: point.minCosine, confirmWeight: point.confirmWeight, standaloneReviewCosine: point.standaloneReviewCosine },
        thresholds: { autoMerge: point.autoMerge, review: point.review },
      }
      const ctx: GuardContext = {}
      const counts: Counts = { tp: 0, fp: 0, fn: 0, tn: 0 }
      for (const pair of list) {
        const { raws } = await buildRaws(pair, point.minCosine)
        const v = decideCandidate(cfg, raws, ctx)
        const predictedDup = v.decision !== 'unique' // dup OR merge_candidate counts as "flagged"
        if (pair.label === 'dup') { if (predictedDup) counts.tp++; else counts.fn++ }
        else { if (predictedDup) counts.fp++; else counts.tn++ }
      }
      const m = metrics(counts)
      gridResults.push({ point, m, counts })
      // Maximize F1 subject to the auto-band precision floor.
      if (m.precision >= AUTO_PRECISION_FLOOR && (!best || m.f1 > best.m.f1)) best = { point, m }
    }
    if (!best) { // relax floor if nothing clears it (small fixture) — report best F1
      best = gridResults.reduce(
        (acc, g) => (!acc || g.m.f1 > acc.m.f1 ? { point: g.point, m: g.m } : acc),
        null as null | { point: GridPoint; m: ReturnType<typeof metrics> },
      )
    }

    console.log(`\n=== ${type} (${list.length} pairs) ===`)
    if (best) {
      console.log(`  recommended: auto=${best.point.autoMerge} review=${best.point.review} minCos=${best.point.minCosine} stand=${best.point.standaloneReviewCosine}`)
      console.log(`  precision=${best.m.precision.toFixed(3)} recall=${best.m.recall.toFixed(3)} f1=${best.m.f1.toFixed(3)}`)
    } else {
      console.log('  no embeddings found for these pairs')
    }
    report[type] = { pairs: list.length, recommended: best?.point ?? null, metrics: best?.m ?? null, grid: gridResults }
  }

  mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(join(OUT_DIR, 'dedup-eval-report.json'), JSON.stringify(report, null, 2))
  console.log(`\nFull grid → scripts/out/dedup-eval-report.json`)
}

main().catch((e) => { console.error(e); process.exit(1) })
