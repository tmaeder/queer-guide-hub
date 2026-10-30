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
      export const requireInternalOrAdmin = async () => globalThis.testAuth;
      export const corsResponse = () => new Response();
      export const jsonResponse = (body, status) => new Response(JSON.stringify(body), {status});
      export const errorResponse = (error, status) => new Response(JSON.stringify({error}), {status});
    `, loader: 'js' }))
  } }],
}).then(result => result.outputFiles[0].text)

const context = { item: { queue_type: 'event-quality', title: 'Synthetic', risk: 'integrity' }, record: null, proposal: null, related: { venue_candidates: [{ website: 'https://example.org/source' }] }, research: null, candidates: [{ id: 'approve', action: 'approve', payload: {}, explanation: 'Synthetic' }], urls: [], input_hash: 'synthetic' }
function evaluation(conflicting = false) {
  const choice = (selected: string, options: string[]) => ({ type: 'choice', choice: selected, confidence: 0.999, probabilities: Object.fromEntries(options.map(x => [x, x === selected ? 1 : 0])) })
  return { model: 'jev-1.14.0', usage: { input_tokens: 100, output_tokens: 50 }, answers: {
    decision: choice('approve', ['approve', 'abstain']), support: choice(conflicting ? 'conflicting' : 'supported', ['supported', 'missing', 'conflicting']),
    support_approve: choice('supported', ['supported', 'missing', 'conflicting']), risk: choice('routine', ['routine', 'human', 'sensitive']),
    reason: choice(conflicting ? 'conflicting_identity' : 'verified', ['verified', 'missing_source', 'conflicting_identity', 'protected_review', 'insufficient_confidence', 'invalid_proposal']),
  } }
}
async function run(options: { status?: number; context?: unknown; queue?: string; noJobs?: boolean; conflicting?: boolean; body?: unknown; rawBody?: string; denied?: boolean; sourceStatus?: number; sourceRedirect?: string; budgetDenied?: boolean; budgetUnavailable?: boolean; settlementUnavailable?: boolean } = {}) {
  const jobs = options.noJobs ? [] : [1, 2].map(n => ({ case_id: `case-${n}`, lease_token: 'lease', queue_type: options.queue ?? 'event-quality' }))
  const updates: Array<{ table: string; value: Record<string, unknown> }> = []
  const finished: Array<Record<string, unknown>> = []
  const fetched: string[] = [], env: string[] = [], rpcCalls: string[] = []
  const reservations: Array<Record<string, unknown>> = []
  let handler: ((request: Request) => Promise<Response>) | undefined
  const db = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push(name)
      let data: unknown
      if (name === 'claim_jev_review_jobs') data = jobs
      else if (name === 'reserve_jev_budget') {
        reservations.push(args)
        if (options.budgetUnavailable) return { data: null, error: { message: 'PRIVATE_DB_ERROR' } }
        data = !options.budgetDenied
      }
      else if (name === 'settle_jev_budget') {
        if (options.settlementUnavailable) return { data: null, error: { message: 'PRIVATE_DB_ERROR' } }
        data = true
      }
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
    testDb: db, testAuth: options.denied ? new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }) : {}, Deno: { env: { get: (key: string) => { env.push(key); assert.notEqual(key, 'FIRECRAWL_API_KEY'); return key === 'JEV_API_KEY' ? 'synthetic' : key === 'JEV_BUDGET_ACCOUNT' ? 'synthetic-account' : undefined } }, serve: (fn: typeof handler) => { handler = fn } },
    fetch: async (url: string | URL, init?: RequestInit) => {
      const target = String(url); fetched.push(target)
      if (new URL(target).hostname === 'example.org') {
        if (options.sourceRedirect) return new Response(null, { status: 302, headers: { location: options.sourceRedirect } })
        return new Response('PRIVATE_PAGE_TEXT Publisher source with exact identity and venue address. '.repeat(10), { status: options.sourceStatus ?? 200, headers: { 'content-type': 'text/html' } })
      }
      assert.equal(target, 'https://api.typesafe.ai/v1/systemone')
      const state = JSON.parse(String(init?.body)).state
      assert.equal(state.fetched_sources[0].url, 'https://example.org/source')
      return options.status ? new Response(null, { status: options.status }) : new Response(JSON.stringify(evaluation(options.conflicting)))
    },
    Response, URL, AbortSignal, TextDecoder, TextEncoder, crypto, console,
  })
  assert.ok(handler)
  const response = await handler(new Request('https://example.test', { method: 'POST', body: options.rawBody ?? JSON.stringify(options.body ?? { run_id: 123, dry_run: false, batch: 2 }) }))
  return { response, body: await response.json(), finished, updates, fetched, env, rpcCalls, reservations }
}

for (const status of [402, 429, 503]) test(`Jev ${status} stops provider calls, retries leased jobs and records a failed run`, async () => {
  const { response, body, finished, updates, fetched } = await run({ status })
  assert.equal(response.status, 503); assert.equal(body.success, false)
  assert.equal(body.retry, 2); assert.equal(body.applied, 0); assert.equal(body.blocked, 0)
  assert.equal(fetched.filter(url => url.includes('typesafe.ai')).length, 1)
  assert.equal(fetched.filter(url => new URL(url).hostname === 'example.org').length, 1)
  assert.equal(finished.length, 2)
  for (const call of finished) assert.equal((call.p_result as { retry: string }).retry, `Jev HTTP ${status}`)
  assert.equal(updates.find(update => update.table === 'admin_automation_runs')?.value.status, 'error')
  assert.equal(updates.find(update => update.table === 'admin_automations')?.value.last_run_status, 'error')
})
test('known canonical source reaches the unchanged decision gates with exact request/accounting provenance', async () => {
  const { body, finished, fetched, reservations } = await run()
  assert.equal(body.applied, 2); assert.equal(body.retry, 0)
  assert.equal(fetched.length, 4)
  for (const call of finished) { assert.equal((call.p_result as { blocker?: string | null }).blocker, null); assert.equal((call.p_evidence as unknown[]).length, 1) }
  finished.forEach((call, i) => {
    const result = call.p_result as Record<string, unknown>
    assert.equal(result.state_version, 'jev-review-public-state-v2')
    assert.equal(result.request_hash, reservations[i].p_request_hash)
  })
})
test('protected queues cannot fetch sources or call Jev even if their native context accidentally lacks a blocker', async () => {
  for (const queue of ['submissions', 'brand-ownership', 'personality-publication', 'moderation']) {
    const r = await run({ queue, context: { ...context, item: { ...context.item, queue_type: queue } } })
    assert.equal(r.body.blocked, 2); assert.equal(r.fetched.length, 0)
    assert.equal(r.reservations.length, 0)
  }
  const mismatch = await run({ context: { ...context, item: { queue_type: 'submissions', title: 'Private' } } })
  assert.equal(mismatch.fetched.length, 0); assert.equal(mismatch.reservations.length, 0)
})
test('missing or ambiguous action catalogs block before source fetching and paid inference', async () => {
  for (const candidates of [[], [context.candidates[0], context.candidates[0]]]) {
    const result = await run({ context: { ...context, candidates } })
    assert.equal(result.body.blocked, 2); assert.equal(result.fetched.length, 0); assert.equal(result.reservations.length, 0)
  }
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
test('budget exhaustion defers leased cases without a provider call, evidence blocker or auto-pause failure', async () => {
  const { response, body, finished, fetched, updates, rpcCalls } = await run({ budgetDenied: true })
  assert.equal(response.status, 200); assert.equal(body.success, true)
  assert.equal(body.budget_deferred, 2); assert.equal(body.retry, 2); assert.equal(body.blocked, 0); assert.equal(body.applied, 0)
  assert.equal(fetched.filter(url => url.includes('typesafe.ai')).length, 0)
  assert.equal(rpcCalls.filter(name => name === 'reserve_jev_budget').length, 1)
  for (const call of finished) assert.equal((call.p_result as { retry: string }).retry, 'Jev budget deferred')
  assert.equal(updates.find(update => update.table === 'admin_automation_runs')?.value.status, 'success')
})
test('accounting outage and settlement failure stop the batch without applying or leaking errors', async () => {
  for (const options of [{ budgetUnavailable: true }, { settlementUnavailable: true }]) {
    const { response, body, fetched } = await run(options)
    assert.equal(response.status, 503); assert.equal(body.applied, 0); assert.equal(body.retry, 2)
    assert.doesNotMatch(JSON.stringify(body), /PRIVATE_DB_ERROR/)
    assert.equal(fetched.filter(url => url.includes('typesafe.ai')).length, options.budgetUnavailable ? 0 : 1)
  }
})
test('previews use the fixed validation cap while production dispatches use the configured production account', async () => {
  const preview = await run({ body: { dry_run: true, batch: 2, budget_account: 'UNTRUSTED_ACCOUNT' } })
  assert.equal(preview.reservations.length, 2)
  for (const reservation of preview.reservations) assert.equal(reservation.p_account, 'validation-2026-10-29')
  const production = await run()
  for (const reservation of production.reservations) assert.equal(reservation.p_account, 'synthetic-account')
})

const probeBody = { source_probe: true, urls: ['https://example.org/source?ref=DO_NOT_ECHO'], run_id: 123, dry_run: false, probe: true }
function assertReadOnly(result: Awaited<ReturnType<typeof run>>) {
  assert.deepEqual(result.rpcCalls, []); assert.deepEqual(result.updates, []); assert.deepEqual(result.finished, [])
  assert.deepEqual(result.env, [])
  assert.ok(result.fetched.every(url => new URL(url).hostname === 'example.org'))
}
test('malformed or empty JSON cannot fall through to claiming jobs or recording a run', async () => {
  for (const rawBody of ['{', '', '{"source_probe":']) {
    const result = await run({ rawBody })
    assert.equal(result.response.status, 400)
    assert.equal(result.fetched.length, 0)
    assertReadOnly(result)
  }
})
test('authenticated source probe returns metadata only with no DB/model/key access, even when decision flags are supplied', async () => {
  const result = await run({ body: probeBody })
  assert.equal(result.response.status, 200); assert.equal(result.body.success, true)
  assert.equal(result.body.readable, 1); assert.equal(result.body.attempted, 1)
  assert.equal(result.body.sources[0].host, 'example.org'); assert.ok(result.body.sources[0].characters > 100)
  assert.deepEqual(Object.keys(result.body.sources[0]).sort(), ['characters', 'host', 'retrieved_at'])
  assert.doesNotMatch(JSON.stringify(result.body), /PRIVATE_PAGE_TEXT|DO_NOT_ECHO|token=|source_errors/)
  assertReadOnly(result)
})
test('source probe denies unauthenticated callers before network or DB operations', async () => {
  const result = await run({ body: probeBody, denied: true })
  assert.equal(result.response.status, 401); assert.equal(result.fetched.length, 0); assertReadOnly(result)
})
test('source probe refuses unbounded, malformed and unsafe inputs without network or DB operations', async () => {
  for (const urls of [undefined, [], Array(5).fill('https://example.org/source'), [123], ['x'.repeat(2049)], ['http://example.org'], ['https://localhost'], ['https://reader@example.org'], ['https://example.org:8443'], ['https://example.org/source?token=DO_NOT_ECHO']]) {
    const result = await run({ body: { source_probe: true, urls } })
    assert.equal(result.response.status, 400); assert.equal(result.fetched.length, 0); assertReadOnly(result)
  }
})
test('source probe caps successful pages and direct attempts through the same retrieval path', async () => {
  const result = await run({ body: { source_probe: true, urls: ['a','b','c','d'].map(x => `https://example.org/${x}`) } })
  assert.equal(result.body.readable, 2); assert.equal(result.body.attempted, 2); assert.equal(result.fetched.length, 2); assertReadOnly(result)
  const failed = await run({ body: { source_probe: true, urls: ['a','b','c','d'].map(x => `https://example.org/${x}`) }, sourceStatus: 403 })
  assert.equal(failed.body.readable, 0); assert.equal(failed.body.attempted, 4); assert.equal(failed.body.failed, 4); assertReadOnly(failed)
})
test('failed source probe rejects private redirects and omits page content and raw errors without state writes', async () => {
  const result = await run({ body: probeBody, sourceRedirect: 'http://169.254.169.254/SECRET_REDIRECT' })
  assert.equal(result.response.status, 200); assert.equal(result.body.success, false)
  assert.equal(result.body.failed, 1); assert.equal(result.fetched.length, 1)
  assert.doesNotMatch(JSON.stringify(result.body), /SECRET_REDIRECT|169.254|PRIVATE_PAGE_TEXT|Source|Unsupported/)
  assertReadOnly(result)
})
