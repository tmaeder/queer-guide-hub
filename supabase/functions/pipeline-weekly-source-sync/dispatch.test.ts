import { assertEquals, assert } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'
import { dispatchSource } from './dispatch.ts'
import type { SourceJob } from './contracts.ts'

const job: SourceJob = {
  id: '11111111-1111-4111-8111-111111111111', run_id: '22222222-2222-4222-8222-222222222222',
  registry: 'news_sources', source_id: '33333333-3333-4333-8333-333333333333', source_name: 'Feed', source_slug: null, attempts: 1,
}
const settings = { url: 'https://project.example', serviceKey: 'service-private', internalSecret: 'internal-private', getEnv: () => undefined }
function client(source: Record<string, unknown>, state: Record<string, unknown> = {}) {
  return { from: (table: string) => table === 'pipeline_definitions'
    ? { select: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) }
    : ({ select: () => ({ eq: () => ({
    maybeSingle: () => Promise.resolve({ data: source, error: null }),
    single: () => Promise.resolve({ data: state, error: null }),
  }) }) }) } as unknown as SupabaseClient
}

Deno.test('disabled, paused and backing-off sources never perform network requests', async () => {
  const fetcher = (() => { throw Error('must not fetch') }) as typeof fetch
  for (const source of [{ is_active: false }, { is_active: true, auto_paused: true },
    { is_active: true, backoff_until: new Date(Date.now() + 60_000).toISOString() }])
    assertEquals((await dispatchSource(client(source), job, {}, settings, fetcher)).outcome, 'skipped')
})

Deno.test('a feed request selects exactly the claimed identity with protected run context', async () => {
  const outcome = await dispatchSource(client({ is_active: true, config: { pipeline_run_id: 'wrong', dry_run: false } }), job,
    { dry_run: true, batch_size: 50 }, settings, ((_url, init) => {
      const body = JSON.parse(String((init as { body?: unknown })?.body))
      assertEquals(body.source_ids, [job.source_id])
      assertEquals(body.max_feeds_per_run, 1)
      assertEquals(body.sinceHours, 168)
      assertEquals(body.pipeline_run_id, job.run_id)
      assertEquals(body.node_id, job.id)
      assertEquals(body.dry_run, true)
      return Promise.resolve(Response.json({ success: true, items_total: 3, items: 2, items_skipped: 1 }))
    }) as typeof fetch)
  assertEquals([outcome.outcome, outcome.fetched, outcome.staged], ['succeeded', 3, 0])
})

Deno.test('a per-feed transport error recorded behind aggregate HTTP 200 is a failed job', async () => {
  const outcome = await dispatchSource(client({ is_active: true }, { last_error: 'HTTP 503 from https://feed.example/?token=private' }), job,
    {}, settings, (() => Promise.resolve(Response.json({ success: true, items: 0 }))) as typeof fetch)
  assertEquals(outcome.outcome, 'failed')
  assertEquals(outcome.retryable, true)
  assert(!outcome.reason?.includes('private'))
})

Deno.test('missing named credentials are reported without invoking an adapter', async () => {
  const apiJob = { ...job, registry: 'ingestion_sources' as const }
  const outcome = await dispatchSource(client({ is_enabled: true, slug: 'tomtom', edge_function: 'source-tomtom', requires_api_key: 'TOMTOM_API_KEY' }),
    apiJob, {}, settings, (() => { throw Error('must not fetch') }) as typeof fetch)
  assertEquals(outcome.outcome, 'blocked')
  assertEquals(outcome.required_settings, ['TOMTOM_API_KEY'])
})

Deno.test('legacy credential metadata cannot disable the existing free Foursquare adapter', async () => {
  const outcome = await dispatchSource(client({ is_enabled: true, slug: 'foursquare-os', edge_function: 'source-foursquare', requires_api_key: 'FOURSQUARE_API_KEY' }),
    { ...job, registry: 'ingestion_sources' }, {}, settings, ((url) => {
      assertEquals(String(url), 'https://project.example/functions/v1/source-foursquare-free')
      return Promise.resolve(Response.json({ success: true, items: 0, items_total: 8, items_skipped: 8 }))
    }) as typeof fetch)
  assertEquals(outcome.outcome, 'succeeded')
  assertEquals(outcome.staged, 0)
})

Deno.test('interactive enrichment registrations are explicitly blocked as scheduled imports', async () => {
  const outcome = await dispatchSource(client({ is_enabled: true, slug: 'wikipedia', edge_function: 'get-wikipedia-info' }),
    { ...job, registry: 'ingestion_sources' }, {}, settings, (() => { throw Error('must not fetch') }) as typeof fetch)
  assertEquals(outcome.outcome, 'blocked')
  assertEquals(outcome.required_settings, ['ingestion_sources.edge_function'])
})

Deno.test('feed aborts retry but permanent failures do not', async () => {
  for (const [message, retryable] of [['The signal has been aborted', true], ['HTTP 404 Not Found', false]] as const) {
    const outcome = await dispatchSource(client({ is_active: true }, { last_error: message }), job,
      {}, settings, (() => Promise.resolve(Response.json({ success: true, items: 0 }))) as typeof fetch)
    assertEquals(outcome.outcome, 'failed')
    assertEquals(outcome.retryable, retryable)
  }
})

Deno.test('Awin owns its alternative credentials despite legacy registry metadata', async () => {
  const outcome = await dispatchSource(client({ is_enabled: true, slug: 'awin', edge_function: 'source-awin', requires_api_key: 'AWIN_API_TOKEN' }),
    { ...job, registry: 'ingestion_sources' }, {}, settings, (() => Promise.resolve(Response.json({ success: true, skipped: true, reason: 'missing_credentials', missing_credentials: ['AWIN_DATAFEED_API_KEY'] }))) as typeof fetch)
  assertEquals(outcome.outcome, 'blocked')
  assertEquals(outcome.required_settings, ['AWIN_DATAFEED_API_KEY'])
})
