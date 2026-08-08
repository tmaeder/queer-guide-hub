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

type Client = Parameters<EnrichmentDriverConfig['enrichItem']>[0]

interface StubCalls {
  normalizedUpdates: Array<{ id: string; data: Record<string, unknown> }>
  rpcCalls: Array<Record<string, unknown>>
  /** Every [op, column, value] filter applied to the staging SELECT. */
  filters: Array<[string, string, unknown]>
  budgetCalls: Array<Record<string, unknown>>
}

/** llm_budget_consume stub result; 'error' simulates the RPC being absent. */
type BudgetStub = Record<string, unknown> | 'error'

function makeStubClient(
  rows: StagingItem[],
  budget: BudgetStub = { allowed: true, remaining: 999 }
): { client: Client; calls: StubCalls } {
  const calls: StubCalls = { normalizedUpdates: [], rpcCalls: [], filters: [], budgetCalls: [] }

  const client = {
    from(table: string) {
      if (table !== 'ingestion_staging') throw new Error(`unexpected table ${table}`)
      const builder = {
        select() {
          return builder
        },
        in(col: string, vals: unknown) {
          calls.filters.push(['in', col, vals])
          return builder
        },
        eq(col: string, v: unknown) {
          calls.filters.push(['eq', col, v])
          return builder
        },
        neq(col: string, v: unknown) {
          calls.filters.push(['neq', col, v])
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
      if (fn === 'llm_budget_consume') {
        calls.budgetCalls.push(args)
        return budget === 'error'
          ? Promise.resolve({ data: null, error: { message: 'function not found' } })
          : Promise.resolve({ data: budget, error: null })
      }
      if (fn !== 'apply_enrichment') throw new Error(`unexpected rpc ${fn}`)
      calls.rpcCalls.push(args)
      return Promise.resolve({ error: null })
    },
  }
  return { client: client as unknown as Client, calls }
}

function makeConfig(
  rows: StagingItem[],
  overrides: Partial<EnrichmentDriverConfig>,
  budget?: BudgetStub
): { handler: (req: Request) => Promise<Response>; calls: StubCalls } {
  const { client, calls } = makeStubClient(rows, budget)
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

Deno.test('passes normalized merge through the RPC (no separate UPDATE)', async () => {
  const { handler, calls } = makeConfig([row('1', { name: 'a', tags: [] })], {
    enrichItem: async (_c, _i, n) => ({
      succeeded: true,
      mergedNormalized: { ...n, description: 'd' },
      enrichedData: { ai: true },
    }),
  })
  await handler(post({}))
  assertEquals(calls.normalizedUpdates.length, 0)
  const merged = calls.rpcCalls[0].p_merged_normalized as Record<string, unknown>
  assertEquals(merged.description, 'd')
  assertEquals(calls.rpcCalls[0].p_status, 'success')
  assertEquals(calls.rpcCalls[0].p_stage, 'enrich-test')
  assertEquals(calls.rpcCalls[0].p_actor, 'pipeline-enrich-test')
})

Deno.test('sends p_merged_normalized: null when no merge produced', async () => {
  const { handler, calls } = makeConfig([row('1')], {
    enrichItem: async () => ({ succeeded: true, enrichedData: { ai: true } }),
  })
  await handler(post({}))
  assertEquals(calls.rpcCalls[0].p_merged_normalized, null)
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

// ── Stage-reorder gates (overhaul P3a) ─────────────────────────────────────

const hasFilter = (calls: StubCalls, op: string, col: string, v: unknown) =>
  calls.filters.some(([o, c, val]) => o === op && c === col && val === v)

Deno.test('selection always excludes already-disposed rows, gates off by default', async () => {
  const { handler, calls } = makeConfig([row('1')], {})
  await handler(post({}))
  assertEquals(hasFilter(calls, 'eq', 'enrichment_status', 'pending'), true)
  assertEquals(hasFilter(calls, 'eq', 'disposition', 'pending'), true)
  // Default OFF: current stage order (enrich before validate/dedup) must keep
  // selecting rows whose gate columns still read 'pending'.
  assertEquals(calls.filters.some(([, c]) => c === 'ai_validation_status'), false)
  assertEquals(calls.filters.some(([, c]) => c === 'dedup_status'), false)
})

Deno.test('requireGates config adds the validate + dedup gate filters', async () => {
  const { handler, calls } = makeConfig([row('1')], { requireGates: true })
  await handler(post({}))
  assertEquals(hasFilter(calls, 'eq', 'ai_validation_status', 'approved'), true)
  assertEquals(hasFilter(calls, 'neq', 'dedup_status', 'duplicate'), true)
  assertEquals(hasFilter(calls, 'eq', 'disposition', 'pending'), true)
})

Deno.test('body require_gates=true enables the gates without a config default', async () => {
  const { handler, calls } = makeConfig([row('1')], {})
  await handler(post({ require_gates: true }))
  assertEquals(hasFilter(calls, 'eq', 'ai_validation_status', 'approved'), true)
  assertEquals(hasFilter(calls, 'neq', 'dedup_status', 'duplicate'), true)
})

Deno.test('body require_gates=false overrides a requireGates config default', async () => {
  const { handler, calls } = makeConfig([row('1')], { requireGates: true })
  await handler(post({ require_gates: false }))
  assertEquals(calls.filters.some(([, c]) => c === 'ai_validation_status'), false)
  assertEquals(calls.filters.some(([, c]) => c === 'dedup_status'), false)
})

// ---- Central LLM budget (llmBudgetCaller) ----

Deno.test('llmBudgetCaller consumes the batch size before processing', async () => {
  const { handler, calls } = makeConfig(
    [row('1'), row('2'), row('3')],
    { llmBudgetCaller: 'pipeline-enrich-test' }
  )
  const res = await handler(post({}))
  const body = await res.json()
  assertEquals(body.items_succeeded, 3)
  assertEquals(calls.budgetCalls, [{ p_caller: 'pipeline-enrich-test', p_n: 3 }])
})

Deno.test('exhausted budget skips the whole batch with items 0', async () => {
  const { handler, calls } = makeConfig(
    [row('1'), row('2')],
    { llmBudgetCaller: 'pipeline-enrich-test' },
    { allowed: false, remaining: 0, cap: 600 }
  )
  const res = await handler(post({}))
  const body = await res.json()
  assertEquals(body.success, true)
  assertEquals(body.items, 0)
  assertEquals(body.items_processed, 0)
  assertEquals(body.skipped, 2)
  assertEquals(body.skipped_reason, 'llm_budget_exhausted')
  assertEquals(body.budget_cap, 600)
  // no enrichment ran, no writes happened
  assertEquals(calls.rpcCalls.length, 0)
})

Deno.test('missing budget RPC degrades to uncapped processing (half-ship safety)', async () => {
  const { handler, calls } = makeConfig(
    [row('1')],
    { llmBudgetCaller: 'pipeline-enrich-test' },
    'error'
  )
  const res = await handler(post({}))
  const body = await res.json()
  assertEquals(body.items_succeeded, 1)
  assertEquals(calls.rpcCalls.length, 1)
})

Deno.test('no llmBudgetCaller → the budget RPC is never called', async () => {
  const { handler, calls } = makeConfig([row('1')], {})
  await handler(post({}))
  assertEquals(calls.budgetCalls.length, 0)
})

// ---- Skip-if-unchanged guard ----

function enrichedRow(
  id: string,
  hash: string | null,
  prior: Record<string, unknown> | null
): StagingItem {
  return { ...row(id), payload_hash: hash, enriched_data: prior }
}

Deno.test('unchanged re-staged row skips the LLM and re-marks enriched', async () => {
  let enrichItemRan = 0
  const rows = [
    enrichedRow('1', 'h1', { enriched_at: '2026-08-01T00:00:00Z', payload_hash: 'h1' }),
  ]
  const { handler, calls } = makeConfig(rows, {
    enrichItem: async () => {
      enrichItemRan++
      return { succeeded: true, enrichedData: { x: 1 } }
    },
  })
  const res = await handler(post({}))
  const body = await res.json()
  assertEquals(enrichItemRan, 0)
  assertEquals(body.skipped, 1)
  assertEquals(body.items_succeeded, 0)
  // re-marked 'enriched' via an empty merge so it leaves the pending pool
  assertEquals(calls.rpcCalls.length, 1)
  assertEquals(calls.rpcCalls[0].p_status, 'success')
  assertEquals(calls.rpcCalls[0].p_new_enriched, {})
})

Deno.test('changed payload_hash re-enriches and stamps the new hash', async () => {
  const rows = [
    enrichedRow('1', 'h2', { enriched_at: '2026-08-01T00:00:00Z', payload_hash: 'h1' }),
  ]
  const { handler, calls } = makeConfig(rows, {
    enrichItem: async () => ({ succeeded: true, enrichedData: { x: 1 } }),
  })
  const res = await handler(post({}))
  const body = await res.json()
  assertEquals(body.items_succeeded, 1)
  const enriched = calls.rpcCalls[0].p_new_enriched as Record<string, unknown>
  assertEquals(enriched.x, 1)
  assertEquals(enriched.payload_hash, 'h2')
  assertEquals(typeof enriched.enriched_at, 'string')
})

Deno.test('prior enrichment without a stored payload_hash re-enriches (no false skip)', async () => {
  const rows = [enrichedRow('1', 'h1', { enriched_at: '2026-08-01T00:00:00Z' })]
  const { handler } = makeConfig(rows, {})
  const res = await handler(post({}))
  const body = await res.json()
  assertEquals(body.items_succeeded, 1)
  assertEquals(body.skipped, 0)
})

Deno.test('adopter-provided enriched_at wins over the driver stamp', async () => {
  const { handler, calls } = makeConfig([row('1')], {
    enrichItem: async () => ({
      succeeded: true,
      enrichedData: { enriched_at: 'adopter-time' },
    }),
  })
  await handler(post({}))
  const enriched = calls.rpcCalls[0].p_new_enriched as Record<string, unknown>
  assertEquals(enriched.enriched_at, 'adopter-time')
})

Deno.test('failed outcomes are not stamped with payload_hash', async () => {
  const rows = [enrichedRow('1', 'h1', null)]
  const { handler, calls } = makeConfig(rows, {
    enrichItem: async () => ({ succeeded: false, enrichedData: { partial: true }, error: 'boom' }),
  })
  await handler(post({}))
  const enriched = calls.rpcCalls[0].p_new_enriched as Record<string, unknown>
  assertEquals(enriched.payload_hash, undefined)
  assertEquals(enriched.enriched_at, undefined)
  assertEquals(enriched.partial, true)
})

Deno.test('dry_run skips unchanged rows without writing', async () => {
  const rows = [
    enrichedRow('1', 'h1', { enriched_at: '2026-08-01T00:00:00Z', payload_hash: 'h1' }),
  ]
  const { handler, calls } = makeConfig(rows, {})
  const res = await handler(post({ dry_run: true }))
  const body = await res.json()
  assertEquals(body.skipped, 1)
  assertEquals(calls.rpcCalls.length, 0)
})
