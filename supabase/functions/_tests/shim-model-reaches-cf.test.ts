/**
 * The model that reaches CLOUDFLARE must always be a `@cf/...` id.
 *
 * This test exists because the previous one did not catch a live bug. It
 * asserted mapToCfModel() in isolation, and mapToCfModel lives in
 * openai-client.ts — but the Anthropic shim runs through llm-client.ts, which
 * never called it. So the unit test passed while the shim forwarded
 * `claude-haiku-4-5-20251001` to Cloudflare as a model id, which does not
 * exist there. Testing the mapper proved the mapper; it did not prove the path.
 *
 * So this asserts the request BODY llm-client would send, by intercepting fetch
 * rather than trusting a helper.
 */
import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { llmAnthropicStyle } from '../_shared/llm-client.ts'

function stubFetch(): { modelSent: () => string } {
  let sent = ''
  globalThis.fetch = ((_url: string | URL | Request, init?: RequestInit) => {
    sent = JSON.parse(String(init?.body ?? '{}')).model ?? ''
    return Promise.resolve(
      new Response(
        JSON.stringify({ choices: [{ message: { content: 'ok' } }], usage: {}, model: sent }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )
  }) as typeof fetch
  return { modelSent: () => sent }
}

Deno.env.set('CF_ACCOUNT_ID', 'test-acct')
Deno.env.set('CF_AI_API_TOKEN', 'test-token')

Deno.test('a claude-haiku name never reaches Cloudflare verbatim', async () => {
  const f = stubFetch()
  await llmAnthropicStyle({
    messages: [{ role: 'user', content: 'hi' }],
    model: 'claude-haiku-4-5-20251001',
  })
  assertStringIncludes(f.modelSent(), '@cf/', 'model sent to CF must be a @cf/ id')
  assertEquals(f.modelSent(), '@cf/meta/llama-3.1-8b-instruct-fast')
})

Deno.test('a claude-sonnet name maps to the strong CF model', async () => {
  const f = stubFetch()
  await llmAnthropicStyle({
    messages: [{ role: 'user', content: 'hi' }],
    model: 'claude-sonnet-4-6',
  })
  assertEquals(f.modelSent(), '@cf/meta/llama-3.3-70b-instruct-fp8-fast')
})

Deno.test('an explicit @cf id is passed through', async () => {
  const f = stubFetch()
  await llmAnthropicStyle({
    messages: [{ role: 'user', content: 'hi' }],
    model: '@cf/google/gemma-4-26b-a4b-it',
  })
  assertEquals(f.modelSent(), '@cf/google/gemma-4-26b-a4b-it')
})

Deno.test('no model supplied still sends a @cf id', async () => {
  const f = stubFetch()
  await llmAnthropicStyle({ messages: [{ role: 'user', content: 'hi' }] })
  assertStringIncludes(f.modelSent(), '@cf/')
})
