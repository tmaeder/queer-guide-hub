import test from 'node:test'
import assert from 'node:assert/strict'
import { buildPipelineRequest, pipelineJudgment, projectPipelineEvidence } from './jev-pipeline-judgments.ts'
import { runPipelineShadow } from './jev-pipeline-shadow.ts'
import type { JevResponse } from './jev-client.ts'

const row = { id: 'public-staging', entity_type: 'news_article', source_name: 'rss-news',
  raw_data: { title: 'Pride festival', content: 'The Pride festival takes place in Bern on Saturday.', author: 'PRIVATE_AUTHOR', submitted_by: 'PRIVATE_USER' },
  normalized_data: { title: 'Pride festival', description: 'A Pride festival in Bern on Saturday.', contacts: 'PRIVATE_CONTACT' },
  enriched_data: { ai_summary: 'Bern hosts a Pride festival on Saturday.', submitted_by: 'PRIVATE_USER' },
}
const answer = (same: number, faithful: number, contradicted: number): JevResponse => ({ model: 'jev-1.14.0', usage: { input_tokens: 100, output_tokens: 10 },
  answers: Object.fromEntries(Object.entries({ same_subject: same, faithful, contradicted, explicit_lgbtq_context: 1 }).map(([key, noul]) => [key, { type: 'noul', noul }])) })

test('public adapter projection separates original and generated text and excludes metadata', () => {
  const projected = projectPipelineEvidence(row).evidence!
  assert.equal(projected.original.text, row.raw_data.content)
  assert.equal(projected.candidate.summary, row.enriched_data.ai_summary)
  assert.doesNotMatch(JSON.stringify(buildPipelineRequest(projected)), /PRIVATE_|submitted_by|contacts|author/)
  for (const source_name of ['community-submissions', 'private-feedback', '__proto__']) assert.equal(projectPipelineEvidence({ ...row, source_name }).evidence, null)
  for (const entity_type of ['personality', 'submissions']) assert.equal(projectPipelineEvidence({ ...row, entity_type }).evidence, null)
})
test('missing and oversized original text cannot be replaced by generated text or silently truncated', () => {
  for (const raw_data of [{ title: 'Name' }, { title: 'Name', content: 'short' }, { title: 'Name', content: 'x'.repeat(12001) }]) assert.equal(projectPipelineEvidence({ ...row, raw_data }).evidence, null)
  assert.equal(projectPipelineEvidence({ ...row, normalized_data: {}, enriched_data: {} }).reason, 'missing_candidate')
  assert.equal(projectPipelineEvidence({ ...row, normalized_data: { description: { text: 'nested value' } } }).evidence, null)
  assert.equal(projectPipelineEvidence({ ...row, enriched_data: { ai_summary: 'x'.repeat(4001) } }).evidence, null)
})
test('shadow truth table keeps missing, contradictory and ambiguous support distinct', () => {
  assert.equal(pipelineJudgment(answer(1, 1, 0)), 'supported')
  assert.equal(pipelineJudgment(answer(1, 0, 1)), 'contradicted')
  for (const r of [answer(0, 1, 0), answer(1, 0, 0), answer(1, 1, 1), answer(0.69, 1, 0), answer(1, 0.5, 0.5)]) assert.equal(pipelineJudgment(r), 'uncertain')
  const malformed = answer(1, 1, 0); malformed.answers.faithful = { type: 'noul', noul: NaN }
  assert.throws(() => pipelineJudgment(malformed))
})

test('shadow uses a bounded leased snapshot, global budget and never writes a source row', async t => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = []
  let cached = false, denied = false
  const db = {
    from(table: string) {
      assert.equal(table, 'ingestion_staging')
      return { select() { return { async in(_column: string, ids: string[]) { assert.ok(ids.length <= 16); return { data: [row], error: null } } } } }
    },
    async rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args })
      if (name === 'claim_jev_pipeline_check') return { data: !cached, error: null }
      if (name === 'reserve_jev_budget') { assert.equal(args.p_account, 'production'); return { data: !denied, error: null } }
      if (name === 'settle_jev_budget' || name === 'finish_jev_pipeline_check') return { data: true, error: null }
      throw new Error(`Unexpected RPC ${name}`)
    },
  }
  let requests = 0
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    requests++; assert.doesNotMatch(String(init.body), /PRIVATE_/); return Response.json(answer(1, 1, 0))
  })
  const result = await runPipelineShadow(db, Array.from({ length: 200 }, (_, i) => String(i)), 'server-key')
  assert.equal(result.evaluated, 1); assert.equal(result.supported, 1)
  assert.deepEqual(calls.map(c => c.name), ['claim_jev_pipeline_check', 'reserve_jev_budget', 'settle_jev_budget', 'finish_jev_pipeline_check'])
  assert.equal(calls[0].args.p_lease_token, calls[3].args.p_lease_token)
  assert.equal(calls[3].args.p_verdict, 'supported')
  assert.doesNotMatch(JSON.stringify(calls), /Pride festival|PRIVATE_|server-key/)
  cached = true
  assert.equal((await runPipelineShadow(db, [row.id], 'server-key')).cached_or_leased, 1)
  assert.equal(requests, 1)
  cached = false; denied = true
  assert.equal((await runPipelineShadow(db, [row.id], 'server-key')).budget_deferred, 1)
  assert.equal(requests, 1); assert.equal(calls.at(-1)?.args.p_verdict, 'budget_deferred')
})

test('accounting errors and provider errors remain operational failures, never factual answers', async t => {
  let phase = 'reserve', fullCharge: unknown
  const db = {
    from: () => ({ select: () => ({ in: async () => ({ data: [row], error: null }) }) }),
    async rpc(name: string, args: Record<string, unknown>) {
      if (name === 'reserve_jev_budget' && phase === 'reserve') return { data: null, error: 'unavailable' }
      if (name === 'settle_jev_budget') fullCharge = args.p_input_tokens
      return { data: true, error: null }
    },
  }
  let http = 0
  t.mock.method(globalThis, 'fetch', async () => { http++; return new Response('secret-provider-error', { status: 503 }) })
  const unavailable = await runPipelineShadow(db, [row.id], 'server-key')
  assert.equal(unavailable.errors, 1); assert.equal(unavailable.evaluated, 0); assert.equal(http, 0)
  phase = 'provider'
  const failed = await runPipelineShadow(db, [row.id], 'server-key')
  assert.equal(failed.errors, 1); assert.equal(failed.evaluated, 0); assert.equal(http, 1); assert.equal(fullCharge, null)
})

test('excluded and cached rows do not consume the four-call sample budget', async t => {
  const rows = Array.from({ length: 9 }, (_, i) => ({ ...row, id: String(i), source_name: i === 0 ? 'community-submissions' : row.source_name }))
  const db = {
    from: () => ({ select: () => ({ in: async () => ({ data: rows, error: null }) }) }),
    async rpc(name: string, args: Record<string, unknown>) {
      return { data: !(name === 'claim_jev_pipeline_check' && args.p_staging_id === '1'), error: null }
    },
  }
  let calls = 0
  t.mock.method(globalThis, 'fetch', async () => { calls++; return Response.json(answer(1, 1, 0)) })
  const result = await runPipelineShadow(db, rows.map(r => r.id), 'server-key')
  assert.equal(result.excluded, 1); assert.equal(result.cached_or_leased, 1)
  assert.equal(result.evaluated, 4); assert.equal(calls, 4)
})
