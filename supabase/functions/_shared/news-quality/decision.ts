// Combine sanitizer + AI decision into a final auto-publish gate.
// Pure logic; consumed by pipeline-quality-enhance and news-quality-backfill.

import type { QualityDecision } from './schema.ts'

export interface PublishGateInput {
  decision: QualityDecision
  criticalPaywall: boolean
  truncated: boolean
  hasEntityReviewItems: boolean
  imageProbeOk: boolean
  // Machine code (CSS/JS) the sanitizer could not fully remove. Optional so existing
  // callers keep compiling; absent means "not checked", never "verified clean".
  codeResidue?: boolean
}

export interface PublishGateResult {
  autoPublish: boolean
  status: 'passed' | 'review' | 'rejected'
  blockedReasons: string[]
}

const RELEVANCE_MIN = 0.75
const QUALITY_MIN = 0.7
const CONFIDENCE_MIN = 0.7

/**
 * True when the model returned a structurally valid record containing no
 * extracted text and no stated confidence — i.e. it produced nothing.
 *
 * This is NOT a verdict, and must never be scored as one. parseQualityDecision
 * defaults every absent field (isRelevant -> false, relevanceScore -> 0), so a
 * blank record is byte-identical to a confident "this is clearly irrelevant"
 * and fell straight through the outright-reject branch below.
 *
 * Measured on prod 2026-09-13 over 30 days of news staging rows carrying a
 * decision object: this shape is 443 of 1,031 rejected rows (43%) against
 * 0 of 1,212 review rows — it separates cleanly, and it is concentrated in
 * podcasts, whose 71.2% rejection rate is largely this artifact rather than a
 * content judgement. It can never describe a passing row: confidence 0 always
 * pushes `low_confidence`, so the gate cannot return 'passed' on it.
 *
 * Requiring all three text fields AND confidence 0 is deliberately
 * conservative. A model that has genuinely judged an article irrelevant states
 * a confidence; one that skipped cleaning but reached a verdict still returns a
 * title. Both keep their rejection.
 */
export function extractionIsEmpty(d: QualityDecision): boolean {
  return (
    d.confidence === 0 &&
    d.cleanedBody.trim() === '' &&
    d.title.trim() === '' &&
    d.excerpt.trim() === ''
  )
}

export function evaluatePublishGate(input: PublishGateInput): PublishGateResult {
  const { decision: d, criticalPaywall, truncated, hasEntityReviewItems, imageProbeOk } = input
  const reasons: string[] = []

  if (!d.isRelevant || d.relevanceScore < RELEVANCE_MIN) reasons.push('low_relevance')
  if (d.qualityScoreAfter < QUALITY_MIN) reasons.push('low_quality')
  if (d.confidence < CONFIDENCE_MIN) reasons.push('low_confidence')
  if (d.needsManualReview) reasons.push('manual_review_requested')
  if (criticalPaywall) reasons.push('critical_paywall')
  if (truncated) reasons.push('truncated_body')
  if (input.codeResidue) reasons.push('code_residue')
  if (d.isSatire) reasons.push('satire')
  if (d.isAdvertorial) reasons.push('advertorial')
  if (!d.imageAssessment.isUsable && !imageProbeOk) reasons.push('image_unusable')
  if (hasEntityReviewItems) reasons.push('entity_links_pending_review')

  // An empty extraction is absence of evidence, never evidence of absence.
  // Must precede both outright-reject branches: a blank record satisfies the
  // irrelevance test below by defaulting, not by judging.
  // ponytail: routes to 'review' rather than re-queueing for another LLM pass,
  // because the only non-terminal alternative is a new quality_status value and
  // pipeline-quality-enhance selects on `quality_status IS NULL` — a fourth
  // value would make the row invisible to the very stage meant to retry it.
  // Revisit if the review queue is drained and these rows dominate it.
  if (extractionIsEmpty(d)) {
    return {
      autoPublish: false,
      status: 'review',
      blockedReasons: [...reasons, 'empty_extraction'],
    }
  }

  // Reject outright if clearly irrelevant or paywalled hard.
  if (!d.isRelevant && d.relevanceScore < 0.3) {
    return { autoPublish: false, status: 'rejected', blockedReasons: reasons }
  }
  if (criticalPaywall && d.qualityScoreAfter < 0.5) {
    return { autoPublish: false, status: 'rejected', blockedReasons: reasons }
  }

  if (reasons.length === 0) {
    return { autoPublish: true, status: 'passed', blockedReasons: [] }
  }
  return { autoPublish: false, status: 'review', blockedReasons: reasons }
}
