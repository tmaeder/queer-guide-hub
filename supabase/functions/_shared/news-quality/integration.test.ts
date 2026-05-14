// Integration-style tests exercising sanitize + decision evaluator together
// against representative news fixtures. No HTTP, no DB — pure logic flow that
// would otherwise sit unverified between the unit boundary and prod.

import { assertEquals, assert, assertFalse } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { sanitizeArticle } from './sanitize.ts'
import { evaluatePublishGate } from './decision.ts'
import type { QualityDecision } from './schema.ts'
import { _internals as entityInternals } from './entity-link.ts'

function decisionFor(input: Partial<QualityDecision>): QualityDecision {
  return {
    isRelevant: true,
    relevanceScore: 0.9,
    qualityScoreBefore: 0.4,
    qualityScoreAfter: 0.85,
    shouldPublish: true,
    needsManualReview: false,
    title: 'Title', excerpt: 'Excerpt', cleanedBody: 'Body',
    sentiment: 'neutral',
    tags: [], linkedCountries: [], linkedCities: [], linkedRegions: [],
    linkedVenues: [], linkedEvents: [], linkedPersonalities: [], linkedOrganisations: [],
    imageAssessment: { isUsable: true, qualityScore: 0.8, isRelevant: true, needsReplacement: false, reason: '' },
    removedArtifacts: [], warnings: [], confidence: 0.85,
    isSatire: false, isAdvertorial: false,
    ...input,
  }
}

Deno.test('integration: clean LGBTQ+ article passes end-to-end', () => {
  const input = {
    title: 'Berlin Pride draws record 1.5 million attendees',
    content:
      'Berlin Pride 2026 saw a record turnout of an estimated 1.5 million people on Saturday, organisers said. '
      + 'The parade wound through Schöneberg and Tiergarten under tightened security amid recent attacks. '.repeat(6),
  }
  const sani = sanitizeArticle(input)
  assertFalse(sani.criticalPaywall)
  assertFalse(sani.truncated)

  const gate = evaluatePublishGate({
    decision: decisionFor({ tags: ['pride', 'berlin', 'community'] }),
    criticalPaywall: sani.criticalPaywall,
    truncated: sani.truncated,
    hasEntityReviewItems: false,
    imageProbeOk: true,
  })
  assertEquals(gate.status, 'passed')
  assert(gate.autoPublish)
})

Deno.test('integration: paywalled scraped article goes to review', () => {
  const input = {
    title: 'Major LGBTQ+ ruling',
    content: 'A major court ruling on LGBTQ+ rights was handed down today. ONLY AVAILABLE IN PAID PLANS',
  }
  const sani = sanitizeArticle(input)
  assert(sani.criticalPaywall)
  assert(!sani.content.includes('ONLY AVAILABLE IN PAID PLANS'))

  const gate = evaluatePublishGate({
    decision: decisionFor({ qualityScoreAfter: 0.55 }),
    criticalPaywall: sani.criticalPaywall,
    truncated: sani.truncated,
    hasEntityReviewItems: false,
    imageProbeOk: true,
  })
  assertEquals(gate.status, 'review')
  assert(gate.blockedReasons.includes('critical_paywall'))
})

Deno.test('integration: weak-keyword article (Georgia state) is blocked from auto-link', () => {
  const body = 'In the state of Georgia, Atlanta lawmakers voted on...'
  const guard = entityInternals.passesDisambiguationGuard('country', 'Georgia', body)
  assertFalse(guard.ok)
})

Deno.test('integration: satire article goes to review even with high scores', () => {
  const input = {
    title: '[satire] Pope joins Eurovision drag race',
    content: 'In a stunning twist...'.padEnd(400, ' a real-looking sentence.'),
  }
  const sani = sanitizeArticle(input)
  assertFalse(sani.title.toLowerCase().includes('satire'))

  const gate = evaluatePublishGate({
    decision: decisionFor({ isSatire: true, relevanceScore: 0.9, qualityScoreAfter: 0.9 }),
    criticalPaywall: false,
    truncated: false,
    hasEntityReviewItems: false,
    imageProbeOk: true,
  })
  assertEquals(gate.status, 'review')
  assert(gate.blockedReasons.includes('satire'))
})

Deno.test('integration: irrelevant article is rejected outright', () => {
  const gate = evaluatePublishGate({
    decision: decisionFor({ isRelevant: false, relevanceScore: 0.1, qualityScoreAfter: 0.6 }),
    criticalPaywall: false,
    truncated: false,
    hasEntityReviewItems: false,
    imageProbeOk: true,
  })
  assertEquals(gate.status, 'rejected')
})

Deno.test('integration: pending entity review keeps article out of auto-publish', () => {
  const gate = evaluatePublishGate({
    decision: decisionFor(),
    criticalPaywall: false,
    truncated: false,
    hasEntityReviewItems: true,
    imageProbeOk: true,
  })
  assertFalse(gate.autoPublish)
  assert(gate.blockedReasons.includes('entity_links_pending_review'))
})
