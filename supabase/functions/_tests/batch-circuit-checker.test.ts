/**
 * Pure unit tests for createBatchCircuitChecker — the batch-friendly mode of
 * the shared circuit breaker (one closed-state check per batch, buffered
 * success bookkeeping, per-call failure recording).
 */
import { assertEquals, assertRejects } from 'jsr:@std/assert'
import {
  createBatchCircuitChecker,
  CircuitOpenError,
} from '../_shared/circuit-breaker.ts'

interface Row {
  api_name: string
  state: 'closed' | 'open' | 'half_open'
  failure_count: number
  success_count: number
  open_until: string | null
  threshold: number
  reset_timeout_seconds: number
}

function makeStub(row: Row | null) {
  const calls = { selects: 0, updates: [] as Record<string, unknown>[], rpc: [] as string[] }
  const client = {
    from(_table: string) {
      return {
        select(_cols: string) {
          return {
            eq(_c: string, _v: string) {
              return {
                single() {
                  calls.selects++
                  return Promise.resolve(
                    row ? { data: row, error: null } : { data: null, error: { message: 'no row' } }
                  )
                },
              }
            },
          }
        },
        update(payload: Record<string, unknown>) {
          return {
            eq(_c: string, _v: string) {
              calls.updates.push(payload)
              const thenable = Promise.resolve({ data: [row], error: null })
              return Object.assign(thenable, {
                select() {
                  return Promise.resolve({ data: [{ state: 'half_open' }], error: null })
                },
              })
            },
          }
        },
      }
    },
    rpc(name: string, _args: Record<string, unknown>) {
      calls.rpc.push(name)
      if (name === 'circuit_breaker_record_failure') {
        return Promise.resolve({ data: { circuit_opened: (row?.failure_count ?? 0) + 1 >= (row?.threshold ?? 5) } })
      }
      return Promise.resolve({ data: null, error: null })
    },
  }
  // deno-lint-ignore no-explicit-any
  return { client: client as any, calls }
}

const closedRow: Row = {
  api_name: 'test.api', state: 'closed', failure_count: 0, success_count: 0,
  open_until: null, threshold: 5, reset_timeout_seconds: 300,
}

Deno.test('closed state is checked once and successes are buffered', async () => {
  const { client, calls } = makeStub({ ...closedRow })
  const breaker = createBatchCircuitChecker(client, 'test.api')
  for (let i = 0; i < 5; i++) {
    assertEquals(await breaker.run(() => Promise.resolve(i)), i)
  }
  // one checkCircuit SELECT, zero per-item bookkeeping writes
  assertEquals(calls.selects, 1)
  assertEquals(calls.updates.length, 0)
  await breaker.flush()
  // flush: one state reset + one success_count read-modify-write
  assertEquals(calls.updates.length, 2)
  assertEquals(calls.updates[0].state, 'closed')
  assertEquals(calls.updates[1].success_count, 5)
})

Deno.test('open circuit blocks every call without touching the API fn', async () => {
  const future = new Date(Date.now() + 60_000).toISOString()
  const { client } = makeStub({ ...closedRow, state: 'open', open_until: future })
  const breaker = createBatchCircuitChecker(client, 'test.api')
  let fnRan = false
  await assertRejects(
    () => breaker.run(() => { fnRan = true; return Promise.resolve(1) }),
    CircuitOpenError
  )
  assertEquals(fnRan, false)
  // second call short-circuits on the local blocked flag
  await assertRejects(() => breaker.run(() => Promise.resolve(1)), CircuitOpenError)
})

Deno.test('failure records per-call and an opened circuit blocks the rest of the batch', async () => {
  const { client, calls } = makeStub({ ...closedRow, failure_count: 4, threshold: 5 })
  const breaker = createBatchCircuitChecker(client, 'test.api')
  await assertRejects(() => breaker.run(() => Promise.reject(new Error('boom'))), Error, 'boom')
  assertEquals(calls.rpc.includes('circuit_breaker_record_failure'), true)
  // threshold reached -> local cache flips to blocked
  await assertRejects(() => breaker.run(() => Promise.resolve(1)), CircuitOpenError)
})

Deno.test('unconfigured breaker (no row) allows and flush is a no-op write path', async () => {
  const { client, calls } = makeStub(null)
  const breaker = createBatchCircuitChecker(client, 'missing.api')
  assertEquals(await breaker.run(() => Promise.resolve('ok')), 'ok')
  await breaker.flush()
  // state-reset update fires but the success_count RMW finds no row — harmless
  assertEquals(calls.selects >= 1, true)
})

Deno.test('half_open degrades to per-call checks and immediate success recording', async () => {
  const row = { ...closedRow, state: 'half_open' as const }
  const { client, calls } = makeStub(row)
  const breaker = createBatchCircuitChecker(client, 'test.api')
  await breaker.run(() => Promise.resolve(1))
  await breaker.run(() => Promise.resolve(2))
  // per-call: two checkCircuit SELECTs (no caching in half_open)
  assertEquals(calls.selects >= 2, true)
  // immediate recordSuccess wrote state resets (not buffered)
  assertEquals(calls.updates.length >= 2, true)
  await breaker.flush()
})
