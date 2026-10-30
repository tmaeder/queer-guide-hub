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
  b.onLoad({ filter: /_shared\/llm-budget\.ts$/ }, () => ({ loader: 'js', contents: 'export const consumeLlmBudget=async()=>({degraded:false,remaining:globalThis.testLegacyRemaining});' }))
} }] }).then(r => r.outputFiles[0].text)

async function run(result: unknown, options: { body?: Record<string, unknown>; raw?: string; stale?: boolean; writeError?: boolean; denied?: boolean; pilot?: boolean; disabled?: boolean; budgetDenied?: boolean; ledgerError?: boolean; settlementError?: boolean; legacyBudget?: number; providerStatus?: number; missingText?: boolean; spoofTrust?: boolean; rows?: number } = {}) {
  const writes: Record<string, unknown>[] = [], selections: Array<[string, unknown]> = []
  const budgets: Array<{ name: string; args: Record<string, unknown> }> = [], requests: Record<string, unknown>[] = []
  let calls = 0, handler: (req: Request) => Promise<Response> = async () => { throw new Error('No handler') }
  const item = { id: 'public-product', source_name: options.pilot ? 'ohmyfantasy' : options.spoofTrust ? 'untrusted-shop' : 'trusted-shop', entity_type: 'marketplace',
    raw_data: { title: 'Pronoun cards', description: options.missingText ? '' : 'Cards displaying pronouns for affirmation at an LGBTQ community event.', submitted_by: 'PRIVATE_USER', email: 'PRIVATE_CONTACT' },
    normalized_data: { name: 'Pronoun cards', sourceName: 'trusted-shop', description: 'GENERATED_UNVERIFIED_DESCRIPTION' }, updated_at: '2026-10-29T12:00:00Z' }
  const db = {
    from(table: string) {
      if (table === 'ingestion_events') return { select: () => ({ eq: () => ({ gte: async () => ({ count: 0 }) }) }) }
      throw new Error(`Source reads must use the protected candidate RPC: ${table}`)
    },
    async rpc(name: string, args: Record<string, unknown>) {
      if (name === 'marketplace_relevance_candidates') {
        selections.push(['candidate_params', args])
        return { data: Array.from({ length: options.rows ?? 1 }, (_, i) => ({ ...item, id: i ? `product-${i}` : item.id })), error: null }
      }
      if (name === 'reserve_jev_budget' || name === 'settle_jev_budget') {
        budgets.push({ name, args })
        assert.equal(args.p_account, options.body?.dry_run ? 'validation-2026-10-29' : 'production')
        return { data: name === 'reserve_jev_budget' ? !options.budgetDenied : true, error: name === 'reserve_jev_budget' && options.ledgerError || name === 'settle_jev_budget' && options.settlementError ? 'ledger unavailable' : null }
      }
      assert.equal(name, 'record_marketplace_relevance'); writes.push(args)
      return { data: !options.stale, error: options.writeError ? { message: 'write failed' } : null }
    },
  }
  runInNewContext(await compiled, {
    Deno: { serve: (fn: typeof handler) => { handler = fn }, env: { get: (key: string) => ({ CF_ACCOUNT_ID: 'account', CF_AI_API_TOKEN: 'SERVER_KEY', JEV_API_KEY: 'JEV_SERVER_KEY', JEV_MARKETPLACE_RELEVANCE: options.disabled ? 'false' : undefined })[key] } },
    testDb: db, testAuth: options.denied ? new Response('{}', { status: 401 }) : {}, testLegacyRemaining: options.legacyBudget ?? 800,
    fetch: async (url: string, init: RequestInit) => {
      calls++; requests.push(JSON.parse(String(init.body)))
      if (options.providerStatus) return new Response('PRIVATE_PROVIDER_ERROR', { status: options.providerStatus })
      return Response.json(url === 'https://api.typesafe.ai/v1/systemone' ? result : { result: { response: JSON.stringify(result) } })
    },
    setTimeout: (fn: () => void, ms: number) => ms === 200 ? (fn(), 0) : setTimeout(fn, ms), clearTimeout,
    Response, Request, AbortController, AbortSignal, TextEncoder, TextDecoder, crypto, console,
  })
  const response = await handler(new Request('https://example.test', { method: 'POST', body: options.raw ?? JSON.stringify(options.body ?? {}) }))
  return { status: response.status, body: await response.json(), calls, writes, selections, budgets, requests }
}
const answer = (positive: boolean, confidence = 0.99) => ({ queer_relevant: positive, confidence, reasoning: 'Product source assessment', suggested_tags: [], sensitivity_flags: [] })
test('actual worker rejects confident negatives and stores positive relevance probability', async () => {
  const r = await run(answer(false))
  assert.equal(r.status, 200); assert.equal(r.body.rejected, 1); assert.equal(r.body.approved, 0)
  assert.equal(r.body.items_succeeded, 1); assert.equal(r.body.items_failed, 0)
  assert.equal(r.writes[0].p_decision, 'reject')
  const classification = r.writes[0].p_classification as Record<string, unknown>
  assert.equal(classification.lgbti_relevant, false)
  assert.ok(Math.abs(Number(classification.lgbti_relevance_score) - 0.01) < 1e-8)
  assert.equal(r.writes[0].p_expected_updated_at, '2026-10-29T12:00:00Z')
  assert.equal((r.selections[0][1] as Record<string, unknown>).p_limit, 25)
})
test('positive, uncertain and high sensitivity have separate recorded outcomes', async () => {
  assert.equal((await run(answer(true))).writes[0].p_decision, 'approve')
  const uncertain = await run(answer(false, 0.2))
  assert.equal(uncertain.body.review, 1); assert.equal(uncertain.writes[0].p_decision, 'review')
  assert.equal((uncertain.writes[0].p_classification as Record<string, unknown>).lgbti_relevant, null)
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
  const spoofed = await run(answer(true), { body: { trust_sources: ['trusted-shop'] }, spoofTrust: true })
  assert.equal(spoofed.calls, 1); assert.equal(spoofed.writes[0].p_decision, 'approve'); assert.equal(spoofed.body.trusted, 0)
  assert.equal((await run(answer(true), { body: { dry_run: true } })).writes.length, 0)
  const bad = await run(answer(true), { body: { threshold: '0' } }); assert.equal(bad.status, 400); assert.equal(bad.calls, 0)
  const denied = await run(answer(true), { denied: true }); assert.equal(denied.status, 401); assert.equal(denied.calls, 0); assert.equal(denied.writes.length, 0)
})

const jevAnswer = (overrides: Record<string, number> = {}) => ({ model: 'jev-1.14.0', usage: { input_tokens: 100, output_tokens: 10 }, answers: Object.fromEntries(Object.entries({ pride_design: 0.99, queer_culture: 0.01, gender_affirming_function: 0.01, queer_positioned_intimacy: 0.01, brand_affiliation_claim: 0.01, explicit_adult: 0.01, medical_claim: 0.01, legal_claim: 0.01, ...overrides }).map(([key, noul]) => [key, { type: 'noul', noul }])) })
test('validated public pilot uses typed Jev and its monthly cap when the legacy provider cap is exhausted', async () => {
  const r = await run(jevAnswer(), { pilot: true, legacyBudget: 0 })
  assert.equal(r.status, 200); assert.equal(r.body.approved, 1); assert.equal(r.body.jev_used, 1); assert.equal(r.body.llm_used, 0)
  assert.equal(r.budgets.length, 2); assert.equal(r.requests[0].model, 'jev-1.14.0')
  assert.doesNotMatch(JSON.stringify(r.requests), /PRIVATE_|GENERATED_UNVERIFIED_DESCRIPTION|SERVER_KEY/)
  assert.match(JSON.stringify(r.requests[0].state), /affirmation at an LGBTQ/)
  assert.equal((r.writes[0].p_classification as Record<string, unknown>).classifier, 'jev-product-relevance-v1')
  assert.match(String((r.writes[0].p_classification as Record<string, unknown>).input_hash), /^[a-f0-9]{64}$/)
  assert.equal((r.writes[0].p_classification as Record<string, unknown>).source_updated_at, '2026-10-29T12:00:00Z')
  assert.equal((r.selections[0][1] as Record<string, unknown>).p_jev_only, true)
})
test('Jev uncertainty, medical claims and affiliation-only evidence stay null and cannot pass a later score gate', async () => {
  for (const overrides of [{ pride_design: 0.5 }, { medical_claim: 0.99 }, { pride_design: 0.01, brand_affiliation_claim: 0.99 }]) {
    const r = await run(jevAnswer(overrides), { pilot: true })
    assert.equal(r.body.review, 1); assert.equal(r.writes[0].p_decision, 'review')
    assert.equal((r.writes[0].p_classification as Record<string, unknown>).lgbti_relevant, null)
  }
  const negative = await run(jevAnswer({ pride_design: 0.01 }), { pilot: true })
  assert.equal(negative.body.rejected, 1); assert.equal((negative.writes[0].p_classification as Record<string, unknown>).lgbti_relevant, false)
})
test('Jev failure, accounting outage and exhausted budgets never fall through to the legacy provider', async () => {
  const denied = await run(jevAnswer(), { pilot: true, budgetDenied: true })
  assert.equal(denied.status, 200); assert.equal(denied.body.jev_budget_deferred, 1); assert.equal(denied.calls, 0); assert.equal(denied.writes.length, 0)
  assert.equal(denied.body.jev_used, 0); assert.equal(denied.body.jev_attempts, 1)
  for (const options of [{ ledgerError: true }, { settlementError: true }, { providerStatus: 503 }]) {
    const r = await run(jevAnswer(), { pilot: true, ...options })
    assert.equal(r.status, 503); assert.equal(r.writes.length, 0); assert.equal(r.body.llm_used, 0); assert.ok(r.calls <= 1)
    assert.doesNotMatch(JSON.stringify(r.body), /PRIVATE_PROVIDER_ERROR|ledger unavailable|SERVER_KEY/)
  }
})
test('malformed JSON and invalid operator configuration cannot start paid inference or writes', async () => {
  for (const raw of ['{bad', 'null', '[]']) {
    const r = await run(jevAnswer(), { pilot: true, raw })
    assert.equal(r.status, 400); assert.equal(r.calls, 0); assert.equal(r.writes.length, 0)
  }
  for (const body of [{ dry_run: 'false' }, { trust_sources: 'trusted-shop' }, { source_names: [null] }, { aggregator_sources: {} }, { daily_cap: -1 }]) {
    const r = await run(jevAnswer(), { pilot: true, body })
    assert.equal(r.status, 400); assert.equal(r.calls, 0); assert.equal(r.budgets.length, 0); assert.equal(r.writes.length, 0)
  }
})
test('pilot dry runs spend only validation, missing original text defers, and production calls stop at four', async () => {
  const dry = await run(jevAnswer(), { pilot: true, body: { dry_run: true, account: 'unapproved' } })
  assert.equal(dry.writes.length, 0); assert.equal(dry.body.jev_previews.length, 1)
  const missing = await run(jevAnswer(), { pilot: true, missingText: true })
  assert.equal(missing.calls, 0); assert.equal(missing.writes.length, 0); assert.equal(missing.body.evidence_deferred, 1)
  const batch = await run(jevAnswer(), { pilot: true, rows: 16 })
  assert.equal(batch.calls, 4); assert.equal(batch.writes.length, 4); assert.equal(batch.body.jev_used, 4)
  const disabled = await run(jevAnswer(), { pilot: true, disabled: true, legacyBudget: 0 })
  assert.equal(disabled.calls, 0); assert.equal(disabled.body.message, 'daily_cap_reached')
})
