import test from 'node:test'
import assert from 'node:assert/strict'
import { buildProductRelevanceRequest, productRelevanceJudgment } from './jev-product-relevance.ts'
import type { JevResponse } from './jev-client.ts'

function response(overrides: Record<string, number> = {}): JevResponse {
  const values = { pride_design: 0, queer_culture: 0, gender_affirming_function: 0, queer_positioned_intimacy: 0, brand_affiliation_claim: 0, explicit_adult: 0, medical_claim: 0, legal_claim: 0, ...overrides }
  return { model: 'jev-1.14.0', usage: { input_tokens: 100, output_tokens: 10 }, answers: Object.fromEntries(Object.entries(values).map(([key, noul]) => [key, { type: 'noul', noul }])) }
}
test('relevance, absence and ambiguity have separate routes; sensitivity cannot grant approval', () => {
  assert.equal(productRelevanceJudgment(response({ pride_design: 0.99 })).route, 'approve')
  assert.equal(productRelevanceJudgment(response()).route, 'reject')
  assert.equal(productRelevanceJudgment(response({ pride_design: 0.5 })).route, 'review')
  for (const key of ['explicit_adult', 'medical_claim', 'legal_claim']) {
    assert.equal(productRelevanceJudgment(response({ gender_affirming_function: 0.99, [key]: 0.99 })).route, 'review')
    assert.equal(productRelevanceJudgment(response({ gender_affirming_function: 0.99, [key]: 0.5 })).route, 'review')
  }
  assert.equal(productRelevanceJudgment(response({ explicit_adult: 1 })).route, 'reject')
  assert.equal(productRelevanceJudgment(response({ brand_affiliation_claim: 0.99 })).route, 'review')
  assert.equal(productRelevanceJudgment(response({ queer_culture: 0.99, brand_affiliation_claim: 0.99 })).route, 'approve')
  assert.throws(() => productRelevanceJudgment(response({ pride_design: NaN })))
})
test('product requests exclude merchant/account metadata and refuse incomplete or oversized evidence', () => {
  const input = { title: 'Pride flag', text: 'An LGBTQ Pride flag made from woven fabric, measuring 90 by 150 cm.', account_id: 'PRIVATE_ACCOUNT', owner: 'PRIVATE_IDENTITY' }
  const request = buildProductRelevanceRequest(input)
  assert.doesNotMatch(JSON.stringify(request), /PRIVATE_|account_id|owner/)
  assert.equal(Object.keys(request.questions).length, 8)
  for (const p of [{ ...input, text: '' }, { ...input, title: 'x'.repeat(501) }, { ...input, text: 'x'.repeat(12001) }]) assert.throws(() => buildProductRelevanceRequest(p))
})
