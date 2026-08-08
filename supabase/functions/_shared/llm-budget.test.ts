// Unit tests for the central LLM budget helper (fail-open contract).
// Run with: cd supabase/functions && deno test --allow-env _shared/llm-budget.test.ts
import { assertEquals } from 'jsr:@std/assert'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'
import { consumeLlmBudget } from './llm-budget.ts'

function stubClient(
  result: { data: unknown; error: { message: string } | null } | 'throw'
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

Deno.test('allowed consume passes the RPC verdict through', async () => {
  const { client, calls } = stubClient({
    data: { allowed: true, remaining: 475, cap: 500, spent: 25 },
    error: null,
  })
  const d = await consumeLlmBudget(client, 'marketplace-description-enhance', 25)
  assertEquals(d, { allowed: true, remaining: 475, cap: 500, spent: 25, degraded: false })
  assertEquals(calls, [
    { fn: 'llm_budget_consume', args: { p_caller: 'marketplace-description-enhance', p_n: 25 } },
  ])
})

Deno.test('denied consume reports the cap and stays non-degraded', async () => {
  const { client } = stubClient({
    data: { allowed: false, remaining: 0, cap: 60, spent: 60 },
    error: null,
  })
  const d = await consumeLlmBudget(client, 'event-agentic-enrich')
  assertEquals(d.allowed, false)
  assertEquals(d.remaining, 0)
  assertEquals(d.cap, 60)
  assertEquals(d.degraded, false)
})

Deno.test('missing RPC (PostgREST error) fails open as degraded', async () => {
  const { client } = stubClient({
    data: null,
    error: { message: 'Could not find the function public.llm_budget_consume' },
  })
  const d = await consumeLlmBudget(client, 'pipeline-enrich-news', 50)
  assertEquals(d, { allowed: true, remaining: null, cap: null, spent: null, degraded: true })
})

Deno.test('thrown rpc error fails open as degraded', async () => {
  const { client } = stubClient('throw')
  const d = await consumeLlmBudget(client, 'city-agentic-enrich', 1)
  assertEquals(d.allowed, true)
  assertEquals(d.degraded, true)
})

Deno.test('null data (defensive) fails open as degraded', async () => {
  const { client } = stubClient({ data: null, error: null })
  const d = await consumeLlmBudget(client, 'x', 1)
  assertEquals(d.degraded, true)
  assertEquals(d.allowed, true)
})

Deno.test('malformed payload defaults to allowed without crashing', async () => {
  const { client } = stubClient({ data: { unexpected: 'shape' }, error: null })
  const d = await consumeLlmBudget(client, 'x', 1)
  assertEquals(d.allowed, true)
  assertEquals(d.remaining, null)
  assertEquals(d.degraded, false)
})

Deno.test('default n is 1', async () => {
  const { client, calls } = stubClient({ data: { allowed: true, remaining: 1 }, error: null })
  await consumeLlmBudget(client, 'x')
  assertEquals(calls[0].args.p_n, 1)
})
