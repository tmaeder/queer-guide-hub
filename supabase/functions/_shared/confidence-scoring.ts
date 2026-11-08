/**
 * Confidence scoring engine for automated content checks.
 *
 * Provides a consistent framework for computing confidence scores across
 * all check types. Each check produces a ConfidenceResult that determines
 * whether the system should auto-correct, flag for review, or block.
 *
 * Scoring philosophy:
 * - 0.95-1.00: Deterministic/exact match — safe to auto-apply
 * - 0.85-0.94: High confidence — auto-apply if module threshold allows
 * - 0.70-0.84: Medium confidence — flag for review
 * - 0.50-0.69: Low confidence — flag for review with warning
 * - 0.00-0.49: Very low — likely false positive, skip or flag as info
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type ReviewAction = 'auto_correct' | 'needs_review' | 'clearly_wrong' | 'info_only'

export interface ConfidenceResult {
  /** Overall confidence 0.0 - 1.0 */
  score: number
  /** Recommended review action */
  action: ReviewAction
  /** Human-readable explanation of the scoring factors */
  reasoning: string
  /** Individual scoring factors for transparency */
  factors: ConfidenceFactor[]
}

export interface ConfidenceFactor {
  /** Factor name (e.g. "title_similarity", "geo_distance", "time_proximity") */
  name: string
  /** Factor score 0.0 - 1.0 */
  score: number
  /** Weight in the composite (0.0 - 1.0, weights sum to 1.0) */
  weight: number
  /** Short description for review UI */
  label: string
}

// ── Action thresholds ────────────────────────────────────────────────────────

const DEFAULT_THRESHOLDS = {
  auto_correct: 0.92,
  needs_review: 0.55,
  // Below needs_review = info_only
}

export interface ActionThresholds {
  auto_correct: number
  needs_review: number
}

export function determineAction(
  score: number,
  thresholds: ActionThresholds = DEFAULT_THRESHOLDS,
): ReviewAction {
  if (score >= thresholds.auto_correct) return 'auto_correct'
  if (score >= thresholds.needs_review) return 'needs_review'
  return 'info_only'
}

// ── Generic confidence computation ──────────────────────────────────────────

/** Compute weighted confidence from multiple factors. */
export function computeConfidence(
  factors: ConfidenceFactor[],
  thresholds?: ActionThresholds,
): ConfidenceResult {
  if (factors.length === 0) {
    return { score: 0, action: 'info_only', reasoning: 'No scoring factors', factors: [] }
  }

  const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0)
  const score = totalWeight > 0
    ? factors.reduce((sum, f) => sum + f.score * f.weight, 0) / totalWeight
    : 0

  const action = determineAction(score, thresholds)

  // Build reasoning from top factors
  const sorted = [...factors].sort((a, b) => b.weight - a.weight)
  const topFactors = sorted.slice(0, 3).map(f =>
    `${f.label}: ${(f.score * 100).toFixed(0)}%`
  ).join(', ')
  const reasoning = `Score ${(score * 100).toFixed(0)}% (${topFactors})`

  return { score: Math.round(score * 1000) / 1000, action, reasoning, factors }
}

