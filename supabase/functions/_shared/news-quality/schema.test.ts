import { assertEquals, assert } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { parseQualityDecision } from './schema.ts'

Deno.test('parseQualityDecision returns null for non-JSON', () => {
  assertEquals(parseQualityDecision('hello world'), null)
})

Deno.test('parseQualityDecision clamps numeric fields to 0..1', () => {
  const out = parseQualityDecision(JSON.stringify({
    relevanceScore: 1.7,
    qualityScoreAfter: -0.4,
    confidence: 'bogus',
    imageAssessment: { qualityScore: 99 },
  }))!
  assertEquals(out.relevanceScore, 1)
  assertEquals(out.qualityScoreAfter, 0)
  assertEquals(out.confidence, 0)
  assertEquals(out.imageAssessment.qualityScore, 1)
})

Deno.test('parseQualityDecision strips unknown keys + caps arrays', () => {
  const out = parseQualityDecision(JSON.stringify({
    title: 'A title',
    tags: Array.from({ length: 50 }, (_, i) => `tag-${i}`),
    bogusKey: 'should not survive',
  }))!
  assertEquals(out.tags.length, 12)
  // Unknown key not present on returned shape
  assertEquals(Reflect.get(out as unknown as Record<string, unknown>, 'bogusKey'), undefined)
})

Deno.test('parseQualityDecision normalises sentiment', () => {
  const out = parseQualityDecision(JSON.stringify({ sentiment: 'spicy' }))!
  assertEquals(out.sentiment, 'neutral')
})

Deno.test('parseQualityDecision defaults needsManualReview=true on missing field', () => {
  const out = parseQualityDecision(JSON.stringify({}))!
  assertEquals(out.needsManualReview, true)
})

Deno.test('parseQualityDecision filters non-string tag entries', () => {
  const out = parseQualityDecision(JSON.stringify({
    tags: ['valid', 42, null, '  whitespace  ', { x: 1 }],
  }))!
  assert(out.tags.includes('valid'))
  assert(out.tags.includes('whitespace'))
  assertEquals(out.tags.filter((t) => typeof t !== 'string').length, 0)
})
