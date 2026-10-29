import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { runInNewContext } from 'node:vm'

const compiled = build({ entryPoints: ['supabase/functions/marketplace-relevance/index.ts'], bundle: true, write: false, format: 'iife', platform: 'node', plugins: [{ name: 'relevance-boundaries', setup(b) {
  b.onLoad({ filter: /_shared\/supabase-client\.ts$/ }, () => ({ loader: 'js', contents: `
    export const getServiceClient=()=>globalThis.testDb;
    export const requireInternalOrAdmin=async()=>globalThis.testAuth;
    export const jsonResponse=(body,status)=>new Response(JSON.stringify(body),{status});
    export const errorResponse=(error,status)=>new Response(JSON.stringify({error}),{status});
    export const corsResponse=()=>new Response();
  ` }))
  b.onLoad({ filter: /_shared\/llm-budget\.ts$/ }, () => ({ loader: 'js', contents: 'export const consumeLlmBudget=async()=>({degraded:false,remaining:800});' }))
} }] }).then(r => r.outputFiles[0].text)

async function run(result: unknown, options: { body?: Record<string, unknown>; stale?: boolean; writeError?: boolean; denied?: boolean } = {}) {
  const writes: Record<string, unknown>[] = [], selections: Array<[string, unknown]> = []
  let calls = 0, handler: (req: Request) => Promise<Response> = async () => { throw new Error('No handler') }
  const item = { id: 'public-product', normalized_data: { name: 'Pronoun cards', sourceName: 'trusted-shop', description: 'Cards displaying pronouns for a Pride event.' }, updated_at: '2026-10-29T12:00:00Z' }
  const db = {
    from(table: string) {
      if (table === 'ingestion_events') return { select: () => ({ eq: () => ({ gte: async () => ({ count: 0 }) }) }) }
      assert.equal(table, 'ingestion_staging')
      const chain = {
        select: () => chain, eq: (key: string, value: unknown) => { selections.push([key, value]); return chain }, is: () => chain, in: () => chain, order: () => chain, limit: () => chain,
        then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve({ data: [item], error: null }).then(resolve, reject),
      }
      return chain
    },
    async rpc(name: string, args: Record<string, unknown>) {
      assert.equal(name, 'record_marketplace_relevance'); writes.push(args)
      return { data: !options.stale, error: options.writeError ? { message: 'write failed' } : null }
    },
  }
  runInNewContext(await compiled, {
    Deno: { serve: (fn: typeof handler) => { handler = fn }, env: { get: (key: string) => ({ CF_ACCOUNT_ID: 'account', CF_AI_API_TOKEN: 'SERVER_KEY' })[key] } },
    testDb: db, testAuth: options.denied ? new Response('{}', { status: 401 }) : {},
    fetch: async () => { calls++; return Response.json({ result: { response: JSON.stringify(result) } }) },
    setTimeout: (fn: () => void, ms: number) => ms === 200 ? (fn(), 0) : setTimeout(fn, ms), clearTimeout,
    Response, Request, AbortController, console,
  })
  const response = await handler(new Request('https://example.test', { method: 'POST', body: JSON.stringify(options.body ?? {}) }))
  return { status: response.status, body: await response.json(), calls, writes, selections }
}
const answer = (positive: boolean, confidence = 0.99) => ({ queer_relevant: positive, confidence, reasoning: 'Product source assessment', suggested_tags: [], sensitivity_flags: [] })
test('actual worker rejects confident negatives and stores positive relevance probability', async () => {
  const r = await run(answer(false))
  assert.equal(r.status, 200); assert.equal(r.body.rejected, 1); assert.equal(r.body.approved, 0)
  assert.equal(r.writes[0].p_decision, 'reject')
  const classification = r.writes[0].p_classification as Record<string, unknown>
  assert.equal(classification.lgbti_relevant, false)
  assert.ok(Math.abs(Number(classification.lgbti_relevance_score) - 0.01) < 1e-8)
  assert.equal(r.writes[0].p_expected_updated_at, '2026-10-29T12:00:00Z')
  assert.ok(r.selections.some(([key, value]) => key === 'disposition' && value === 'pending'))
})
test('positive, uncertain and high sensitivity have separate recorded outcomes', async () => {
  assert.equal((await run(answer(true))).writes[0].p_decision, 'approve')
  const uncertain = await run(answer(false, 0.2))
  assert.equal(uncertain.body.review, 1); assert.equal(uncertain.writes[0].p_decision, 'review')
  const sensitive = await run({ ...answer(true), sensitivity_flags: [{ category: 'medical', confidence: 0.9, severity: 'high', indicators: ['source statement'] }] })
  assert.equal(sensitive.body.review, 1); assert.equal(sensitive.writes[0].p_decision, 'review')
})
test('malformed answers, stale inputs and database failures cannot be counted as approval', async () => {
  const malformed = await run({ ...answer(false), queer_relevant: 'false' })
  assert.equal(malformed.body.failed, 1); assert.equal(malformed.writes.length, 0)
  for (const options of [{ stale: true }, { writeError: true }]) {
    const r = await run(answer(true), options)
    assert.equal(r.body.approved, 0); assert.equal(r.body.stale + r.body.failed, 1)
  }
})
test('trust stamps are atomic; dry runs, bad config and unauthorized calls do not write', async () => {
  const trusted = await run(null, { body: { trust_sources: ['trusted-shop'] } })
  assert.equal(trusted.calls, 0); assert.equal(trusted.writes[0].p_decision, 'trust'); assert.equal(trusted.body.trusted, 1)
  assert.equal((await run(answer(true), { body: { dry_run: true } })).writes.length, 0)
  const bad = await run(answer(true), { body: { threshold: '0' } }); assert.equal(bad.status, 400); assert.equal(bad.calls, 0)
  const denied = await run(answer(true), { denied: true }); assert.equal(denied.status, 401); assert.equal(denied.calls, 0); assert.equal(denied.writes.length, 0)
})
