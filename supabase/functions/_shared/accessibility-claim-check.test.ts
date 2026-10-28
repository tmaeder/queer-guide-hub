// Guard for accessibility-claim-check.ts — the code half of the TypeSafe judge.
//
// No live API call here: these tests pin the truth table and the request shape,
// which is everything that is code. Whether TypeSafe's ANSWERS agree with the
// hand reads is measured by scripts/data-quality/compare-accessibility-typesafe.ts
// against the live API, not asserted with invented probabilities.

import { assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { EVIDENCE_SLUGS } from './accessibility-evidence.ts'
import { LIVE_QUEUE } from './accessibility-evidence.fixtures.ts'
import {
  buildClaimRequest,
  callTypeSafe,
  CLAIMS,
  decideClaim,
  quoteQuestionId,
  type RelationProbs,
  sourceQuestionId,
  TypeSafeError,
} from './accessibility-claim-check.ts'

const SUPPORTS: RelationProbs = { supports: 0.9, contradicts: 0.05, says_nothing: 0.05 }
const CONTRA: RelationProbs = { supports: 0.05, contradicts: 0.9, says_nothing: 0.05 }
const NOTHING: RelationProbs = { supports: 0.05, contradicts: 0.05, says_nothing: 0.9 }
const MIDDLE: RelationProbs = { supports: 0.5, contradicts: 0.1, says_nothing: 0.4 }

const SRC = 'Two unisex rooms. Up the concrete stairs.'

Deno.test('CLAIMS covers exactly the regex guard vocabulary, in both directions', () => {
  assertEquals(Object.keys(CLAIMS).sort(), [...EVIDENCE_SLUGS].sort())
})

Deno.test('every slug proposed in the live queue has a claim', () => {
  for (const row of LIVE_QUEUE) for (const s of row.slugs) assertEquals(typeof CLAIMS[s], 'string', s)
})

Deno.test('grounding is decided in code: an absent quote is never asked about', () => {
  const req = buildClaimRequest({
    venueName: 'X',
    sourceText: SRC,
    slugs: ['gender-neutral-restroom'],
    citations: [{ quote: 'Two unisex rooms.' }, { quote: 'gender-neutral-restroom' }],
  })
  assertEquals(req.grounded, [true, false])
  assertEquals(Object.keys(req.body.questions).sort(), [
    quoteQuestionId('gender-neutral-restroom', 0),
    sourceQuestionId('gender-neutral-restroom'),
  ].sort())
})

Deno.test('the description is shared state, sent once; the quote and claim travel with each question', () => {
  const req = buildClaimRequest({ venueName: 'V', sourceText: SRC, slugs: ['ramp-access'], citations: [{ quote: 'Up the concrete stairs.' }] })
  assertEquals(req.body.state, { venue_name: 'V', venue_description: SRC })
  const q = req.body.questions[quoteQuestionId('ramp-access', 0)] as { instructions: Record<string, string> }
  assertEquals(q.instructions.quote, 'Up the concrete stairs.')
  assertEquals(q.instructions.claim, CLAIMS['ramp-access'])
})

Deno.test('an unrecognised slug is reported and never asked', () => {
  const req = buildClaimRequest({ venueName: 'V', sourceText: SRC, slugs: ['teleporter'], citations: [{ quote: 'Two unisex rooms.' }] })
  assertEquals(req.unrecognised, ['teleporter'])
  assertEquals(Object.keys(req.body.questions).length, 0)
  assertEquals(decideClaim('teleporter', req, {}).ok, false)
})

const two = { quotes: ['a', 'b'], grounded: [true, true] }
const ids = (slug: string) => [quoteQuestionId(slug, 0), quoteQuestionId(slug, 1), sourceQuestionId(slug)]

Deno.test('truth table: one supporting citation is enough', () => {
  const [q0, q1] = ids('ramp-access')
  assertEquals(decideClaim('ramp-access', two, { [q0]: NOTHING, [q1]: SUPPORTS }).ok, true)
})

Deno.test('truth table: support beats a contradiction on another citation', () => {
  const [q0, q1] = ids('ramp-access')
  assertEquals(decideClaim('ramp-access', two, { [q0]: CONTRA, [q1]: SUPPORTS }).ok, true)
})

Deno.test('truth table: a contradiction is refuted', () => {
  const [q0, q1] = ids('ramp-access')
  const v = decideClaim('ramp-access', two, { [q0]: CONTRA, [q1]: NOTHING })
  assertEquals(v.ok ? 'kept' : v.reason, 'refuted')
})

Deno.test('truth table: every citation invented is ungrounded, whatever was answered', () => {
  const v = decideClaim('ramp-access', { quotes: ['a'], grounded: [false] }, { [sourceQuestionId('ramp-access')]: SUPPORTS })
  assertEquals(v.ok ? 'kept' : v.reason, 'ungrounded')
})

Deno.test('truth table: citations fail but the description supports it -> miscited, still refused', () => {
  const [q0, q1, src] = ids('ramp-access')
  const v = decideClaim('ramp-access', two, { [q0]: NOTHING, [q1]: NOTHING, [src]: SUPPORTS })
  assertEquals(v.ok ? 'kept' : v.reason, 'miscited')
})

Deno.test('truth table: the unsettled band is its own verdict, never rounded to a yes', () => {
  const [q0] = ids('ramp-access')
  const v = decideClaim('ramp-access', two, { [q0]: MIDDLE })
  assertEquals(v.ok ? 'kept' : v.reason, 'unsettled')
})

Deno.test('truth table: no answers at all is no_evidence — and only ever a refusal', () => {
  const v = decideClaim('ramp-access', two, {})
  assertEquals(v.ok ? 'kept' : v.reason, 'no_evidence')
})

Deno.test('truth table: no citations is uncited', () => {
  const v = decideClaim('ramp-access', { quotes: [], grounded: [] }, {})
  assertEquals(v.ok ? 'kept' : v.reason, 'uncited')
})

function fakeFetch(statuses: number[], body = '{"model":"jev-1.14.0","answers":{}}') {
  let n = 0
  const f = (() => {
    const status = statuses[Math.min(n++, statuses.length - 1)]
    return Promise.resolve(new Response(status === 200 ? body : 'nope', { status }))
  }) as typeof fetch
  return { f, calls: () => n }
}
const noSleep = () => Promise.resolve()

Deno.test('a failed call throws — it is never an empty answer set', async () => {
  const { f, calls } = fakeFetch([401])
  await assertRejects(() => callTypeSafe({ model: 'm', state: { venue_name: '', venue_description: '' }, questions: {} }, 'k', { fetchImpl: f, sleep: noSleep }), TypeSafeError)
  assertEquals(calls(), 1)
})

Deno.test('429 and 5xx are retried, then succeed', async () => {
  const { f, calls } = fakeFetch([429, 503, 200])
  const res = await callTypeSafe({ model: 'm', state: { venue_name: '', venue_description: '' }, questions: {} }, 'k', { fetchImpl: f, sleep: noSleep })
  assertEquals(res.model, 'jev-1.14.0')
  assertEquals(calls(), 3)
})

Deno.test('retries stop at maxAttempts and throw', async () => {
  const { f, calls } = fakeFetch([503])
  await assertRejects(() => callTypeSafe({ model: 'm', state: { venue_name: '', venue_description: '' }, questions: {} }, 'k', { fetchImpl: f, sleep: noSleep, maxAttempts: 3 }), TypeSafeError)
  assertEquals(calls(), 3)
})
