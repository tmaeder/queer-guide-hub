/**
 * Pure unit tests for _shared/enrichment-driver.ts — the batch skeleton shared
 * by the pipeline-enrich-* functions. Uses a stub supabase client; no network,
 * no env vars.
 */
import { assertEquals } from 'jsr:@std/assert'
import {
  serveEnrichment,
  type EnrichmentDriverConfig,
  type StagingItem,
} from '../_shared/enrichment-driver.ts'

interface StubCalls {
  normalizedUpdates: Array<{ id: string; data: Record<string, unknown> }>
  rpcCalls: Array<Record<string, unknown>>
}

function makeStubClient(rows: StagingItem[]): { client: unknown; calls: StubCalls } {
  const calls: StubCalls = { normalizedUpdates: [], rpcCalls: [] }

  const client = {
    from(table: string) {
      if (table !== 'ingestion_staging') throw new Error(`unexpected table ${table}`)
      const builder = {
        select() {
          return builder
        },
        in() {
          return builder
        },
        eq(_col?: string, _v?: unknown) {
          return builder
        },
        not() {
          return builder
        },
        order() {
          return builder
        },
        limit() {
          // Query terminal — builder is awaited; make it thenable.
          return Promise.resolve({ data: rows, error: null })
        },
        update(payload: { normalized_data: Record<string, unknown> }) {
          return {
            eq(_col: string, id: string) {
              calls.normalizedUpdates.push({ id, data: payload.normalized_data })
              return Promise.resolve({ error: null })
            },
          }
        },
      }
      return builder
    },
    rpc(fn: string, args: Record<string, unknown>) {
      if (fn !== 'apply_enrichment') throw new Error(`unexpected rpc ${fn}`)
      calls.rpcCalls.push(args)
      return Promise.resolve({ error: null })
    },
  }
  return { client, calls }
}

function makeConfig(
  rows: StagingItem[],
  overrides: Partial<EnrichmentDriverConfig>
): { handler: (req: Request) => Promise<Response>; calls: StubCalls } {
  const { client, calls } = makeStubClient(rows)
  const handler = serveEnrichment({
    fnName: 'pipeline-enrich-test',
    targetTables: ['tests'],
    defaultBatchSize: 50,
    maxBatchSize: 200,
    enrichItem: async () => ({ succeeded: true, enrichedData: { x: 1 } }),
    ...overrides,
    _deps: {
      getClient: () => client,
      authorize: () => Promise.resolve(null),
    },
  })
  return { handler, calls }
}

function post(body: Record<string, unknown> = {}): Request {
  return new Request('http://localhost/fn', { method: 'POST', body: JSON.stringify(body) })
}

function row(id: string, normalized: Record<string, unknown> = { name: `n${id}` }): StagingItem {
  return { id, normalized_data: normalized, entity_type: 'test', target_table: 'tests' }
}

Deno.test('tallies success/skip and returns the executor envelope', async () => {
  const rows = [row('1'), row('2', {}), row('3')]
  const { handler } = makeConfig(rows, {
    enrichItem: async (_c, _i, n) =>
      n.name ? { succeeded: true, enrichedData: { ok: true } } : 'skip',
  })
  const res = await handler(post({}))
  const body = await res.json()
  assertEquals(body.success, true)
  assertEquals(body.items_total, 3)
  assertEquals(body.items_succeeded, 2)
  assertEquals(body.items_failed, 0)
  assertEquals(body.skipped, 1)
  assertEquals(body.items, 3) // enriched + skipped
  assertEquals(body.items_processed, 3)
})

Deno.test('hard-fails no-data-no-error outcomes (anti-starvation rule)', async () => {
  const { handler, calls } = makeConfig([row('1')], {
    enrichItem: async () => ({ succeeded: false, enrichedData: { empty: true } }),
  })
  const res = await handler(post({}))
  const body = await res.json()
  assertEquals(body.items_failed, 1)
  assertEquals(calls.rpcCalls.length, 1)
  assertEquals(calls.rpcCalls[0].p_status, 'failed')
  assertEquals(calls.rpcCalls[0].p_error_message, 'no_enrichment_data_produced')
})

Deno.test('writes normalized merge when provided and calls apply_enrichment', async () => {
  const { handler, calls } = makeConfig([row('1', { name: 'a', tags: [] })], {
    enrichItem: async (_c, _i, n) => ({
      succeeded: true,
      mergedNormalized: { ...n, description: 'd' },
      enrichedData: { ai: true },
    }),
  })
  await handler(post({}))
  assertEquals(calls.normalizedUpdates.length, 1)
  assertEquals(calls.normalizedUpdates[0].data.description, 'd')
  assertEquals(calls.rpcCalls[0].p_status, 'success')
  assertEquals(calls.rpcCalls[0].p_stage, 'enrich-test')
  assertEquals(calls.rpcCalls[0].p_actor, 'pipeline-enrich-test')
})

Deno.test('dry_run skips all writes and counts enriched', async () => {
  const { handler, calls } = makeConfig([row('1'), row('2')], {})
  const res = await handler(post({ dry_run: true }))
  const body = await res.json()
  assertEquals(body.dry_run, true)
  assertEquals(body.enriched, 2)
  assertEquals(calls.rpcCalls.length, 0)
  assertEquals(calls.normalizedUpdates.length, 0)
})

Deno.test('bounded pool processes every item (concurrency < batch)', async () => {
  const rows = Array.from({ length: 9 }, (_, i) => row(String(i)))
  let inFlight = 0
  let maxInFlight = 0
  const { handler } = makeConfig(rows, {
    enrichItem: async () => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((r) => setTimeout(r, 5))
      inFlight--
      return { succeeded: true, enrichedData: {} }
    },
  })
  const res = await handler(post({ concurrency: 3 }))
  const body = await res.json()
  assertEquals(body.items_succeeded, 9)
  assertEquals(maxInFlight <= 3, true)
})

Deno.test('wall-clock deadline stops between waves, leaving the rest pending', async () => {
  const rows = Array.from({ length: 6 }, (_, i) => row(String(i)))
  const { handler, calls } = makeConfig(rows, {
    wallClockMs: 20,
    enrichItem: async () => {
      await new Promise((r) => setTimeout(r, 30))
      return { succeeded: true, enrichedData: {} }
    },
  })
  const res = await handler(post({ concurrency: 2 }))
  const body = await res.json()
  // First wave (2 items) runs; deadline (20ms) has passed before wave 2.
  assertEquals(body.items_succeeded, 2)
  assertEquals(calls.rpcCalls.length, 2)
  assertEquals(body.items_total, 6)
})

Deno.test('empty batch returns the nothing-to-enrich shape', async () => {
  const { handler } = makeConfig([], {})
  const res = await handler(post({}))
  const body = await res.json()
  assertEquals(body, { success: true, items: 0, message: 'nothing to enrich' })
})
