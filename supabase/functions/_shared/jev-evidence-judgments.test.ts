import test from 'node:test'
import assert from 'node:assert/strict'
import { buildFieldEvidenceRequest, fieldEvidenceVerdict, fieldPrecondition } from './jev-evidence-judgments.ts'
import { VALIDATION_FIXTURES } from '../jev-validation/fixtures.ts'
import { JEV_MODEL } from './jev-client.ts'

const candidate = VALIDATION_FIXTURES['event-supported'].candidate
const response = (same: number, support: number, contradiction: number) => ({
  model: JEV_MODEL, usage: { input_tokens: 100, output_tokens: 1 }, answers: {
    same_subject: { type: 'noul', noul: same }, supports_value: { type: 'noul', noul: support }, contradicts_value: { type: 'noul', noul: contradiction },
  },
})
test('source identity, support and contradiction are independent, with an explicit uncertainty outcome', () => {
  assert.equal(fieldEvidenceVerdict(candidate, response(0.999, 0.999, 0)), 'supported')
  assert.equal(fieldEvidenceVerdict(candidate, response(0.999, 0, 0.999)), 'contradicted')
  for (const result of [response(0.5, 1, 0), response(1, 0.5, 0), response(1, 1, 1), response(1, 0, 0)]) {
    assert.equal(fieldEvidenceVerdict(candidate, result), 'uncertain')
  }
})
test('sensitive actions require stricter evidence and explicit authorization inputs', () => {
  assert.equal(fieldEvidenceVerdict(candidate, response(0.98, 0.98, 0)), 'supported')
  assert.equal(fieldEvidenceVerdict({ ...candidate, sensitive: true }, response(0.98, 0.98, 0)), 'uncertain')
  assert.equal(fieldEvidenceVerdict({ ...candidate, authorization: 'missing' }, response(1, 1, 0)), 'missing_authorization')
  assert.equal(fieldPrecondition({ ...candidate, source: { ...candidate.source, text: '' } }), 'missing_evidence')
})
test('requests omit labels, consent metadata and unknown caller fields; payloads are bounded', () => {
  const request = buildFieldEvidenceRequest({ ...candidate, private_metadata: 'DO_NOT_SEND' } as typeof candidate)
  assert.equal(Object.keys(request.questions).length, 3)
  assert.doesNotMatch(JSON.stringify(request), /DO_NOT_SEND|authorization|expected/)
  assert.throws(() => buildFieldEvidenceRequest({ ...candidate, value: 'x'.repeat(18001) }))
  assert.throws(() => buildFieldEvidenceRequest({ ...candidate, source: { ...candidate.source, url: 'https://reader:password@example.org' } }))
})
test('malformed probabilities cannot reach the application truth table', () => {
  assert.throws(() => fieldEvidenceVerdict(candidate, response(1, NaN, 0)))
  assert.throws(() => fieldEvidenceVerdict(candidate, { ...response(1, 1, 0), answers: {} }))
})
