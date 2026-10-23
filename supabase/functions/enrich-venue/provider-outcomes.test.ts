import { assertEquals, assertRejects } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { providerFetch, providerResults, ProviderUnavailable } from './provider-outcomes.ts'

Deno.test('configured sources retain their names when another provider has no key', () => {
  const rows = providerResults(['foursquare', 'tomtom', 'tripadvisor'], [
    { status: 'rejected', reason: new ProviderUnavailable(401) },
    { status: 'fulfilled', value: { website: 'https://venue.example' } },
    { status: 'fulfilled', value: null },
  ])
  assertEquals(rows.map(r => [r.source, r.outcome]), [
    ['foursquare', 'unavailable'], ['tomtom', 'found'], ['tripadvisor', 'empty'],
  ])
  assertEquals(rows[0].http_status, 401)
})

Deno.test('all credential failures remain visible; raw exceptions cannot expose keys', () => {
  const rows = providerResults(['tomtom', 'tripadvisor'], [
    { status: 'rejected', reason: new ProviderUnavailable(403) },
    { status: 'rejected', reason: new Error('https://api.example/?key=secret') },
  ])
  assertEquals(rows.filter(r => r.outcome === 'unavailable').length, 2)
  assertEquals(JSON.stringify(rows).includes('secret'), false)
})

Deno.test('provider HTTP errors cancel their body and preserve only the status', async () => {
  const original = globalThis.fetch
  let cancelled = false
  globalThis.fetch = () => Promise.resolve(new Response(new ReadableStream({ cancel() { cancelled = true } }), { status: 403 }))
  try {
    const error = await assertRejects(() => providerFetch('https://api.example/?key=secret'), ProviderUnavailable)
    assertEquals(error.message, 'Provider returned HTTP 403')
    assertEquals(cancelled, true)
  } finally { globalThis.fetch = original }
})

Deno.test('network exceptions are sanitized and redirects/timeouts are bounded', async () => {
  const original = globalThis.fetch
  globalThis.fetch = (_url, init) => {
    assertEquals(init?.redirect, 'error')
    assertEquals(init?.signal instanceof AbortSignal, true)
    return Promise.reject(new Error('failed https://api.example/?key=secret'))
  }
  try {
    const error = await assertRejects(() => providerFetch('https://api.example/?key=secret'), ProviderUnavailable)
    assertEquals(error.message, 'Provider request unavailable')
  } finally { globalThis.fetch = original }
})
