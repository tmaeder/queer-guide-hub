import { assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { getPage } from './runtime.ts'

const url = 'https://www.prideplaces.org/search_results'
async function withFetch(mock: typeof fetch, fn: () => Promise<void>) {
  const original = globalThis.fetch
  globalThis.fetch = mock
  try { await fn() } finally { globalThis.fetch = original }
}
Deno.test('source fetch pins its host and refuses redirects and non-HTML responses', async () => {
  await withFetch((_url, init) => {
    assertEquals(new Headers((init as { headers?: HeadersInit })?.headers).get('connection'), 'close')
    assertEquals((init as { redirect?: string })?.redirect, 'error')
    assertEquals((init as { signal?: AbortSignal })?.signal instanceof AbortSignal, true)
    return Promise.resolve(new Response('html', { headers: { 'Content-Type': 'text/html' } }))
  }, async () => {
    assertEquals(await getPage(url), 'html')
    await assertRejects(() => getPage('https://evil.test/search_results'), Error, 'Off-source')
  })
  await withFetch(() => Promise.resolve(new Response('json', { headers: { 'Content-Type': 'application/json' } })), async () => {
    await assertRejects(() => getPage(url), Error, 'non-HTML')
  })
})
Deno.test('failed source requests and over-budget streams cannot become empty success', async () => {
  await withFetch(() => Promise.resolve(new Response('error', { status: 503 })), async () => {
    await assertRejects(() => getPage(url), Error, 'HTTP 503')
  })
  let cancelled = false
  await withFetch(() => Promise.resolve(new Response(new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(3_000_001)) },
    cancel() { cancelled = true },
  }), { headers: { 'Content-Type': 'text/html' } })), async () => {
    await assertRejects(() => getPage(url), Error, 'size budget')
    assertEquals(cancelled, true)
  })
})
