/**
 * Provider-chain behaviour: when NVIDIA is used, and what each failure does to
 * the circuit breaker.
 *
 * The classification is the load-bearing part. A 429 must NOT count as a
 * breaker failure — it means "too fast", and filing it as "broken" would trip
 * the circuit during any legitimate burst and take the provider out for the
 * whole reset window, which is exactly backwards. Everything else must count,
 * because the free tier's exhaustion status is undocumented and the safe
 * default is to stop asking.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { tryNvidia } from './llm-router.ts'

const ENV_KEYS = [
  'NVIDIA_API_KEY',
  'NVIDIA_DISABLED',
  'NVIDIA_EXCLUDE_CALLERS',
  'NVIDIA_MAX_WAIT_MS',
  'NVIDIA_MODEL',
  'NVIDIA_MODEL_STRONG',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
]

interface Recorded {
  /** Body of the NVIDIA chat request, or null if it was never called. */
  chat: Record<string, unknown> | null
  /** RPC name -> bodies, so breaker effects are assertable. */
  rpc: Array<{ fn: string; body: Record<string, unknown> }>
}

/**
 * Stub every outbound fetch: the rate-limit / breaker RPCs and the NVIDIA call.
 * `chatResponse` decides what the provider "returns".
 */
function stub(
  chatResponse: () => Response,
  opts: { slot?: boolean; breakerOpen?: boolean; retryAfterMs?: number } = {},
) {
  const rec: Recorded = { chat: null, rpc: [] }
  globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => {
    const u = String(url)
    const body = init?.body ? JSON.parse(String(init.body)) : {}

    if (u.includes('/rest/v1/rpc/')) {
      const fn = u.split('/rest/v1/rpc/')[1]
      rec.rpc.push({ fn, body })
      if (fn === 'llm_rate_acquire') {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              granted: opts.slot !== false,
              retry_after_ms: opts.retryAfterMs ?? 60_000,
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
        )
      }
      if (fn === 'circuit_breaker_check') {
        return Promise.resolve(
          new Response(JSON.stringify(!opts.breakerOpen), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        )
      }
      return Promise.resolve(new Response(null, { status: 204 }))
    }

    if (u.includes('integrate.api.nvidia.com')) {
      rec.chat = body
      return Promise.resolve(chatResponse())
    }
    throw new Error(`unexpected fetch to ${u}`)
  }) as typeof fetch
  return rec
}

function ok(content = 'hello'): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content } }],
      usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
      model: 'nvidia/nemotron-nano-3-30b-a3b',
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

const REQ = {
  messages: [{ role: 'user' as const, content: 'hi' }],
  model: 'gpt-4o-mini',
  temperature: 0.3,
  max_tokens: 100,
}

/** Each test runs against a known env, and restores whatever was there. */
async function withEnv(
  env: Record<string, string | undefined>,
  fn: () => Promise<void>,
): Promise<void> {
  const savedEnv = new Map(ENV_KEYS.map((k) => [k, Deno.env.get(k)]))
  const savedFetch = globalThis.fetch
  for (const k of ENV_KEYS) Deno.env.delete(k)
  for (const [k, v] of Object.entries(env)) if (v !== undefined) Deno.env.set(k, v)
  try {
    await fn()
  } finally {
    for (const k of ENV_KEYS) Deno.env.delete(k)
    for (const [k, v] of savedEnv) if (v !== undefined) Deno.env.set(k, v)
    globalThis.fetch = savedFetch
  }
}

const CONFIGURED = {
  NVIDIA_API_KEY: 'nvapi-test',
  SUPABASE_URL: 'https://example.test',
  SUPABASE_SERVICE_ROLE_KEY: 'k',
  NVIDIA_MAX_WAIT_MS: '0',
}

// ---------------------------------------------------------------------------
// Skip conditions — each must reach Cloudflare without touching the provider
// ---------------------------------------------------------------------------

/**
 * The rollback guarantee. With no key the router does nothing at all, so the
 * request an edge function sends is the one it sent before this existed.
 */
Deno.test('no API key: inert, and the provider is never contacted', async () => {
  await withEnv({ SUPABASE_URL: 'https://example.test', SUPABASE_SERVICE_ROLE_KEY: 'k' }, async () => {
    const rec = stub(ok)
    const out = await tryNvidia(REQ, { callerFn: 'x' })
    assertEquals(out.served, false)
    assertEquals(out.served === false && out.reason, 'not_configured')
    assertEquals(rec.chat, null)
    assertEquals(rec.rpc.length, 0, 'must not even reach the DB')
  })
})

Deno.test('NVIDIA_DISABLED=1 is an instant off switch without unsetting the key', async () => {
  await withEnv({ ...CONFIGURED, NVIDIA_DISABLED: '1' }, async () => {
    const rec = stub(ok)
    const out = await tryNvidia(REQ, { callerFn: 'x' })
    assertEquals(out.served === false && out.reason, 'disabled')
    assertEquals(rec.chat, null)
  })
})

/**
 * The residency escape hatch: excluding a caller that handles user-identifiable
 * text must be a config change, not a code change.
 */
Deno.test('an excluded caller never reaches the provider', async () => {
  await withEnv(
    { ...CONFIGURED, NVIDIA_EXCLUDE_CALLERS: 'trip-concierge, intimate-moderation' },
    async () => {
      const rec = stub(ok)
      const out = await tryNvidia(REQ, { callerFn: 'intimate-moderation' })
      assertEquals(out.served === false && out.reason, 'caller_excluded')
      assertEquals(rec.chat, null)

      const other = await tryNvidia(REQ, { callerFn: 'pipeline-enrich-news' })
      assertEquals(other.served, true, 'a non-excluded caller still routes')
    },
  )
})

Deno.test('an embedding model is refused rather than answered with chat text', async () => {
  await withEnv(CONFIGURED, async () => {
    const rec = stub(ok)
    const out = await tryNvidia({ ...REQ, model: '@cf/baai/bge-m3' }, { callerFn: 'x' })
    assertEquals(out.served === false && out.reason, 'model_unsupported')
    assertEquals(rec.chat, null)
  })
})

Deno.test('an open circuit skips the provider entirely', async () => {
  await withEnv(CONFIGURED, async () => {
    const rec = stub(ok, { breakerOpen: true })
    const out = await tryNvidia(REQ, { callerFn: 'x' })
    assertEquals(out.served === false && out.reason, 'circuit_open')
    assertEquals(rec.chat, null)
  })
})

Deno.test('no rate slot within the wait budget falls back without calling out', async () => {
  await withEnv(CONFIGURED, async () => {
    const rec = stub(ok, { slot: false })
    const out = await tryNvidia(REQ, { callerFn: 'x', waitMs: 0 })
    assertEquals(out.served === false && out.reason, 'no_slot')
    assertEquals(rec.chat, null)
  })
})

// ---------------------------------------------------------------------------
// Success
// ---------------------------------------------------------------------------

Deno.test('a served call returns content and sends a mapped NVIDIA model id', async () => {
  await withEnv(CONFIGURED, async () => {
    const rec = stub(ok)
    const out = await tryNvidia(REQ, { callerFn: 'pipeline-enrich-news' })
    assertEquals(out.served, true)
    assertEquals(out.served === true && out.content, 'hello')
    assertEquals(rec.chat?.model, 'nvidia/nemotron-nano-3-30b-a3b')
    assertEquals(
      rec.rpc.some((r) => r.fn === 'circuit_breaker_record_success'),
      true,
      'success must reset the breaker',
    )
  })
})

/**
 * Sending response_format would make the two providers produce subtly different
 * output for the same call, which surfaces only as parse failures on one path.
 */
Deno.test('response_format is never sent, matching the Cloudflare path', async () => {
  await withEnv(CONFIGURED, async () => {
    const rec = stub(ok)
    await tryNvidia(REQ, { callerFn: 'x' })
    assertEquals('response_format' in (rec.chat ?? {}), false)
  })
})

// ---------------------------------------------------------------------------
// Failure classification
// ---------------------------------------------------------------------------

function breakerFailures(rec: Recorded): number {
  return rec.rpc.filter((r) => r.fn === 'circuit_breaker_record_failure').length
}

/**
 * THE case this classification exists for. A 429 is a pacing fact, not a health
 * fact: counting it would trip the breaker on any burst and disable the
 * provider for the entire reset window.
 */
Deno.test('429 falls back but does NOT record a breaker failure', async () => {
  await withEnv(CONFIGURED, async () => {
    const rec = stub(() => new Response('rate limited', { status: 429 }))
    const out = await tryNvidia(REQ, { callerFn: 'x' })
    assertEquals(out.served === false && out.reason, 'rate_limited')
    assertEquals(breakerFailures(rec), 0, 'a 429 must never trip the circuit')
  })
})

Deno.test('403 records a breaker failure — a revoked key must stop the traffic', async () => {
  await withEnv(CONFIGURED, async () => {
    const rec = stub(() => new Response('forbidden', { status: 403 }))
    const out = await tryNvidia(REQ, { callerFn: 'x' })
    assertEquals(out.served === false && out.reason, 'auth')
    assertEquals(breakerFailures(rec), 1)
  })
})

/**
 * The "free usage is over" arm. NVIDIA does not document the status it returns
 * on exhaustion, so any unrecognised 4xx stops us asking — and the body is
 * carried into api_circuit_breakers.last_error so the real shape can be read
 * off production and this classifier narrowed against evidence.
 */
Deno.test('402 is treated as exhaustion and preserves the body as evidence', async () => {
  await withEnv(CONFIGURED, async () => {
    const rec = stub(() => new Response('{"detail":"out of credits"}', { status: 402 }))
    const out = await tryNvidia(REQ, { callerFn: 'x' })
    assertEquals(out.served === false && out.reason, 'exhausted')
    const fail = rec.rpc.find((r) => r.fn === 'circuit_breaker_record_failure')
    assertEquals(String(fail?.body.p_error).includes('out of credits'), true)
  })
})

Deno.test('a 5xx is retried once, then falls back', async () => {
  await withEnv(CONFIGURED, async () => {
    let calls = 0
    const rec = stub(() => {
      calls++
      return new Response('bad gateway', { status: 502 })
    })
    const out = await tryNvidia(REQ, { callerFn: 'x' })
    assertEquals(calls, 2, 'exactly one retry')
    assertEquals(out.served === false && out.reason, 'transient')
    assertEquals(breakerFailures(rec), 1)
  })
})

Deno.test('a transient 5xx followed by success is served', async () => {
  await withEnv(CONFIGURED, async () => {
    let calls = 0
    stub(() => (++calls === 1 ? new Response('nope', { status: 503 }) : ok()))
    const out = await tryNvidia(REQ, { callerFn: 'x' })
    assertEquals(out.served, true)
    assertEquals(calls, 2)
  })
})

/**
 * An empty 200 is how a degraded model presents. Anything that only checks the
 * status would call this a success and hand '' downstream.
 */
Deno.test('an empty 200 is a failure, not a success', async () => {
  await withEnv(CONFIGURED, async () => {
    const rec = stub(
      () =>
        new Response(JSON.stringify({ choices: [{ message: { content: '   ' } }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    )
    const out = await tryNvidia(REQ, { callerFn: 'x' })
    assertEquals(out.served === false && out.reason, 'empty_content')
    assertEquals(breakerFailures(rec), 1)
  })
})

/**
 * Workers AI does this and so may any OpenAI-compatible server: the model emits
 * JSON and the server hands back a parsed object where the contract says
 * string. The downstream parsers call .trim()/.match() and would throw.
 */
Deno.test('an object content is stringified rather than passed through', async () => {
  await withEnv(CONFIGURED, async () => {
    stub(
      () =>
        new Response(JSON.stringify({ choices: [{ message: { content: { tags: ['a'] } } }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    )
    const out = await tryNvidia(REQ, { callerFn: 'x' })
    assertEquals(out.served, true)
    assertEquals(out.served === true && out.content, '{"tags":["a"]}')
  })
})

// ---------------------------------------------------------------------------
// Pacing policy
// ---------------------------------------------------------------------------

/**
 * Pacing exists for batch throughput. Applied to a request a human is waiting
 * on, the same mechanism is a queue in front of the user — so an interactive
 * caller must fall back instantly instead of sleeping for a free slot.
 */
Deno.test('an interactive caller never waits for a slot', async () => {
  await withEnv(
    { ...CONFIGURED, NVIDIA_MAX_WAIT_MS: '60000' },
    async () => {
      stub(ok, { slot: false })
      const started = Date.now()
      const out = await tryNvidia(REQ, { callerFn: 'trip-concierge' })
      const elapsed = Date.now() - started
      assertEquals(out.served === false && out.reason, 'no_slot')
      assertEquals(elapsed < 1000, true, `fell back in ${elapsed}ms; must not pace`)
    },
  )
})

/**
 * The allowlist is inverted so that an UNRECOGNISED caller cannot pace, and this
 * is the test that would have caught the original bug.
 *
 * The first version of this file listed interactive callers instead and asserted
 * the carve-out using `callerFn: 'trip-concierge'` — a string no production code
 * passed, because `anthropicMessages` dropped `callerFn` and every trip function
 * arrived as `'llmChatCompletion'`. The assertion above passed while all eleven
 * user-facing functions would have paced. So pin the fallback name itself.
 */
Deno.test('an unattributed caller falls back instantly rather than pacing', async () => {
  await withEnv({ ...CONFIGURED, NVIDIA_MAX_WAIT_MS: '60000' }, async () => {
    stub(ok, { slot: false })
    for (const callerFn of ['llmChatCompletion', 'chatCompletion', 'some-new-function']) {
      const started = Date.now()
      const out = await tryNvidia(REQ, { callerFn })
      const elapsed = Date.now() - started
      assertEquals(out.served === false && out.reason, 'no_slot')
      assertEquals(elapsed < 1000, true, `${callerFn} paced for ${elapsed}ms`)
    }
  })
})

/**
 * A known batch caller still paces — the allowlist has to actually do its job.
 *
 * `retryAfterMs` must be SMALLER than the wait budget for this to exercise
 * pacing at all: the limiter refuses to start a sleep it cannot finish inside
 * the budget, so a bucket reporting a 60s wait against a 900ms budget correctly
 * returns immediately. An earlier version of this test used the 60s default and
 * failed for that reason — the code was right and the stub was not.
 */
Deno.test('a known batch caller does wait for a slot', async () => {
  await withEnv({ ...CONFIGURED, NVIDIA_MAX_WAIT_MS: '900' }, async () => {
    stub(ok, { slot: false, retryAfterMs: 200 })
    const started = Date.now()
    const out = await tryNvidia(REQ, { callerFn: 'pipeline-enrich-news' })
    const elapsed = Date.now() - started
    assertEquals(out.served === false && out.reason, 'no_slot')
    assertEquals(elapsed >= 400, true, `batch caller gave up after only ${elapsed}ms`)
    assertEquals(elapsed < 3000, true, `batch caller overran its budget: ${elapsed}ms`)
  })
})

/**
 * A deadline in the past means the batch has no time left; the router must go
 * straight to the fallback rather than sleeping past the edge wall.
 */
Deno.test('a passed deadline stops pacing immediately', async () => {
  await withEnv({ ...CONFIGURED, NVIDIA_MAX_WAIT_MS: '60000' }, async () => {
    stub(ok, { slot: false })
    const started = Date.now()
    const out = await tryNvidia(REQ, {
      callerFn: 'pipeline-enrich-news',
      deadlineAt: Date.now() - 1,
    })
    assertEquals(out.served === false && out.reason, 'no_slot')
    assertEquals(Date.now() - started < 1000, true)
  })
})

/**
 * Half-ship: the function can deploy before its migration. With the rate RPC
 * missing the router must fall back rather than ignore the account's rate
 * ceiling — deny is the safe direction, and it self-heals when the migration
 * lands.
 */
Deno.test('a missing rate RPC routes to the fallback instead of ignoring the limit', async () => {
  await withEnv(CONFIGURED, async () => {
    const rec: { chat: unknown } = { chat: null }
    globalThis.fetch = ((url: string | URL | Request) => {
      const u = String(url)
      if (u.includes('llm_rate_acquire')) {
        return Promise.resolve(new Response('{"message":"not found"}', { status: 404 }))
      }
      if (u.includes('/rest/v1/rpc/circuit_breaker_check')) {
        return Promise.resolve(
          new Response('true', { status: 200, headers: { 'content-type': 'application/json' } }),
        )
      }
      if (u.includes('integrate.api.nvidia.com')) {
        rec.chat = true
        return Promise.resolve(ok())
      }
      return Promise.resolve(new Response(null, { status: 204 }))
    }) as typeof fetch

    const out = await tryNvidia(REQ, { callerFn: 'x' })
    assertEquals(out.served === false && out.reason, 'rate_rpc_unavailable')
    assertEquals(rec.chat, null, 'must not call the provider unmetered')
  })
})
