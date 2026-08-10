/**
 * Telemetry must never be able to break inference.
 *
 * These assert the failure modes, not the happy path. A logger that throws on
 * a DB hiccup would convert an observability nicety into an outage — and this
 * one sits in llm-client.ts, which nearly every edge function imports.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { recordLlmUsage, setLlmUsageFireAndForget } from '../_shared/llm-usage-log.ts'

const realFetch = globalThis.fetch

function restore() {
  globalThis.fetch = realFetch
  Deno.env.delete('SUPABASE_URL')
  Deno.env.delete('SUPABASE_SERVICE_ROLE_KEY')
}

Deno.test('a rejecting fetch does not throw', async () => {
  const prev = setLlmUsageFireAndForget(false)
  Deno.env.set('SUPABASE_URL', 'https://example.test')
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'k')
  globalThis.fetch = (() => Promise.reject(new Error('network down'))) as typeof fetch
  // Must resolve, not reject.
  await recordLlmUsage({ fn: 'test', model: null, tokensIn: 1, tokensOut: 1 })
  setLlmUsageFireAndForget(prev)
  restore()
})

Deno.test('a 500 from PostgREST does not throw', async () => {
  const prev = setLlmUsageFireAndForget(false)
  Deno.env.set('SUPABASE_URL', 'https://example.test')
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'k')
  globalThis.fetch = (() => Promise.resolve(new Response('boom', { status: 500 }))) as typeof fetch
  await recordLlmUsage({ fn: 'test', model: null, tokensIn: 1, tokensOut: 1 })
  setLlmUsageFireAndForget(prev)
  restore()
})

Deno.test('no service credentials is a no-op, not an error', async () => {
  const prev = setLlmUsageFireAndForget(false)
  restore()
  let called = false
  globalThis.fetch = (() => { called = true; return Promise.resolve(new Response('{}')) }) as typeof fetch
  await recordLlmUsage({ fn: 'test', model: 'x', tokensIn: 1, tokensOut: 1 })
  assertEquals(called, false, 'must not attempt a write without credentials')
  setLlmUsageFireAndForget(prev)
  restore()
})

Deno.test('the row carries a computed cost and the token counts', async () => {
  const prev = setLlmUsageFireAndForget(false)
  Deno.env.set('SUPABASE_URL', 'https://example.test')
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'k')
  let body: Record<string, unknown> = {}
  globalThis.fetch = ((_u: unknown, init?: RequestInit) => {
    body = JSON.parse(String(init?.body ?? '{}'))
    return Promise.resolve(new Response('', { status: 201 }))
  }) as typeof fetch

  await recordLlmUsage({
    fn: 'pipeline-safety-relevance',
    model: '@cf/meta/llama-3.1-8b-instruct-fast',
    tokensIn: 1000, tokensOut: 500, contextKey: 'run-1',
  })

  assertEquals(body.function, 'pipeline-safety-relevance')
  assertEquals(body.tokens_in, 1000)
  assertEquals(body.tokens_out, 500)
  assertEquals(body.context_key, 'run-1')
  assertEquals(typeof body.cost_usd, 'number')
  setLlmUsageFireAndForget(prev)
  restore()
})

Deno.test('an unknown model stores NULL cost but keeps the tokens', async () => {
  const prev = setLlmUsageFireAndForget(false)
  Deno.env.set('SUPABASE_URL', 'https://example.test')
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'k')
  let body: Record<string, unknown> = {}
  globalThis.fetch = ((_u: unknown, init?: RequestInit) => {
    body = JSON.parse(String(init?.body ?? '{}'))
    return Promise.resolve(new Response('', { status: 201 }))
  }) as typeof fetch

  await recordLlmUsage({ fn: 'x', model: '@cf/unknown/model', tokensIn: 7, tokensOut: 9 })
  assertEquals(body.cost_usd, null, 'unknown price must be null, never 0')
  assertEquals(body.tokens_in, 7, 'tokens must still be recorded so cost is backfillable')
  assertEquals(body.tokens_out, 9)
  setLlmUsageFireAndForget(prev)
  restore()
})
