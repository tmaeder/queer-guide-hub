import { assertEquals, assert, assertFalse } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { evaluatePublishGate, extractionIsEmpty } from './decision.ts'
import type { QualityDecision } from './schema.ts'

function baseDecision(overrides: Partial<QualityDecision> = {}): QualityDecision {
  return {
    isRelevant: true,
    relevanceScore: 0.9,
    qualityScoreBefore: 0.5,
    qualityScoreAfter: 0.85,
    shouldPublish: true,
    needsManualReview: false,
    title: 't', excerpt: 'e', cleanedBody: 'b',
    sentiment: 'neutral',
    tags: ['t'], linkedCountries: [], linkedCities: [], linkedRegions: [],
    linkedVenues: [], linkedEvents: [], linkedPersonalities: [], linkedOrganisations: [],
    imageAssessment: { isUsable: true, qualityScore: 0.8, isRelevant: true, needsReplacement: false, reason: '' },
    removedArtifacts: [], warnings: [], confidence: 0.85,
    isSatire: false, isAdvertorial: false,
    ...overrides,
  }
}

Deno.test('clean article passes the gate', () => {
  const r = evaluatePublishGate({
    decision: baseDecision(),
    criticalPaywall: false, truncated: false, hasEntityReviewItems: false, imageProbeOk: true,
  })
  assertEquals(r.status, 'passed')
  assert(r.autoPublish)
})

Deno.test('low relevance routes to review', () => {
  const r = evaluatePublishGate({
    decision: baseDecision({ relevanceScore: 0.5 }),
    criticalPaywall: false, truncated: false, hasEntityReviewItems: false, imageProbeOk: true,
  })
  assertEquals(r.status, 'review')
  assertFalse(r.autoPublish)
  assert(r.blockedReasons.includes('low_relevance'))
})

Deno.test('clearly irrelevant article is rejected', () => {
  const r = evaluatePublishGate({
    decision: baseDecision({ isRelevant: false, relevanceScore: 0.1 }),
    criticalPaywall: false, truncated: false, hasEntityReviewItems: false, imageProbeOk: true,
  })
  assertEquals(r.status, 'rejected')
})

Deno.test('critical paywall + low quality is rejected', () => {
  const r = evaluatePublishGate({
    decision: baseDecision({ qualityScoreAfter: 0.4 }),
    criticalPaywall: true, truncated: false, hasEntityReviewItems: false, imageProbeOk: false,
  })
  assertEquals(r.status, 'rejected')
})

Deno.test('satire goes to review even when otherwise clean', () => {
  const r = evaluatePublishGate({
    decision: baseDecision({ isSatire: true }),
    criticalPaywall: false, truncated: false, hasEntityReviewItems: false, imageProbeOk: true,
  })
  assertEquals(r.status, 'review')
  assert(r.blockedReasons.includes('satire'))
})

// --- empty extraction is not a verdict -------------------------------------
// The shape parseQualityDecision produces when the model returns a valid JSON
// object containing nothing: every field defaults, which is byte-identical to a
// confident "clearly irrelevant" and was being rejected as one.
const blankExtraction = (overrides: Partial<QualityDecision> = {}) =>
  baseDecision({
    isRelevant: false, relevanceScore: 0, qualityScoreAfter: 0,
    title: '', excerpt: '', cleanedBody: '', confidence: 0,
    ...overrides,
  })

Deno.test('empty extraction goes to review, never rejected', () => {
  const r = evaluatePublishGate({
    decision: blankExtraction(),
    criticalPaywall: false, truncated: false, hasEntityReviewItems: false, imageProbeOk: true,
  })
  assertEquals(r.status, 'review')
  assertFalse(r.autoPublish)
  assert(r.blockedReasons.includes('empty_extraction'))
})

Deno.test('empty extraction outranks the critical-paywall rejection too', () => {
  // Both outright-reject branches must sit below the emptiness check, or a
  // blank record on a paywalled source is still rejected without a verdict.
  const r = evaluatePublishGate({
    decision: blankExtraction(),
    criticalPaywall: true, truncated: true, hasEntityReviewItems: false, imageProbeOk: false,
  })
  assertEquals(r.status, 'review')
  assert(r.blockedReasons.includes('empty_extraction'))
})

Deno.test('a stated confidence makes it a verdict — rejection stands', () => {
  const r = evaluatePublishGate({
    decision: blankExtraction({ confidence: 0.9 }),
    criticalPaywall: false, truncated: false, hasEntityReviewItems: false, imageProbeOk: true,
  })
  assertEquals(r.status, 'rejected')
  assertFalse(r.blockedReasons.includes('empty_extraction'))
})

Deno.test('any extracted text makes it a verdict — rejection stands', () => {
  for (const field of ['title', 'excerpt', 'cleanedBody'] as const) {
    const r = evaluatePublishGate({
      decision: blankExtraction({ [field]: 'something the model actually read' }),
      criticalPaywall: false, truncated: false, hasEntityReviewItems: false, imageProbeOk: true,
    })
    assertEquals(r.status, 'rejected', `${field} present must not be treated as empty`)
  }
})

Deno.test('whitespace-only text is still empty', () => {
  assert(extractionIsEmpty(blankExtraction({ title: '   ', cleanedBody: '\n\t' })))
})

Deno.test('a clean passing article is never read as an empty extraction', () => {
  assertFalse(extractionIsEmpty(baseDecision()))
})

Deno.test('pending entity reviews block auto-publish', () => {
  const r = evaluatePublishGate({
    decision: baseDecision(),
    criticalPaywall: false, truncated: false, hasEntityReviewItems: true, imageProbeOk: true,
  })
  assertFalse(r.autoPublish)
  assert(r.blockedReasons.includes('entity_links_pending_review'))
})
