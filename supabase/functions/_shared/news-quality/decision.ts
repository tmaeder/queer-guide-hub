// Combine sanitizer + AI decision into a final auto-publish gate.
// Pure logic; consumed by pipeline-quality-enhance and news-quality-backfill.

import type { QualityDecision } from './schema.ts'

export interface PublishGateInput {
  decision: QualityDecision
  criticalPaywall: boolean
  truncated: boolean
  hasEntityReviewItems: boolean
  imageProbeOk: boolean
}

export interface PublishGateResult {
  autoPublish: boolean
  status: 'passed' | 'review' | 'rejected'
  blockedReasons: string[]
}

const RELEVANCE_MIN = 0.75
const QUALITY_MIN = 0.7
const CONFIDENCE_MIN = 0.7

export function evaluatePublishGate(input: PublishGateInput): PublishGateResult {
  const { decision: d, criticalPaywall, truncated, hasEntityReviewItems, imageProbeOk } = input
  const reasons: string[] = []

  if (!d.isRelevant || d.relevanceScore < RELEVANCE_MIN) reasons.push('low_relevance')
  if (d.qualityScoreAfter < QUALITY_MIN) reasons.push('low_quality')
  if (d.confidence < CONFIDENCE_MIN) reasons.push('low_confidence')
  if (d.needsManualReview) reasons.push('manual_review_requested')
  if (criticalPaywall) reasons.push('critical_paywall')
  if (truncated) reasons.push('truncated_body')
  if (d.isSatire) reasons.push('satire')
  if (d.isAdvertorial) reasons.push('advertorial')
  if (!d.imageAssessment.isUsable && !imageProbeOk) reasons.push('image_unusable')
  if (hasEntityReviewItems) reasons.push('entity_links_pending_review')

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
