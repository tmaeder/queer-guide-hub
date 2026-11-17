import { assertEquals, assertRejects } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { publicSourceProxyAllowed, fetchPublicSourceThroughProxy } from './public-source-proxy.ts'

Deno.test('public-source proxy permits only verified public publisher endpoints', () => {
  assertEquals(publicSourceProxyAllowed('https://www.starobserver.com.au/feed/'), false)
  assertEquals(publicSourceProxyAllowed('https://www.travelgay.com/gay-pride-calendar'), true)
  for (const url of ['https://www.reddit.com/r/lgbt/.rss', 'http://qvoicenews.com/feed/', 'https://qvoicenews.com/feed/?token=secret', 'https://user:password@qvoicenews.com/feed/', 'https://qvoicenews.com:444/feed/', 'https://qvoicenews.com.evil.example/feed/', 'https://qvoicenews.com/private']) assertEquals(publicSourceProxyAllowed(url), false)
})

Deno.test('public-source proxy retains RSS/metadata and uses a single basic-proxy request', async () => {
  const saved = globalThis.fetch
  let calls = 0
  globalThis.fetch = (_input, init) => {
    calls++
    const body = JSON.parse(String((init as { body?: unknown } | undefined)?.body))
    assertEquals([body.proxy, body.formats, body.onlyMainContent], ['basic', ['rawHtml'], false])
    return Promise.resolve(Response.json({ success: true, data: { rawHtml: '<rss><channel><item>Real source</item></channel></rss>', metadata: { statusCode: 200 } } }))
  }
  try {
    assertEquals(await fetchPublicSourceThroughProxy('https://qvoicenews.com/feed/', 'fixture-key', response => response.text()), '<rss><channel><item>Real source</item></channel></rss>')
    assertEquals(calls, 1)
  } finally { globalThis.fetch = saved }
})

Deno.test('quota exhaustion and upstream access failures remain errors', async () => {
  const saved = globalThis.fetch
  try {
    globalThis.fetch = () => Promise.resolve(new Response('no credits', { status: 402 }))
    await assertRejects(() => fetchPublicSourceThroughProxy('https://qvoicenews.com/feed/', 'fixture-key', r => r.text()), Error, 'credits exhausted')
    globalThis.fetch = () => Promise.resolve(Response.json({ success: true, data: { rawHtml: 'Access denied', metadata: { statusCode: 403 } } }))
    await assertRejects(() => fetchPublicSourceThroughProxy('https://qvoicenews.com/feed/', 'fixture-key', r => r.text()), Error, 'Publisher returned HTTP 403')
  } finally { globalThis.fetch = saved }
})
