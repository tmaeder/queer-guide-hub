/**
 * The NVIDIA half of shim-model-reaches-cf.test.ts, and it exists for the same
 * reason that file gives: testing the mapper proves the mapper, not the path.
 *
 * nvidia-model-map.test.ts already asserts mapToNvidiaModel() in isolation. That
 * is exactly the shape of test that passed while the Anthropic shim forwarded
 * `claude-haiku-4-5-20251001` to Cloudflare verbatim, because the shim ran
 * through a client that never called the mapper. So this asserts the request
 * BODY that actually leaves the process, through the real
 * anthropicMessages -> llmAnthropicStyle -> llmChatCompletion -> router path,
 * by intercepting fetch.
 *
 * A `@cf/...` id reaching integrate.api.nvidia.com is a model that does not
 * exist there — the identical failure, one provider over.
 */
import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { anthropicMessages } from '../_shared/anthropic-shim.ts'
import {
  NVIDIA_MODEL_DEFAULT,
  NVIDIA_MODEL_STRONG,
} from '../_shared/nvidia-model-map.ts'

const ENV: Record<string, string> = {
  NVIDIA_API_KEY: 'nvapi-test',
  SUPABASE_URL: 'https://example.test',
  SUPABASE_SERVICE_ROLE_KEY: 'k',
  NVIDIA_MAX_WAIT_MS: '0',
  // Present so a routing regression fails loudly here rather than silently
  // succeeding against Cloudflare with a plausible-looking body.
  CF_ACCOUNT_ID: 'test-acct',
  CF_AI_API_TOKEN: 'test-token',
}

interface Sent {
  url: string
  model: string
}

function stubFetch(): { last: () => Sent | null } {
  let last: Sent | null = null
  globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => {
    const u = String(url)
    if (u.includes('/rest/v1/rpc/llm_rate_acquire')) {
      return Promise.resolve(
        new Response(JSON.stringify({ granted: true, retry_after_ms: 0 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
    }
    if (u.includes('/rest/v1/rpc/circuit_breaker_check')) {
      return Promise.resolve(
        new Response('true', { status: 200, headers: { 'content-type': 'application/json' } }),
      )
    }
    // 204 must have a null body, not an empty string — otherwise the Response
    // constructor throws and the usage-log insert reports a false failure.
    if (u.includes('/rest/v1/')) return Promise.resolve(new Response(null, { status: 204 }))

    const model = JSON.parse(String(init?.body ?? '{}')).model ?? ''
    last = { url: u, model }
    return Promise.resolve(
      new Response(
        JSON.stringify({ choices: [{ message: { content: 'ok' } }], usage: {}, model }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )
  }) as typeof fetch
  return { last: () => last }
}

async function withNvidiaEnv(fn: (f: { last: () => Sent | null }) => Promise<void>) {
  const saved = new Map(Object.keys(ENV).map((k) => [k, Deno.env.get(k)]))
  const savedDisabled = Deno.env.get('NVIDIA_DISABLED')
  const savedFetch = globalThis.fetch
  Deno.env.delete('NVIDIA_DISABLED')
  for (const [k, v] of Object.entries(ENV)) Deno.env.set(k, v)
  try {
    await fn(stubFetch())
  } finally {
    for (const [k, v] of saved) {
      if (v === undefined) Deno.env.delete(k)
      else Deno.env.set(k, v)
    }
    if (savedDisabled !== undefined) Deno.env.set('NVIDIA_DISABLED', savedDisabled)
    globalThis.fetch = savedFetch
  }
}

Deno.test('the shim path reaches NVIDIA, not Cloudflare', async () => {
  await withNvidiaEnv(async (f) => {
    await anthropicMessages({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'hi' }],
    })
    assertStringIncludes(f.last()?.url ?? '', 'integrate.api.nvidia.com')
  })
})

Deno.test('a claude-haiku name never reaches NVIDIA verbatim, and stays cheap tier', async () => {
  await withNvidiaEnv(async (f) => {
    await anthropicMessages({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'hi' }],
    })
    assertEquals(f.last()?.model, NVIDIA_MODEL_DEFAULT)
  })
})

/**
 * translate-i18n-batch is the one shim caller that asks for the strong tier, and
 * it spent its whole life on the 8B because the shim dropped the model name.
 * The same drop on this path would be invisible in exactly the same way.
 */
Deno.test('a claude-sonnet name maps to the NVIDIA strong tier', async () => {
  await withNvidiaEnv(async (f) => {
    await anthropicMessages({
      model: 'claude-sonnet-4-6',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'hi' }],
    })
    assertEquals(f.last()?.model, NVIDIA_MODEL_STRONG)
  })
})

Deno.test('no @cf id is ever sent to NVIDIA', async () => {
  await withNvidiaEnv(async (f) => {
    for (const model of [
      'claude-haiku-4-5-20251001',
      'claude-sonnet-4-6',
      '@cf/meta/llama-3.1-8b-instruct-fast',
      '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    ]) {
      await anthropicMessages({
        model,
        max_tokens: 100,
        messages: [{ role: 'user', content: 'hi' }],
      })
      assertEquals(
        (f.last()?.model ?? '').startsWith('@cf/'),
        false,
        `${model} leaked a Cloudflare id to NVIDIA`,
      )
    }
  })
})
