import test from 'node:test'
import assert from 'node:assert/strict'
import { readRelevanceResult, relevanceDisposition } from './decision.ts'

const result = (positive: boolean, confidence: number) => readRelevanceResult({ queer_relevant: positive, confidence, reasoning: 'Source content judgment', suggested_tags: [], sensitivity_flags: [] })
test('a confident negative never becomes approval; ambiguity and high sensitivity stay in review', () => {
  assert.equal(relevanceDisposition(result(false, 0.99), 0.6), 'reject')
  assert.equal(relevanceDisposition(result(true, 0.99), 0.6), 'approve')
  for (const positive of [false, true]) assert.equal(relevanceDisposition(result(positive, 0.4), 0.6), 'review')
  const sensitive = result(true, 0.99)
  sensitive.sensitivity_flags = [{ category: 'medical', confidence: 0.99, severity: 'high', indicators: ['source statement'] }]
  assert.equal(relevanceDisposition(sensitive, 0.6), 'review')
  for (const threshold of [NaN, Infinity, -0.1, 1.1]) assert.throws(() => relevanceDisposition(sensitive, threshold))
})
test('malformed generative booleans, confidence and sensitivity cannot masquerade as judgments', () => {
  const valid = result(false, 0.99)
  for (const patch of [{ queer_relevant: 'false' }, { queer_relevant: null }, { confidence: '0.99' }, { confidence: NaN }, { confidence: 1.1 }, { sensitivity_flags: [{ category: 'medical', severity: 'high' }] }, { suggested_tags: [17] }]) assert.throws(() => readRelevanceResult({ ...valid, ...patch }))
})
