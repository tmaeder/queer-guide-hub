import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { runInNewContext } from 'node:vm'

const compiled = build({
  entryPoints: ['supabase/functions/jev-validation/index.ts'], bundle: true, write: false, format: 'iife', platform: 'node',
  plugins: [{ name: 'synthetic-service', setup(builder) {
    builder.onLoad({ filter: /_shared\/supabase-client\.ts$/ }, () => ({ loader: 'js', contents: `
      export const getServiceClient = () => globalThis.testDb;
      export const requireInternalOrAdmin = async () => globalThis.testAuth;
      export const corsResponse = () => new Response();
      export const jsonResponse = (body, status) => new Response(JSON.stringify(body), {status});
      export const errorResponse = (error, status) => new Response(JSON.stringify({error}), {status});
    ` }))
  } }],
}).then(result => result.outputFiles[0].text)

async function run(body: unknown, options: { denied?: boolean; budgetDenied?: boolean; providerStatus?: number; raw?: string } = {}) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = []
  const requests: Record<string, unknown>[] = []
  let handler: (req: Request) => Promise<Response> = async () => { throw new Error('Missing handler') }
  runInNewContext(await compiled, {
    Deno: { serve: (fn: typeof handler) => { handler = fn }, env: { get: (key: string) => key === 'JEV_API_KEY' ? 'SERVER_KEY' : undefined } },
    testAuth: options.denied ? Response.json({ error: 'Unauthorized' }, { status: 401 }) : {},
    testDb: {
      rpc: async (name: string, args: Record<string, unknown>) => {
        calls.push({ name, args })
        assert.equal(args.p_account, 'validation-2026-10-29')
        if (name === 'reserve_jev_budget') return { data: !options.budgetDenied, error: null }
        if (name === 'settle_jev_budget') return { data: true, error: null }
        throw new Error(`Unexpected RPC: ${name}`)
      },
      from: () => { throw new Error('Validation must never write a source table') },
    },
    fetch: async (url: string, init: RequestInit) => {
      assert.equal(url, 'https://api.typesafe.ai/v1/systemone')
      const payload = JSON.parse(String(init.body))
      requests.push(payload)
      const historical = Object.values(payload.questions).some((question: unknown) => (question as { type: string }).type === 'choice')
      return options.providerStatus ? new Response('PRIVATE_PROVIDER_ERROR', { status: options.providerStatus }) : Response.json({
        model: 'jev-1.14.0', usage: { input_tokens: 100, output_tokens: 10 }, answers: historical
        ? Object.fromEntries(Object.keys(payload.questions).map(key => [key, { type: 'choice', choice: 'says_nothing', confidence: 1, probabilities: { supports: 0, contradicts: 0, says_nothing: 1 } }]))
        : Object.fromEntries(Object.keys(payload.questions).map(key => [key, { type: 'noul', noul: ['contradicts_value', 'contradicted', 'brand_affiliation_claim', 'explicit_adult', 'medical_claim', 'legal_claim'].includes(key) ? 0 : 1 }])),
      })
    },
    Response, URL, AbortSignal, TextEncoder, TextDecoder, crypto,
  })
  const response = await handler(new Request('https://example.test', { method: 'POST', body: options.raw ?? JSON.stringify(body) }))
  return { status: response.status, body: await response.json(), calls, requests }
}
test('preview is authenticated and returns exact fixed fixture payloads with no inference or ledger writes', async () => {
  const r = await run({ fixtures: ['event-supported'] })
  assert.equal(r.status, 200); assert.equal(r.body.inference_calls, 0); assert.equal(r.body.source_writes, 0)
  assert.equal(r.body.fixtures[0].request.questions.same_subject.type, 'noul')
  assert.equal(r.calls.length, 0); assert.equal(r.requests.length, 0)
  assert.doesNotMatch(JSON.stringify(r.body), /SERVER_KEY/)
})
test('fixed pipeline validation uses the production question builder without sending labels', async () => {
  const preview = await run({ fixtures: ['pipeline-news-faithful'] })
  assert.equal(preview.status, 200); assert.equal(preview.calls.length, 0)
  assert.equal(preview.body.fixtures[0].kind, 'synthetic_pipeline')
  const result = await run({ fixtures: ['pipeline-news-faithful'], execute: true })
  assert.equal(result.status, 200); assert.equal(result.body.results[0].matches, true)
  assert.equal(result.body.results[0].verdict, 'supported')
  assert.doesNotMatch(JSON.stringify(result.requests), /expected|held_out|development|SERVER_KEY/)
})
test('product relevance validation uses the fixed catalog and isolates ownership/sensitivity judgments', async () => {
  const r = await run({ fixtures: ['product-pride-flag'], execute: true })
  assert.equal(r.status, 200); assert.equal(r.body.results[0].kind, 'synthetic_product')
  assert.equal(r.body.results[0].verdict.route, 'approve')
  assert.equal(r.body.results[0].question_version, 'jev-product-relevance-v1')
  assert.equal(Object.keys(r.requests[0].questions as object).length, 8)
  assert.doesNotMatch(JSON.stringify(r.requests), /expected|held_out|development|SERVER_KEY/)
})
test('unauthenticated and malformed requests never reach a model, budget or source table', async () => {
  assert.equal((await run({ fixtures: ['event-supported'], execute: true }, { denied: true })).status, 401)
  for (const body of [null, [], {}, { fixtures: ['__proto__'] }, { fixtures: ['event-supported'], execute: 'true' }, { fixtures: ['event-supported'], account: 'production' }, { fixtures: ['event-supported', 'event-supported'] }]) {
    const r = await run(body)
    assert.equal(r.status, 400); assert.equal(r.calls.length, 0); assert.equal(r.requests.length, 0)
  }
  assert.equal((await run({}, { raw: 'x'.repeat(4097) })).status, 413)
})
test('live execution only charges the fixed lifetime validation account and returns labeled judgments', async () => {
  const r = await run({ fixtures: ['event-supported', 'accessibility-supported'], execute: true })
  assert.equal(r.status, 200); assert.equal(r.body.source_writes, 0)
  assert.equal(r.body.results.length, 2); assert.equal(r.requests.length, 2)
  assert.ok(r.body.results.every((result: { matches: boolean }) => result.matches))
  assert.deepEqual(r.calls.map(call => call.name), ['reserve_jev_budget', 'settle_jev_budget', 'reserve_jev_budget', 'settle_jev_budget'])
  for (const request of r.requests) assert.doesNotMatch(JSON.stringify(request), /expected|SERVER_KEY|authorization/)
})
test('budget denial and provider failures never become passed validation results', async () => {
  const denied = await run({ fixtures: ['event-supported'], execute: true }, { budgetDenied: true })
  assert.equal(denied.status, 429); assert.equal(denied.body.error, 'budget_deferred'); assert.equal(denied.requests.length, 0)
  const failed = await run({ fixtures: ['event-supported'], execute: true }, { providerStatus: 503 })
  assert.equal(failed.status, 503); assert.equal(failed.body.success, false); assert.equal(failed.body.results.length, 0)
  assert.equal(failed.calls.at(-1)?.args.p_input_tokens, null)
  assert.doesNotMatch(JSON.stringify(failed.body), /PRIVATE_PROVIDER_ERROR/)
})
test('historical benchmark preserves structured questions and hides labels from the model', async () => {
  const preview = await run({ fixtures: ['accessibility-benchmark-01'] })
  assert.equal(preview.status, 200)
  assert.equal(preview.body.fixtures[0].kind, 'historical_accessibility')
  assert.equal(preview.calls.length, 0)
  const live = await run({ fixtures: ['accessibility-benchmark-01'], execute: true })
  assert.equal(live.status, 200); assert.equal(live.body.results[0].matches, true)
  assert.equal(live.body.results[0].verdict['service-animals-welcome'].kept, false)
  assert.doesNotMatch(JSON.stringify(live.requests), /expected|keep|why|SERVER_KEY/)
  for (const name of ['accessibility-benchmark--1', 'accessibility-benchmark-99', 'accessibility-benchmark-01x']) {
    const result = await run({ fixtures: [name], execute: true })
    assert.equal(result.status, 400); assert.equal(result.requests.length, 0)
  }
})
