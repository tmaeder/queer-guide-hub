import { assertEquals, assertRejects } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { searchFoursquare } from './foursquare.ts'
import { ProviderUnavailable } from './provider-outcomes.ts'

Deno.test('Foursquare uses current authenticated API and maps the current Pro schema', async () => {
  const original = globalThis.fetch
  globalThis.fetch = (input, init) => {
    const url = new URL(String(input)), headers = new Headers(init?.headers)
    assertEquals(url.origin, 'https://places-api.foursquare.com')
    assertEquals(url.pathname, '/places/search')
    assertEquals(url.searchParams.get('query'), 'Name & place')
    assertEquals(url.href.includes('test-key'), false)
    assertEquals(headers.get('authorization'), 'Bearer test-key')
    assertEquals(headers.get('x-places-api-version'), '2025-06-17')
    assertEquals(url.searchParams.get('fields')?.includes('rating'), false)
    return Promise.resolve(Response.json({ results: [{ name: 'Name', latitude: 47, longitude: 8,
      location: { address: 'Street 1', country: 'CH' }, email: 'hello@example.test', tel: '+41441234567' }] }))
  }
  try {
    const result = await searchFoursquare('Name & place', 'test-key')
    assertEquals(result?.latitude, 47)
    assertEquals(result?.longitude, 8)
    assertEquals(result?.address, 'Street 1')
    assertEquals(result?.email, 'hello@example.test')
  } finally { globalThis.fetch = original }
})

Deno.test('Foursquare availability failures are distinct from an empty successful result', async () => {
  const original = globalThis.fetch
  try {
    globalThis.fetch = () => Promise.resolve(Response.json({ results: [] }))
    assertEquals(await searchFoursquare('Example', 'test-key'), null)
    globalThis.fetch = () => Promise.resolve(Response.json({ error: 'bad credential' }, { status: 401 }))
    const error = await assertRejects(() => searchFoursquare('Example', 'test-key'), ProviderUnavailable)
    assertEquals(error.message, 'Provider returned HTTP 401')
    globalThis.fetch = () => Promise.resolve(Response.json({ unexpected: true }))
    await assertRejects(() => searchFoursquare('Example', 'test-key'), ProviderUnavailable)
  } finally { globalThis.fetch = original }
})

Deno.test('Foursquare closed or disputed candidates are not offered as enrichment', async () => {
  const original = globalThis.fetch
  try {
    for (const extra of [{ date_closed: '2026-01-01' }, { unresolved_flags: ['duplicate'] }]) {
      globalThis.fetch = () => Promise.resolve(Response.json({ results: [{ name: 'Example', ...extra }] }))
      assertEquals(await searchFoursquare('Example', 'test-key'), null)
    }
  } finally { globalThis.fetch = original }
})
