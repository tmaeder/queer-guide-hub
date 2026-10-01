import { assertEquals } from 'jsr:@std/assert'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'
import { reserveFoursquareApiCalls } from './foursquare-budget.ts'

function stubClient(
  result: { data: unknown; error: { message: string } | null } | 'throw',
): { client: SupabaseClient; calls: Array<{ fn: string; args: Record<string, unknown> }> } {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = []
  const client = {
    rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ fn, args })
      if (result === 'throw') return Promise.reject(new Error('network down'))
      return Promise.resolve(result)
    },
  }
  return { client: client as unknown as SupabaseClient, calls }
}

Deno.test('reserves calls atomically through the database RPC', async () => {
  const { client, calls } = stubClient({
    data: { allowed: true, remaining: 449, spent: 1, limit: 500, safety_margin: 50 },
    error: null,
  })
  const verdict = await reserveFoursquareApiCalls(client, 'search:venues')
  assertEquals(verdict, {
    allowed: true,
    reason: undefined,
    remaining: 449,
    spent: 1,
    limit: 500,
    safetyMargin: 50,
    degraded: false,
  })
  assertEquals(calls, [{
    fn: 'reserve_foursquare_api_calls',
    args: { p_purpose: 'search:venues', p_calls: 1 },
  }])
})

Deno.test('reports a clean free-tier denial', async () => {
  const { client } = stubClient({
    data: { allowed: false, reason: 'free_tier_exhausted', remaining: 0, spent: 450, limit: 500, safety_margin: 50 },
    error: null,
  })
  const verdict = await reserveFoursquareApiCalls(client, 'photo')
  assertEquals(verdict.allowed, false)
  assertEquals(verdict.reason, 'free_tier_exhausted')
  assertEquals(verdict.degraded, false)
})

Deno.test('fails closed when the budget RPC is missing', async () => {
  const { client } = stubClient({
    data: null,
    error: { message: 'Could not find the function public.reserve_foursquare_api_calls' },
  })
  const verdict = await reserveFoursquareApiCalls(client, 'search')
  assertEquals(verdict.allowed, false)
  assertEquals(verdict.reason, 'budget_unavailable')
  assertEquals(verdict.degraded, true)
})

Deno.test('fails closed on transport errors', async () => {
  const { client } = stubClient('throw')
  const verdict = await reserveFoursquareApiCalls(client, 'details')
  assertEquals(verdict.allowed, false)
  assertEquals(verdict.degraded, true)
})
