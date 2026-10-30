import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { runInNewContext } from 'node:vm'
import { parseMarketplaceRelevance } from '../../supabase/functions/_shared/prompts/marketplace-relevance.ts'

test('rescore refuses coercions, duplicate identities, out-of-batch identities and invented scores', () => {
  for (const row of [{ i: '0', s: 0.8 }, { i: 0, s: '0.8' }, { i: 0, s: null }, { i: 0, s: false }, { i: 0, s: 1.1 }, { i: 0, s: -0.1 }, { i: 0.5, s: 0.8 }, { i: 1, s: 0.8 }]) {
    assert.throws(() => parseMarketplaceRelevance(JSON.stringify([row]), 1))
  }
  assert.throws(() => parseMarketplaceRelevance('[{"i":0,"s":0.8},{"i":0,"s":0.2}]', 2))
  assert.throws(() => parseMarketplaceRelevance('prose [{"i":0,"s":0.8}]', 1))
  assert.deepEqual([...parseMarketplaceRelevance('```json\n[{"i":0,"s":0.8}]\n```', 2)], [[0, 0.8]])
})

const compiled = build({ entryPoints: ['supabase/functions/marketplace-relevance-rescore/index.ts'], bundle: true, write: false, format: 'iife', platform: 'node', plugins: [{ name: 'rescore-boundaries', setup(b) {
  b.onLoad({ filter: /_shared\/supabase-client\.ts$/ }, () => ({ loader: 'js', contents: `
    export const getServiceClient=()=>globalThis.testDb;
    export const requireInternalOrAdmin=async()=>globalThis.testAuth;
    export const corsResponse=()=>new Response();
    export const jsonResponse=(b,status)=>new Response(JSON.stringify(b),{status});
    export const errorResponse=(error,status)=>new Response(JSON.stringify({error}),{status});
    export const boundedInt=(v,d,m)=>Math.min(m,v??d);
  ` }))
  b.onLoad({ filter: /_shared\/llm-client\.ts$/ }, () => ({ loader: 'js', contents: 'export const llmChatCompletion=async()=>globalThis.testLlm();' }))
  b.onLoad({ filter: /_shared\/pipeline-error-log\.ts$/ }, () => ({ loader: 'js', contents: 'export const logPipelineError=async()=>{};' }))
} }] }).then(r => r.outputFiles[0].text)

async function run(options: { body?: unknown; raw?: string; denied?: boolean; writeError?: boolean; stale?: boolean; answer?: string } = {}) {
  let handler: ((r: Request) => Promise<Response>) | undefined, calls = 0
  const filters: unknown[][] = [], writes: unknown[] = []
  const row = { id: 'fixture-listing', title: 'Fixture public product', brand: null, category: null, subcategory: null,
    description: 'Fixture', lgbti_relevance_score: 0.2, updated_at: '2026-10-29T12:00:00Z', classified_at: null, status: 'active', review_status: 'approved' }
  const db = { from: () => ({
    select: () => {
      const q = { not: () => q, order: () => q, limit: () => q, eq: () => q, or: () => q,
        then: (resolve: (v: unknown) => unknown) => resolve({ data: [row], error: null }) }
      return q
    },
    update: (value: unknown) => {
      writes.push(value)
      const q = { eq: (...args: unknown[]) => { filters.push(['eq', ...args]); return q }, is: (...args: unknown[]) => { filters.push(['is', ...args]); return q }, select: async () => ({ data: options.stale ? [] : [{ id: row.id }], error: options.writeError ? { message: 'PRIVATE_DB_ERROR' } : null }) }
      return q
    },
  }) }
  runInNewContext(await compiled, { testDb: db, testAuth: options.denied ? new Response('{}', { status: 401 }) : {},
    testLlm: () => { calls++; return { content: options.answer ?? '[{"i":0,"s":0.8}]' } },
    Deno: { serve: (fn: typeof handler) => { handler = fn } }, Response, Date, console })
  assert.ok(handler)
  const response = await handler(new Request('https://example.test', { method: 'POST', body: options.raw ?? JSON.stringify(options.body ?? {}) }))
  return { status: response.status, body: await response.json(), calls, writes, filters }
}

test('rescore counts only successful version-matched writes and keeps errors distinct from stale snapshots', async () => {
  const ok = await run()
  assert.equal(ok.status, 200); assert.equal(ok.body.scored, 1); assert.equal(ok.body.raised, 1)
  assert.deepEqual(ok.filters, [['eq', 'id', 'fixture-listing'], ['eq', 'updated_at', '2026-10-29T12:00:00Z'],
    ['eq', 'title', 'Fixture public product'], ['is', 'brand', null], ['is', 'category', null], ['is', 'subcategory', null],
    ['eq', 'description', 'Fixture'], ['eq', 'lgbti_relevance_score', 0.2], ['is', 'classified_at', null], ['eq', 'status', 'active'], ['eq', 'review_status', 'approved']])
  const stale = await run({ stale: true })
  assert.equal(stale.body.stale, 1); assert.equal(stale.body.scored, 0); assert.equal(stale.body.raised, 0)
  const failed = await run({ writeError: true })
  assert.equal(failed.status, 503); assert.equal(failed.body.success, false); assert.equal(failed.body.failed, 1)
  assert.equal(failed.body.scored, 0); assert.equal(failed.body.raised, 0)
  assert.doesNotMatch(JSON.stringify(failed.body), /PRIVATE_DB_ERROR/)
})

test('rescore previews never write and invalid requests/auth never invoke the paid provider', async () => {
  const preview = await run({ body: { dry_run: true } })
  assert.equal(preview.body.scored, 1); assert.equal(preview.writes.length, 0)
  for (const options of [{ body: { dry_run: 'false' } }, { body: { include_inactive: 'false' } }, { body: [] }, { raw: '{' }, { denied: true }]) {
    const r = await run(options)
    assert.ok([400, 401].includes(r.status)); assert.equal(r.calls, 0); assert.equal(r.writes.length, 0)
  }
  const malformed = await run({ answer: '[{"i":0,"s":"0.8"}]' })
  assert.equal(malformed.status, 503); assert.equal(malformed.writes.length, 0)
})
