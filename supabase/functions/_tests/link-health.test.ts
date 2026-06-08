import { assertEquals } from 'jsr:@std/assert'
import { classifyHttpStatus, isDeadLink, probeLink } from '../_shared/link-health.ts'

Deno.test('classifyHttpStatus: 2xx ok, 3xx redirect', () => {
  assertEquals(classifyHttpStatus(200), 'ok')
  assertEquals(classifyHttpStatus(204), 'ok')
  assertEquals(classifyHttpStatus(301), 'redirect')
  assertEquals(classifyHttpStatus(302), 'redirect')
})

Deno.test('classifyHttpStatus: only 404/410 are dead', () => {
  assertEquals(classifyHttpStatus(404), 'broken')
  assertEquals(classifyHttpStatus(410), 'broken')
})

Deno.test('classifyHttpStatus: bot-block / rate-limit / HEAD-unsupported are NOT dead', () => {
  // The false-positive set that paused cron 198.
  assertEquals(classifyHttpStatus(401), 'blocked')
  assertEquals(classifyHttpStatus(403), 'blocked')
  assertEquals(classifyHttpStatus(405), 'blocked')
  assertEquals(classifyHttpStatus(429), 'blocked')
  assertEquals(isDeadLink(classifyHttpStatus(403)), false)
  assertEquals(isDeadLink(classifyHttpStatus(429)), false)
})

Deno.test('classifyHttpStatus: other 4xx + 5xx are ambiguous, never dead', () => {
  assertEquals(classifyHttpStatus(400), 'unknown')
  assertEquals(classifyHttpStatus(451), 'unknown')
  assertEquals(classifyHttpStatus(500), 'unknown')
  assertEquals(classifyHttpStatus(503), 'unknown')
  assertEquals(isDeadLink(classifyHttpStatus(503)), false)
})

Deno.test('isDeadLink: only broken', () => {
  for (const s of ['ok', 'redirect', 'blocked', 'timeout', 'unknown'] as const) {
    assertEquals(isDeadLink(s), false)
  }
  assertEquals(isDeadLink('broken'), true)
})

function mockFetch(byMethod: Record<string, number | 'throw'>): typeof fetch {
  return ((_url: string | URL | Request, init?: RequestInit) => {
    const m = (init?.method ?? 'GET') as string
    const v = byMethod[m]
    if (v === 'throw' || v === undefined) return Promise.reject(new Error('network'))
    return Promise.resolve(new Response(null, { status: v }))
  }) as unknown as typeof fetch
}

Deno.test('probeLink: HEAD 404 → broken', async () => {
  assertEquals(await probeLink('http://x', { fetchImpl: mockFetch({ HEAD: 404 }) }), 'broken')
})

Deno.test('probeLink: HEAD 403 but GET 200 → ok (no false dead)', async () => {
  assertEquals(await probeLink('http://x', { fetchImpl: mockFetch({ HEAD: 403, GET: 200 }) }), 'ok')
})

Deno.test('probeLink: HEAD 405 + GET 405 → blocked (alive, not dead)', async () => {
  assertEquals(await probeLink('http://x', { fetchImpl: mockFetch({ HEAD: 405, GET: 405 }) }), 'blocked')
})

Deno.test('probeLink: HEAD throws, GET 200 → ok', async () => {
  assertEquals(await probeLink('http://x', { fetchImpl: mockFetch({ HEAD: 'throw', GET: 200 }) }), 'ok')
})

Deno.test('probeLink: both throw → timeout (never auto-dead)', async () => {
  assertEquals(await probeLink('http://x', { fetchImpl: mockFetch({ HEAD: 'throw', GET: 'throw' }) }), 'timeout')
})
