import test from 'node:test'
import assert from 'node:assert/strict'
import { callJev, createJevBudget, JEV_MAX_RESERVATION, JEV_MODEL, JevBudgetError, JevProviderError, readJevResponse, type JevBudget, type JevRequest } from './jev-client.ts'

const request: JevRequest = { model: JEV_MODEL, state: { source: 'Synthetic public programme' }, questions: {
  category: { type: 'choice', instructions: 'Which activity is described?', criteria: { games: 'Board games', music: 'Music' } },
  supported: { type: 'noul', instructions: 'Does the text identify an activity?' },
} }
const result = () => ({ model: JEV_MODEL, usage: { input_tokens: 100, output_tokens: 20 }, answers: {
  category: { type: 'choice', choice: 'games', confidence: 0.9, probabilities: { games: 0.9, music: 0.1 } },
  supported: { type: 'noul', noul: 0.9 },
} })
function ledger(allowed = true) {
  const events: unknown[] = []
  const budget: JevBudget = {
    reserve: async input => { events.push(['reserve', input]); return allowed },
    settle: async (id, tokens) => { events.push(['settle', id, tokens]) },
  }
  return { budget, events }
}
test('reserve precedes network; settle uses actual input usage and exposes no secret in ledger', async () => {
  const { budget, events } = ledger()
  const value = await callJev(request, { apiKey: 'SERVER_SECRET', caller: 'review-automation', budget,
    fetcher: async (url, init) => {
      events.push(['fetch'])
      assert.equal(url, 'https://api.typesafe.ai/v1/systemone')
      assert.equal(init?.redirect, 'error')
      assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer SERVER_SECRET')
      assert.deepEqual(JSON.parse(String(init?.body)), request)
      return Response.json(result())
    } })
  assert.equal(value.usage.input_tokens, 100)
  assert.deepEqual(events.map(e => (e as string[])[0]), ['reserve', 'fetch', 'settle'])
  assert.equal((events[2] as unknown[])[2], 100)
  assert.doesNotMatch(JSON.stringify(events), /SERVER_SECRET|Synthetic public/)
  assert.equal(JEV_MAX_RESERVATION, 2_752_512)
})
test('denied or unavailable accounting never reaches the provider', async () => {
  let calls = 0
  for (const budget of [ledger(false).budget, { reserve: async () => { throw new Error('DB unavailable') }, settle: async () => {} }]) {
    await assert.rejects(callJev(request, { apiKey: 'test', caller: 'review', budget, fetcher: async () => { calls++; return Response.json(result()) } }))
  }
  assert.equal(calls, 0)
})
test('provider failure and malformed/missing usage conservatively charge the full reservation', async () => {
  for (const response of [new Response('PRIVATE_PROVIDER_BODY', { status: 429 }), Response.json({ ...result(), usage: null }), Response.json({ ...result(), answers: {} }), new Response('bad JSON')]) {
    const { budget, events } = ledger()
    await assert.rejects(callJev(request, { apiKey: 'test', caller: 'review', budget, fetcher: async () => response }), error => {
      assert.doesNotMatch(String(error), /PRIVATE_PROVIDER_BODY/)
      return true
    })
    assert.equal((events.at(-1) as unknown[])[2], null)
  }
})
test('transport errors are not negative judgments; failed settlement withholds a valid answer', async () => {
  const { budget, events } = ledger()
  await assert.rejects(callJev(request, { apiKey: 'test', caller: 'review', budget, fetcher: async () => { throw new Error('Network failed') } }), /Network failed/)
  assert.equal((events.at(-1) as unknown[])[2], null)
  await assert.rejects(callJev(request, { apiKey: 'test', caller: 'review', budget: { ...budget, settle: async () => { throw new JevBudgetError('Settlement failed') } }, fetcher: async () => Response.json(result()) }), JevBudgetError)
  await assert.rejects(callJev(request, { apiKey: 'test', caller: 'review', budget, fetcher: async () => new Response(null, { status: 402 }) }), JevProviderError)
})
test('bad configuration, unsupported models and unbounded requests fail before reservation', async () => {
  const { budget, events } = ledger()
  for (const [body, apiKey] of [[request, ''], [{ ...request, model: 'jev-latest' }, 'test'], [{ ...request, state: 'x'.repeat(196609) }, 'test'], [{ ...request, questions: {} }, 'test']] as const) {
    await assert.rejects(callJev(body, { apiKey, caller: 'review', budget }))
  }
  assert.equal(events.length, 0)
})
test('refuse inconsistent, missing, extra, nonfinite answers and invalid usage', () => {
  for (const mutate of [
    (r: ReturnType<typeof result>) => { r.model = 'wrong' },
    (r: ReturnType<typeof result>) => { r.usage.input_tokens = 65537 },
    (r: ReturnType<typeof result>) => { r.usage.input_tokens = -1 },
    (r: ReturnType<typeof result>) => { r.answers.supported.noul = NaN },
    (r: ReturnType<typeof result>) => { r.answers.category.probabilities.games = 0.1 },
    (r: ReturnType<typeof result>) => { r.answers.category.confidence = 2 },
  ]) { const raw = result(); mutate(raw); assert.throws(() => readJevResponse(raw, request)) }
  assert.throws(() => readJevResponse({ ...result(), answers: { ...result().answers, injected: {} } }, request))
  assert.equal(readJevResponse(result(), request).answers.supported && true, true)
})
test('RPC adapter fails closed on ambiguous responses and does not expose DB errors', async () => {
  assert.throws(() => createJevBudget({ rpc: async () => ({ data: null, error: null }) }, ''), JevBudgetError)
  const budget = createJevBudget({ rpc: async () => ({ data: null, error: 'PRIVATE_SQL_ERROR' }) }, 'validation-2026-10-29')
  await assert.rejects(budget.reserve({ requestId: 'id', caller: 'review', requestHash: 'hash' }), /reservation unavailable/)
  await assert.rejects(budget.settle('id', 100), /reservation retained/)
})
test('oversized responses cannot escape accounting or accumulate unbounded memory', async () => {
  const { budget, events } = ledger()
  await assert.rejects(callJev(request, { apiKey: 'test', caller: 'review', budget, fetcher: async () => new Response('x'.repeat(262145)) }), /256 KiB/)
  assert.equal((events.at(-1) as unknown[])[2], null)
})
