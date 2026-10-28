import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { runInNewContext } from 'node:vm'

// Exercise the real request handler with only the database/auth and network boundaries replaced.
const compiled = build({
  entryPoints: ['supabase/functions/review-automation/index.ts'], bundle: true, write: false, format: 'iife', platform: 'node',
  plugins: [{ name: 'synthetic-service-boundary', setup(builder) {
    builder.onLoad({ filter: /_shared\/supabase-client\.ts$/ }, () => ({ contents: `
      export const getServiceClient = () => globalThis.testDb;
      export const requireInternalOrAdmin = async () => ({});
      export const corsResponse = () => new Response();
      export const jsonResponse = (body, status) => new Response(JSON.stringify(body), {status});
      export const errorResponse = (error, status) => new Response(JSON.stringify({error}), {status});
    `, loader: 'js' }))
  } }],
}).then(result => result.outputFiles[0].text)

for (const status of [402, 429, 503]) test(`Firecrawl ${status} stops provider calls, retries leased jobs and records a failed run`, async () => {
  const jobs = [1, 2].map(n => ({ case_id: `case-${n}`, lease_token: 'lease', queue_type: 'event-quality' }))
  const updates: Array<{ table: string; value: Record<string, unknown> }> = []
  const finished: Array<Record<string, unknown>> = []
  let providerCalls = 0
  let handler: ((request: Request) => Promise<Response>) | undefined
  const db = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      let data: unknown
      if (name === 'claim_jev_review_jobs') data = jobs
      else if (name === 'get_jev_review_context') data = { item: { queue_type: 'event-quality', title: 'Synthetic', risk: 'integrity' }, record: null, proposal: null, related: {}, research: null, candidates: [{ id: 'approve', action: 'approve', payload: {}, explanation: 'Synthetic' }], urls: [], input_hash: 'synthetic' }
      else if (name === 'finish_jev_review_job') { finished.push(args); data = { status: 'retry' } }
      else throw new Error(`Unexpected RPC ${name}`)
      return { error: null, data }
    },
    from: (table: string) => ({ update: (value: Record<string, unknown>) => {
      updates.push({ table, value })
      const chain = { eq: () => chain, then: (resolve: (value: unknown) => unknown) => resolve({ error: null }) }
      return chain
    } }),
  }
  runInNewContext(await compiled, {
    testDb: db, Deno: { env: { get: () => 'synthetic' }, serve: (fn: typeof handler) => { handler = fn } },
    fetch: async (url: string) => { assert.equal(url, 'https://api.firecrawl.dev/v2/search'); providerCalls++; return new Response(null, { status }) },
    Response, URL, AbortSignal, TextDecoder, console,
  })
  assert.ok(handler)
  const response = await handler(new Request('https://example.test', { method: 'POST', body: JSON.stringify({ run_id: 123, dry_run: false, batch: 2 }) }))
  const body = await response.json()
  assert.equal(response.status, 503)
  assert.equal(body.success, false)
  assert.equal(body.retry, 2)
  assert.equal(body.applied, 0)
  assert.equal(body.blocked, 0)
  assert.equal(providerCalls, 1)
  assert.equal(finished.length, 2)
  for (const call of finished) assert.equal((call.p_result as { retry: string }).retry, `Source recovery HTTP ${status}`)
  assert.equal(updates.find(update => update.table === 'admin_automation_runs')?.value.status, 'error')
  assert.equal(updates.find(update => update.table === 'admin_automations')?.value.last_run_status, 'error')
})
