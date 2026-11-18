import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'

let handler: (req: Request) => Promise<Response>
const descriptor = Object.getOwnPropertyDescriptor(Deno, 'serve')!
Object.defineProperty(Deno, 'serve', { configurable: true, value: (callback: typeof handler) => { handler = callback; return {} } })
try { await import('./index.ts') }
finally { Object.defineProperty(Deno, 'serve', descriptor) }

async function run(responses: Array<{ status: number; body: unknown }>, advanceMs = 0) {
  const originalFetch = globalThis.fetch
  const originalNow = Date.now
  const settings = { SUPABASE_URL: 'https://database.example', SUPABASE_SERVICE_ROLE_KEY: 'test-only', INTERNAL_INVOKE_SECRET: 'test-only', SENTRY_DSN: undefined }
  const previous = Object.fromEntries(Object.keys(settings).map(key => [key, Deno.env.get(key)]))
  let calls = 0
  let now = 0
  try {
    for (const [key, value] of Object.entries(settings)) {
      if (value === undefined) Deno.env.delete(key)
      else Deno.env.set(key, value)
    }
    if (advanceMs) Date.now = () => now
    globalThis.fetch = ((input: string | URL | Request) => {
      const url = String(input)
      if (url === 'https://database.example/rest/v1/rpc/upsert_api_error') return Promise.resolve(Response.json({}))
      if (url.startsWith('https://qlever.dev/')) return Promise.resolve(Response.json({}, { status: 503 }))
      assertEquals(url, 'https://overpass-api.de/api/interpreter')
      const response = responses[Math.min(calls, responses.length - 1)]
      calls++
      now += advanceMs
      return Promise.resolve(Response.json(response.body, { status: response.status }))
    }) as typeof fetch
    const response = await handler(new Request('https://functions.example/source-osm-venue', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': 'test-only' },
      body: JSON.stringify({ dry_run: true, batch_size: 1 }),
    }))
    return { status: response.status, body: await response.json(), calls }
  } finally {
    globalThis.fetch = originalFetch
    Date.now = originalNow
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) Deno.env.delete(key)
      else Deno.env.set(key, value)
    }
  }
}

Deno.test('OSM dry run reports unavailable when every city is unknown', async () => {
  const result = await run([{ status: 406, body: {} }])
  assertEquals(result.status, 503)
  assertEquals(result.body.success, false)
  assertEquals(result.body.error, 'overpass_unavailable')
  assertEquals(result.body.cities_unknown, 15)
  assertEquals(result.calls, 1)
})

Deno.test('an actual empty city answer stays valid while partial failures remain visible', async () => {
  const result = await run([{ status: 200, body: { elements: [] } }, { status: 200, body: { elements: [], remark: 'runtime error: Query timed out' } }])
  assertEquals(result.status, 200)
  assertEquals(result.body.success, true)
  assertEquals(result.body.items, 0)
  assertEquals(result.body.cities_unknown, 14)
})

Deno.test('a real named venue is returned by the bounded dry run', async () => {
  const result = await run([{ status: 200, body: { elements: [{ type: 'node', id: 7, tags: { name: 'Example venue' } }] } }])
  assertEquals(result.status, 200)
  assertEquals(result.body.items, 1)
  assertEquals(result.body.cities_queried, 1)
  assertEquals(result.body.cities_unknown, 0)
  assertEquals(result.calls, 1)
})

Deno.test('unavailable public provider is called once per run instead of hammered per city', async () => {
  const result = await run([{ status: 406, body: {} }], 30_000)
  assertEquals(result.status, 503)
  assertEquals(result.body.cities_queried, 15)
  assertEquals(result.calls, 1)
})
