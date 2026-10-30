import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { runInNewContext } from 'node:vm'

const compiled = build({ entryPoints: ['supabase/functions/pipeline-review-gate/index.ts'], bundle: true, write: false, format: 'iife', platform: 'node',
  plugins: [{ name: 'gate-boundaries', setup(b) {
    b.onLoad({ filter: /_shared\/supabase-client\.ts$/ }, () => ({ loader: 'js', contents: `
      export const getServiceClient=()=>globalThis.testDb;
      export const requireInternalOrAdmin=async()=>globalThis.testAuth;
      export const jsonResponse=(body,status)=>new Response(JSON.stringify(body),{status});
      export const errorResponse=(error,status)=>new Response(JSON.stringify({error}),{status});
      export const corsResponse=()=>new Response();
    ` }))
    b.onLoad({ filter: /_shared\/report-api-error\.ts$/ }, () => ({ loader: 'js', contents: 'export const withErrorReporting=(_name,fn)=>fn;' }))
    b.onLoad({ filter: /_shared\/jev-pipeline-shadow\.ts$/ }, () => ({ loader: 'js', contents: 'export const runPipelineShadow=(...args)=>globalThis.testShadow(...args);' }))
  } }],
}).then(r => r.outputFiles[0].text)

async function run(body: Record<string, unknown>, opts: { denied?: boolean; disabled?: boolean; shadowError?: boolean } = {}) {
  let handler: (req: Request) => Promise<Response> = async () => { throw new Error('No handler') }
  let writes = 0, shadows = 0
  const db = {
    async rpc(name: string) {
      if (name === 'reconcile_staging_gate_reviews') return { data: { reviews_reconciled: 0 }, error: null }
      assert.equal(name, 'pipeline_review_gate_candidates')
      return { data: [{ id: 'row-1', source_name: 'rss-news', entity_type: 'news_article', target_table: 'news_articles', review_status: 'auto', ai_confidence_score: 1, enriched_data: { quality_status: 'passed', auto_publish: true } }], error: null }
    },
    from(table: string) {
      if (table === 'source_reliability') return { select: () => ({ in: async () => ({ data: [], error: null }) }) }
      assert.equal(table, 'ingestion_staging')
      return { update: () => ({ eq: async () => { writes++; return { error: null } } }) }
    },
  }
  runInNewContext(await compiled, {
    Deno: { serve: (fn: typeof handler) => { handler = fn }, env: { get: (key: string) => key === 'JEV_PIPELINE_SHADOW' && opts.disabled ? 'false' : key === 'JEV_API_KEY' ? 'SERVER_KEY' : undefined } },
    testAuth: opts.denied ? new Response('{}', { status: 401 }) : {}, testDb: db,
    testShadow: async (received: unknown, ids: string[], key: string, account?: string) => {
      shadows++; assert.equal(received, db); assert.deepEqual(Array.from(ids), ['row-1']); assert.equal(key, 'SERVER_KEY')
      if (opts.shadowError) throw new Error('accounting unavailable')
      assert.equal(account, body.jev_shadow_only ? 'validation-2026-10-29' : undefined)
      return { mode: 'shadow', evaluated: 1, contradicted: 1, errors: 0, budget_deferred: 0 }
    },
    Response, Request, console,
  })
  const response = await handler(new Request('https://example.test', { method: 'POST', body: JSON.stringify(body) }))
  return { status: response.status, body: await response.json(), writes, shadows }
}
test('shadow judgments are observable and cannot alter existing approval behavior', async () => {
  const result = await run({})
  assert.equal(result.status, 200); assert.equal(result.body.approved, 1); assert.equal(result.writes, 1)
  assert.equal(result.shadows, 1); assert.equal(result.body.jev_shadow.contradicted, 1)
  const failed = await run({}, { shadowError: true })
  assert.equal(failed.status, 200); assert.equal(failed.body.approved, 1); assert.equal(failed.writes, 1)
  assert.equal(failed.body.jev_shadow.errors, 1)
})
test('authenticated shadow-only validation writes no source records and uses the fixed validation account', async () => {
  const result = await run({ jev_shadow_only: true, account: 'attacker-chosen-account' })
  assert.equal(result.status, 200); assert.equal(result.writes, 0); assert.equal(result.shadows, 1)
  assert.equal(result.body.source_writes, 0)
})
test('dry runs, unauthorized calls and the rollout switch never call shadow inference', async () => {
  const dry = await run({ dry_run: true })
  assert.equal(dry.status, 200); assert.equal(dry.writes, 0); assert.equal(dry.shadows, 0)
  const denied = await run({}, { denied: true })
  assert.equal(denied.status, 401); assert.equal(denied.writes, 0); assert.equal(denied.shadows, 0)
  const disabled = await run({}, { disabled: true })
  assert.equal(disabled.body.approved, 1); assert.equal(disabled.shadows, 0)
})
