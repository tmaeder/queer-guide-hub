// Unified deduplication engine — pure, config-driven scoring + decision.
//
// No I/O. Imported by pipeline-deduplicate (which does the RPC/embedding I/O)
// and by scripts/dedup-eval.ts (calibration). Unit-tested in isolation, same
// discipline as venue-consensus.ts.
//
// The job: given the raw candidate matches a staging item produced from the
// deterministic blocker RPCs (find_*_duplicate_candidates) AND the semantic KNN
// blocker (find_semantic_duplicate_candidates), decide whether the item is a
// duplicate (auto-merge), a merge_candidate (human review) or unique — applying
// per-type conflict guards (geo / time / country) that veto false matches.
//
// Precision contract: the SEMANTIC signal can RAISE RECALL (flag more
// merge_candidates) but can NEVER auto-merge on its own — auto-merge always
// requires a deterministic strong signal. Enforced by the scoring math below
// (semantic-standalone is capped strictly below the autoMerge threshold).

export type EntityType =
  | 'venue' | 'hotel' | 'event' | 'city' | 'country'
  | 'news' | 'marketplace' | 'personality' | 'organization'

export type Decision = 'unique' | 'duplicate' | 'merge_candidate'
export type Action = 'no_match' | 'auto_merge' | 'flag_review'

/** One raw candidate from any blocker RPC (deterministic or semantic). */
export interface RawCandidate {
  entity_id: string
  match_type: string                 // 'phone_exact' | 'name_proximity' | 'semantic' | ...
  score: number                      // signal-local score in [0,1]
  distance_m?: number | null
  time_diff_hours?: number | null
  country?: string | null            // candidate's country (for the country guard)
}

export type SignalFamily = 'exact' | 'strong' | 'fuzzy' | 'semantic'

export interface Signal {
  match_type: string
  family: SignalFamily
  score: number
}

/** Context the guards reason over (item-side facts + per-type tolerances). */
export interface GuardContext {
  itemCountry?: string | null
}

export interface ConflictGuard {
  /** true => this candidate must NOT match regardless of score. */
  veto: (best: RawCandidate, ctx: GuardContext) => boolean
  reason: string
}

export interface SemanticConfig {
  enabled: boolean
  /** cosine floor for the KNN blocker to even return a neighbour. */
  minCosine: number
  /** additive lift when semantic CONFIRMS an already-plausible deterministic match. */
  confirmWeight: number
  /** cosine at/above which semantic ALONE may reach merge_candidate (never auto-merge). */
  standaloneReviewCosine: number
}

export interface TypeConfig {
  entityType: EntityType
  /** deterministic blocker RPC name (null = handled out-of-band, e.g. news fingerprint). */
  candidateRpc: string | null
  /** the id column the deterministic RPC returns (mapped to entity_id). */
  idField: string
  semantic: SemanticConfig
  thresholds: { autoMerge: number; review: number }
  guards: ConflictGuard[]
}

export interface Verdict {
  decision: Decision
  action: Action
  matchId: string | null
  score: number
  matchType: string
  signals: Signal[]
  guardsFired: string[]
}

// ── Guards ────────────────────────────────────────────────────────────────

/** Two entities with near-identical text but far apart are not the same place. */
export function geoGuard(maxMeters: number): ConflictGuard {
  return {
    reason: `geo>${maxMeters}m`,
    veto: (best) =>
      best.distance_m !== null && best.distance_m !== undefined && best.distance_m > maxMeters,
  }
}

/** Events: same title but outside the time window are different occurrences. */
export function timeGuard(maxHours: number): ConflictGuard {
  return {
    reason: `time>${maxHours}h`,
    veto: (best) => {
      const t = best.time_diff_hours
      return t !== null && t !== undefined && Math.abs(t) > maxHours
    },
  }
}

/** Cities / personalities: same name in different countries are distinct. */
export function countryGuard(): ConflictGuard {
  return {
    reason: 'cross-country',
    veto: (best, ctx) => {
      const a = norm(ctx.itemCountry)
      const b = norm(best.country)
      return !!a && !!b && a !== b
    },
  }
}

function norm(v: string | null | undefined): string {
  return (v ?? '').trim().toLowerCase()
}

// ── Signal classification ───────────────────────────────────────────────────

/** Map a deterministic match_type to a family (semantic is detected by name). */
export function classifyFamily(matchType: string): SignalFamily {
  if (matchType === 'semantic') return 'semantic'
  if (/exact|fingerprint|platform|booking_url|external_url|source_entity|code_exact|_id/.test(matchType)) return 'exact'
  // despaced/core-token keys are deterministic name keys, as strong as a clean
  // name match (despaced_exact also hits the 'exact' branch above — same intent).
  if (/domain_proximity|venue_date_exact|name_exact|title_containment|name_city_website|core_token|despaced/.test(matchType)) return 'strong'
  return 'fuzzy'
}

// ── Core decision ───────────────────────────────────────────────────────────

/**
 * Fuse all raw candidates (deterministic + semantic) into a single verdict.
 *
 * For each candidate entity:
 *   detMax    = best deterministic signal score (precision anchor)
 *   semCosine = semantic signal score, or 0
 *
 *   fused = detMax
 *   if semCosine > 0:
 *     if detMax >= review:                   confirm-lift  → min(1, detMax + confirmWeight*semCosine)
 *     elif semCosine >= standaloneReviewCosine: recall path → min(autoMerge-0.001, semCosine)  (capped < auto)
 *     else:                                   weak semantic, ignored → detMax
 *
 * Guards veto the candidate (drop it entirely) BEFORE it can win.
 */
export function decideCandidate(
  cfg: TypeConfig,
  raws: RawCandidate[],
  ctx: GuardContext = {},
): Verdict {
  const guardsFired: string[] = []

  // Group by entity_id, splitting deterministic vs semantic signals.
  const byEntity = new Map<string, { det: RawCandidate[]; sem: RawCandidate | null }>()
  for (const r of raws) {
    if (!r || !r.entity_id) continue
    const slot = byEntity.get(r.entity_id) ?? { det: [], sem: null }
    if (classifyFamily(r.match_type) === 'semantic') {
      if (!slot.sem || r.score > slot.sem.score) slot.sem = r
    } else {
      slot.det.push(r)
    }
    byEntity.set(r.entity_id, slot)
  }

  let best: { id: string; fused: number; matchType: string; signals: Signal[] } | null = null

  for (const [id, { det, sem }] of byEntity) {
    // Representative candidate for guard evaluation: prefer the strongest det
    // (it carries distance/time/country); fall back to the semantic neighbour.
    const detBest = det.reduce<RawCandidate | null>(
      (acc, c) => (acc === null || c.score > acc.score ? c : acc), null)
    const guardSubject: RawCandidate = detBest ?? sem!

    let vetoed = false
    for (const g of cfg.guards) {
      if (g.veto(guardSubject, ctx)) { vetoed = true; if (!guardsFired.includes(g.reason)) guardsFired.push(g.reason) }
    }
    if (vetoed) continue

    const detMax = detBest ? Number(detBest.score) : 0
    const semCosine = cfg.semantic.enabled && sem ? Number(sem.score) : 0

    let fused = detMax
    if (semCosine > 0) {
      if (detMax >= cfg.thresholds.review) {
        fused = Math.min(1, detMax + cfg.semantic.confirmWeight * semCosine)
      } else if (semCosine >= cfg.semantic.standaloneReviewCosine) {
        // recall path — capped strictly below autoMerge so semantic alone
        // can only ever reach merge_candidate, never auto-merge.
        fused = Math.min(cfg.thresholds.autoMerge - 0.001, semCosine)
      } else {
        fused = detMax
      }
    }

    const signals: Signal[] = []
    for (const d of det) signals.push({ match_type: d.match_type, family: classifyFamily(d.match_type), score: Number(d.score) })
    if (semCosine > 0 && sem) signals.push({ match_type: 'semantic', family: 'semantic', score: semCosine })

    const matchType = detBest?.match_type ?? 'semantic'
    if (!best || fused > best.fused) best = { id, fused, matchType, signals }
  }

  if (!best) {
    return { decision: 'unique', action: 'no_match', matchId: null, score: 0, matchType: 'none', signals: [], guardsFired }
  }

  let decision: Decision
  let action: Action
  if (best.fused >= cfg.thresholds.autoMerge) { decision = 'duplicate'; action = 'auto_merge' }
  else if (best.fused >= cfg.thresholds.review) { decision = 'merge_candidate'; action = 'flag_review' }
  else { decision = 'unique'; action = 'no_match' }

  return {
    decision,
    action,
    matchId: decision === 'unique' ? null : best.id,
    score: Number(best.fused.toFixed(4)),
    matchType: best.matchType,
    signals: best.signals,
    guardsFired,
  }
}

// ── Per-type registry ───────────────────────────────────────────────────────
//
// The config that REPLACES the per-type if-ladder in pipeline-deduplicate.
// Initial numbers calibrated by scripts/dedup-eval.ts against labeled pairs.
// VENUE/HOTEL tuned from the production distribution (669 confirmed-dup pairs vs
// 130k same-city distinct pairs, 2026-06-24): dup median cosine 0.835 but
// distinct same-city median ~0.82 (they share city/country context), so semantic
// ALONE is a weak venue discriminator — the confirm path carries it and the
// standalone bar sits at 0.96 (above distinct p99 0.872) to stay precise.
export const DEDUP_REGISTRY: Record<EntityType, TypeConfig> = {
  venue: {
    entityType: 'venue',
    candidateRpc: 'find_venue_duplicate_candidates',
    idField: 'venue_id',
    semantic: { enabled: true, minCosine: 0.84, confirmWeight: 0.06, standaloneReviewCosine: 0.96 },
    thresholds: { autoMerge: 0.90, review: 0.75 },
    guards: [geoGuard(250)],
  },
  hotel: {
    entityType: 'hotel',
    candidateRpc: 'find_hotel_duplicate_candidates',
    idField: 'venue_id',
    semantic: { enabled: true, minCosine: 0.86, confirmWeight: 0.05, standaloneReviewCosine: 0.96 },
    thresholds: { autoMerge: 0.90, review: 0.75 },
    guards: [geoGuard(250)],
  },
  event: {
    entityType: 'event',
    candidateRpc: 'find_event_duplicate_candidates',
    idField: 'event_id',
    semantic: { enabled: true, minCosine: 0.88, confirmWeight: 0.05, standaloneReviewCosine: 0.95 },
    thresholds: { autoMerge: 0.90, review: 0.75 },
    guards: [geoGuard(2000), timeGuard(48)],
  },
  city: {
    entityType: 'city',
    candidateRpc: 'find_city_duplicate_candidates',
    idField: 'city_id',
    semantic: { enabled: true, minCosine: 0.90, confirmWeight: 0.05, standaloneReviewCosine: 0.96 },
    thresholds: { autoMerge: 0.92, review: 0.80 },
    guards: [countryGuard(), geoGuard(25000)],
  },
  country: {
    entityType: 'country',
    candidateRpc: 'find_country_duplicate_candidates',
    idField: 'country_id',
    // ISO code is authoritative; embeddings add risk, not signal.
    semantic: { enabled: false, minCosine: 1, confirmWeight: 0, standaloneReviewCosine: 1 },
    thresholds: { autoMerge: 0.95, review: 0.85 },
    guards: [],
  },
  news: {
    entityType: 'news',
    candidateRpc: null, // fingerprint→url path stays in the edge fn ahead of this
    idField: 'id',
    // confirm-only: semantic can flag a review item but cannot move the fused score.
    semantic: { enabled: true, minCosine: 0.93, confirmWeight: 0, standaloneReviewCosine: 0.95 },
    thresholds: { autoMerge: 0.98, review: 0.90 },
    guards: [],
  },
  marketplace: {
    entityType: 'marketplace',
    candidateRpc: 'find_marketplace_duplicate_candidates',
    idField: 'marketplace_id',
    semantic: { enabled: true, minCosine: 0.90, confirmWeight: 0.05, standaloneReviewCosine: 0.95 },
    thresholds: { autoMerge: 0.92, review: 0.80 },
    guards: [],
  },
  personality: {
    entityType: 'personality',
    candidateRpc: null, // no deterministic RPC today — name+semantic only
    idField: 'id',
    semantic: { enabled: true, minCosine: 0.90, confirmWeight: 0.06, standaloneReviewCosine: 0.95 },
    thresholds: { autoMerge: 0.93, review: 0.82 },
    guards: [countryGuard()],
  },
  organization: {
    entityType: 'organization',
    candidateRpc: 'find_organization_duplicate_candidates',
    idField: 'organization_id',
    // Orgs are indexed in search_documents; semantic confirms/flags but the RPC
    // scoring is the precision contract: despaced-name exact + same
    // website_domain = 1.00 (only signal above autoMerge); domain-only 0.90 and
    // name-only 0.85 land in review. No geo on orgs → no geoGuard.
    semantic: { enabled: true, minCosine: 0.90, confirmWeight: 0.05, standaloneReviewCosine: 0.96 },
    thresholds: { autoMerge: 0.92, review: 0.80 },
    guards: [],
  },
}

/**
 * Compose the text we embed for a staging item. MUST mirror the worker's
 * composeEmbedText (workers/ingest/src/index.ts) so the query vector lives in
 * the same space as the stored bge-m3 embeddings.
 */
export function composeStagingEmbedText(n: Record<string, unknown>): string {
  const s = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v))
  const loc = (n.location ?? {}) as Record<string, unknown>
  const parts: string[] = []
  const title = s(n.title) || s(n.name)
  if (title) parts.push(title)
  const desc = s(n.description) || s(n.bio) || s(n.summary)
  if (desc) parts.push(desc)
  if (Array.isArray(n.tags)) parts.push('Tags: ' + (n.tags as unknown[]).map(s).join(', '))
  if (n.category) parts.push('Category: ' + s(n.category))
  if (n.event_type) parts.push('Type: ' + s(n.event_type))
  if (n.profession) parts.push('Profession: ' + s(n.profession))
  const city = s(n.city) || s(loc.city)
  if (city) parts.push('City: ' + city)
  const country = s(n.country) || s(loc.country)
  if (country) parts.push('Country: ' + country)
  return parts.filter(Boolean).join('. ').slice(0, 2000)
}
