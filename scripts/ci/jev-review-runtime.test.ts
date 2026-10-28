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

const context = { item: { queue_type: 'event-quality', title: 'Synthetic', risk: 'integrity' }, record: null, proposal: null, related: { venue_candidates: [{ website: 'https://example.org/source' }] }, research: null, candidates: [{ id: 'approve', action: 'approve', payload: {}, explanation: 'Synthetic' }], urls: [], input_hash: 'synthetic' }
function evaluation(conflicting = false) {
  const choice = (selected: string, options: string[]) => ({ type: 'choice', choice: selected, confidence: 0.999, probabilities: Object.fromEntries(options.map(x => [x, x === selected ? 1 : 0])) })
  return { model: 'jev-test', answers: {
    decision: choice('approve', ['approve', 'abstain']), support: choice(conflicting ? 'conflicting' : 'supported', ['supported', 'missing', 'conflicting']),
    support_approve: choice('supported', ['supported', 'missing', 'conflicting']), risk: choice('routine', ['routine', 'human', 'sensitive']),
    reason: choice(conflicting ? 'conflicting_identity' : 'verified', ['verified', 'missing_source', 'conflicting_identity', 'protected_review', 'insufficient_confidence', 'invalid_proposal']),
  } }
}
async function run(options: { status?: number; context?: unknown; noJobs?: boolean; conflicting?: boolean } = {}) {
  const jobs = options.noJobs ? [] : [1, 2].map(n => ({ case_id: `case-${n}`, lease_token: 'lease', queue_type: 'event-quality' }))
  const updates: Array<{ table: string; value: Record<string, unknown> }> = []
  const finished: Array<Record<string, unknown>> = []
  const fetched: string[] = [], env: string[] = []
  let handler: ((request: Request) => Promise<Response>) | undefined
  const db = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      let data: unknown
      if (name === 'claim_jev_review_jobs') data = jobs
      else if (name === 'get_jev_review_context') data = options.context ?? context
      else if (name === 'finish_jev_review_job') {
        finished.push(args)
        const result = args.p_result as { retry?: string; blocker?: string }
        data = { status: result.retry ? 'retry' : result.blocker ? 'blocked' : 'applied' }
      } else throw new Error(`Unexpected RPC ${name}`)
      return { error: null, data }
    },
    from: (table: string) => ({ update: (value: Record<string, unknown>) => {
      updates.push({ table, value })
      const chain = { eq: () => chain, then: (resolve: (value: unknown) => unknown) => resolve({ error: null }) }
      return chain
    } }),
  }
  runInNewContext(await compiled, {
    testDb: db, Deno: { env: { get: (key: string) => { env.push(key); assert.notEqual(key, 'FIRECRAWL_API_KEY'); return key === 'JEV_API_KEY' ? 'synthetic' : undefined } }, serve: (fn: typeof handler) => { handler = fn } },
    fetch: async (url: string | URL, init?: RequestInit) => {
      const target = String(url); fetched.push(target)
      if (target === 'https://example.org/source') return new Response('Publisher source with exact identity and venue address. '.repeat(10), { headers: { 'content-type': 'text/html' } })
      assert.equal(target, 'https://api.typesafe.ai/v1/systemone')
      const state = JSON.parse(String(init?.body)).state
      assert.equal(state.fetched_sources[0].url, 'https://example.org/source')
      return options.status ? new Response(null, { status: options.status }) : new Response(JSON.stringify(evaluation(options.conflicting)))
    },
    Response, URL, AbortSignal, TextDecoder, console,
  })
  assert.ok(handler)
  const response = await handler(new Request('https://example.test', { method: 'POST', body: JSON.stringify({ run_id: 123, dry_run: false, batch: 2 }) }))
  return { response, body: await response.json(), finished, updates, fetched, env }
}

for (const status of [402, 429, 503]) test(`Jev ${status} stops provider calls, retries leased jobs and records a failed run`, async () => {
  const { response, body, finished, updates, fetched } = await run({ status })
  assert.equal(response.status, 503); assert.equal(body.success, false)
  assert.equal(body.retry, 2); assert.equal(body.applied, 0); assert.equal(body.blocked, 0)
  assert.equal(fetched.filter(url => url.includes('typesafe.ai')).length, 1)
  assert.equal(fetched.filter(url => url.includes('example.org')).length, 1)
  assert.equal(finished.length, 2)
  for (const call of finished) assert.equal((call.p_result as { retry: string }).retry, `Jev HTTP ${status}`)
  assert.equal(updates.find(update => update.table === 'admin_automation_runs')?.value.status, 'error')
  assert.equal(updates.find(update => update.table === 'admin_automations')?.value.last_run_status, 'error')
})
test('known canonical source reaches the unchanged decision gates without Firecrawl configuration', async () => {
  const { body, finished, fetched } = await run()
  assert.equal(body.applied, 2); assert.equal(body.retry, 0)
  assert.equal(fetched.length, 4)
  for (const call of finished) { assert.equal((call.p_result as { blocker?: string | null }).blocker, null); assert.equal((call.p_evidence as unknown[]).length, 1) }
})
test('conflicting identity stays blocked despite a confident action and readable source', async () => {
  const { body } = await run({ conflicting: true })
  assert.equal(body.applied, 0); assert.equal(body.blocked, 2)
})
test('no source stays explicitly blocked with no outbound requests', async () => {
  const { body, fetched, finished } = await run({ context: { ...context, related: {} } })
  assert.equal(body.blocked, 2); assert.equal(body.retry, 0); assert.equal(fetched.length, 0)
  for (const call of finished) assert.equal((call.p_result as { blocker: string }).blocker, 'missing_source_url')
})
test('protected context never reaches a source or Jev', async () => {
  const { body, fetched } = await run({ context: { ...context, blocker: 'private_review_requires_human' } })
  assert.equal(body.blocked, 2); assert.equal(fetched.length, 0)
})
test('paused registry yielding no leases dispatches no network or decisions and never enables automation', async () => {
  const { body, fetched, finished, updates } = await run({ noJobs: true })
  assert.equal(body.examined, 0); assert.equal(fetched.length, 0); assert.equal(finished.length, 0)
  for (const update of updates) { assert.equal(update.value.enabled, undefined); assert.equal(update.value.consecutive_failures, undefined) }
})
