import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyCanonicalPersonGate } from './person-provenance-gate.mjs'
const legacy = [{ gate: 'person_outing_guard', severity: 'critical', failing: 2 },
  { gate: 'other_critical', severity: 'critical', failing: 1 }]
const report = failures => [{ gate: 'person_outing_guard', severity: 'critical', failures }]

test('source-provenanced records use the current release predicate; other breaches remain', () => {
  const result = applyCanonicalPersonGate(legacy, report(0))
  assert.equal(result[0].failing, 0)
  assert.equal(result[1].failing, 1)
  assert.equal(legacy[0].failing, 2)
})
test('a genuine current-policy breach fails even when the older metric is green', () => {
  assert.equal(applyCanonicalPersonGate([{ ...legacy[0], failing: 0 }], report(3))[0].failing, 3)
})
test('missing, duplicate, malformed and downgraded results cannot turn into a pass', () => {
  for (const invalid of [null, [], [...report(0), ...report(0)], report('0'), report(-1), report(NaN),
    [{ ...report(0)[0], severity: 'high' }]]) {
    assert.throws(() => applyCanonicalPersonGate(legacy, invalid))
  }
  assert.throws(() => applyCanonicalPersonGate([], report(0)))
})
