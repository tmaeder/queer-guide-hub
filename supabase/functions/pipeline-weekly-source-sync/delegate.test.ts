import { assertEquals, assert } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'
import { delegateToSourcePipeline } from './delegate.ts'
import type { SourceJob } from './contracts.ts'
const parent = '11111111-1111-4111-8111-111111111111'
const child = '22222222-2222-4222-8222-222222222222'
const job: SourceJob = { id: child, run_id: parent, registry: 'ingestion_sources', source_id: child, source_name: 'Import', source_slug: 'outxout', attempts: 1 }
const transport = { url: 'https://project.example', serviceKey: 'private' }
const noFetch = (() => { throw Error('unexpected network') }) as typeof fetch
function fake(tables: Record<string, unknown[]>, rpcData: unknown = child) {
  const calls: string[] = []
  const db = { from(table: string) {
    const value = tables[table]?.shift()
    const response = { data: value, error: null, count: 12 }
    const chain: Record<string, unknown> = { then(resolve: (v: unknown) => void) { return Promise.resolve(response).then(resolve) } }
    for (const method of ['select','eq','in','is','gte','order','limit']) chain[method] = () => chain
    chain.maybeSingle = () => Promise.resolve(response)
    return chain
  }, rpc(name: string) { calls.push(name); return Promise.resolve({ data: rpcData, error: null }) } } as unknown as SupabaseClient
  return { db, calls }
}
Deno.test('GayOut exhausted credits are blocked with a funded-account requirement', async () => {
  const { db } = fake({ pipeline_runs: [{ id: child, pipeline_name: 'gayout-weekly-sync', status: 'failed', error_message: 'Node source-places failed: E_GAYOUT_PROVIDER_QUOTA: no credits' }] })
  const outcome = await delegateToSourcePipeline(db, { ...job, child_run_id: child, child_pipeline: 'gayout-weekly-sync' }, {}, 'source-gayout', {}, transport, [], noFetch)
  assertEquals(outcome?.outcome, 'blocked')
  assertEquals(outcome?.required_settings, ['FIRECRAWL_API_KEY'])
  assertEquals(outcome?.retryable, false)
})
Deno.test('GayOut internal extraction configuration errors name the required settings', async () => {
  const { db } = fake({ pipeline_runs: [{ id: child, pipeline_name: 'gayout-weekly-sync', status: 'failed', error_message: 'E_GAYOUT_EXTRACT_AUTH: rejected secret' }] })
  const outcome = await delegateToSourcePipeline(db, { ...job, child_run_id: child, child_pipeline: 'gayout-weekly-sync' }, {}, 'source-gayout', {}, transport, [], noFetch)
  assertEquals(outcome?.outcome, 'blocked')
  assertEquals(outcome?.required_settings, ['EXTRACT_WORKER_URL', 'EXTRACT_WORKER_SECRET'])
})
Deno.test('active child remains waiting, independently of parent import attempts', async () => {
  const { db } = fake({ pipeline_runs: [{ id: child, pipeline_name: 'outxout-catalogue-sync', status: 'running' }] })
  const outcome = await delegateToSourcePipeline(db, { ...job, child_run_id: child, child_pipeline: 'outxout-catalogue-sync' }, {}, 'source-outxout', {}, transport, [], noFetch)
  assertEquals(outcome?.waiting, true)
  assertEquals(outcome?.staged, 0)
})
Deno.test('completed child verifies its identity and staging totals', async () => {
  const { db } = fake({ pipeline_runs: [{ id: child, pipeline_name: 'outxout-catalogue-sync', status: 'completed', items_failed: 0 }], ingestion_staging: [null] })
  const outcome = await delegateToSourcePipeline(db, { ...job, child_run_id: child, child_pipeline: 'outxout-catalogue-sync' }, {}, 'source-outxout', {}, transport, [], noFetch)
  assertEquals(outcome?.outcome, 'succeeded')
  assertEquals(outcome?.waiting, undefined)
  assertEquals(outcome?.staged, 12)
})
Deno.test('an unrelated or failed child cannot make its parent source green', async () => {
  for (const row of [{ id: child, pipeline_name: 'other', status: 'completed' }, { id: child, pipeline_name: 'outxout-catalogue-sync', status: 'failed', error_message: 'HTTP failure' }]) {
    const { db } = fake({ pipeline_runs: [row] })
    assertEquals((await delegateToSourcePipeline(db, { ...job, child_run_id: child, child_pipeline: 'outxout-catalogue-sync' }, {}, 'source-outxout', {}, transport, [], noFetch))?.outcome, 'failed')
  }
})
Deno.test('durable importer uses its own transactional starter, never a generic one-batch graph', async () => {
  const { db, calls } = fake({ pipeline_definitions: [[{ id: child, name: 'outxout-catalogue-sync', is_enabled: true, nodes: [{ type: 'source-outxout' }] }]], pipeline_runs: [null, null] })
  const outcome = await delegateToSourcePipeline(db, job, { slug: 'outxout' }, 'source-outxout', {}, transport, [], noFetch)
  assertEquals(calls, ['outxout_open_run'])
  assertEquals(outcome?.child_run_id, child)
  assertEquals(outcome?.waiting, true)
})
Deno.test('disabled and recently successful source pipelines are not started again', async () => {
  for (const enabled of [false, true]) {
    const { db, calls } = fake({ pipeline_definitions: [[{ id: child, name: 'outxout-catalogue-sync', is_enabled: enabled, nodes: [{ type: 'source-outxout' }] }]], pipeline_runs: [null, { id: child }] })
    const outcome = await delegateToSourcePipeline(db, job, { slug: 'outxout' }, 'source-outxout', {}, transport, [], noFetch)
    assertEquals(outcome?.outcome, 'skipped')
    assertEquals(calls.length, 0)
    assert(outcome?.reason)
  }
})

Deno.test('completed dry runs and canaries cannot count as fresh source imports', async () => {
  for (const context of [{ dry_run: true }, { scope: 'canary' }, { lavenderatlas_cities: ['berlin'] }]) {
    const { db, calls } = fake({ pipeline_definitions: [[{ id: child, name: 'outxout-catalogue-sync', is_enabled: true, nodes: [{ type: 'source-outxout' }] }]], pipeline_runs: [null, { id: child, context }] })
    const outcome = await delegateToSourcePipeline(db, job, { slug: 'outxout' }, 'source-outxout', {}, transport, [], noFetch)
    assertEquals(calls, ['outxout_open_run'])
    assertEquals(outcome?.waiting, true)
  }
})
Deno.test('active previews defer a real import without adopting their results', async () => {
  const { db, calls } = fake({ pipeline_definitions: [[{ id: child, name: 'outxout-catalogue-sync', is_enabled: true, nodes: [{ type: 'source-outxout' }] }]], pipeline_runs: [{ id: child, status: 'running', context: { dry_run: true } }] })
  const outcome = await delegateToSourcePipeline(db, job, { slug: 'outxout' }, 'source-outxout', {}, transport, [], noFetch)
  assertEquals(outcome?.outcome, 'failed')
  assertEquals(outcome?.retryable, true)
  assertEquals(outcome?.child_run_id, undefined)
  assertEquals(calls.length, 0)
})
Deno.test('an adopted preview cannot become a verified successful import', async () => {
  const { db } = fake({ pipeline_runs: [{ id: child, pipeline_name: 'outxout-catalogue-sync', status: 'completed', items_failed: 0, context: { scope: 'canary' } }] })
  const outcome = await delegateToSourcePipeline(db, { ...job, child_run_id: child, child_pipeline: 'outxout-catalogue-sync' }, {}, 'source-outxout', {}, transport, [], noFetch)
  assertEquals(outcome?.outcome, 'failed')
  assertEquals(outcome?.staged, 0)
})

Deno.test('paused previews remain off for both new and adopted source jobs', async () => {
  const { db } = fake({ pipeline_definitions: [[{ id: child, name: 'outxout-catalogue-sync', is_enabled: true, nodes: [{ type: 'source-outxout' }] }]], pipeline_runs: [{ id: child, status: 'paused', context: { dry_run: true } }] })
  assertEquals((await delegateToSourcePipeline(db, job, { slug: 'outxout' }, 'source-outxout', {}, transport, [], noFetch))?.outcome, 'skipped')
  const adopted = fake({ pipeline_runs: [{ id: child, pipeline_name: 'outxout-catalogue-sync', status: 'paused', context: { dry_run: true } }] })
  assertEquals((await delegateToSourcePipeline(adopted.db, { ...job, child_run_id: child, child_pipeline: 'outxout-catalogue-sync' }, {}, 'source-outxout', {}, transport, [], noFetch))?.outcome, 'skipped')
})
