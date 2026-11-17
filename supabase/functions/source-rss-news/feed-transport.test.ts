import { assertEquals, assertRejects } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { STAR_OBSERVER_SYNDICATION } from './star-observer.ts'

const descriptor = Object.getOwnPropertyDescriptor(Deno, 'serve')!
Object.defineProperty(Deno, 'serve', { configurable: true, value: () => ({}) })
let mod: typeof import('./index.ts')
try { mod = await import('./index.ts') }
finally { Object.defineProperty(Deno, 'serve', descriptor) }

const feed = 'https://lavendermagazine.com/feed/'
const xml = '<rss><channel><item><title>Publisher story</title><link>https://www.starobserver.com.au/story</link><pubDate>Tue, 17 Nov 2026 10:00:00 GMT</pubDate></item></channel></rss>'

async function exercise(paidStatus: number, readerWorks: boolean) {
  const originalFetch = globalThis.fetch
  const values = { SUPABASE_URL: 'https://database.example', SUPABASE_SERVICE_ROLE_KEY: 'test-only', FIRECRAWL_API_KEY: 'test-only', EXTRACT_WORKER_URL: undefined, EXTRACT_WORKER_SECRET: undefined, INTERNAL_INVOKE_SECRET: undefined }
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, Deno.env.get(key)]))
  const seen: string[] = []
  const signals: AbortSignal[] = []
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) Deno.env.delete(key)
      else Deno.env.set(key, value)
    }
    globalThis.fetch = ((input: string | URL | Request, init?: { signal?: AbortSignal }) => {
      const url = String(input)
      seen.push(url)
      if (init?.signal) signals.push(init.signal)
      if (url === feed) return Promise.resolve(new Response('blocked', { status: 403 }))
      if (url.includes('/rpc/fetch_publisher_rss')) return Promise.resolve(Response.json({ message: 'reader unavailable' }, { status: 503 }))
      if (url === 'https://api.firecrawl.dev/v2/scrape') return Promise.resolve(paidStatus === 200 ? Response.json({ success: true, data: { rawHtml: xml } }) : new Response('no credits', { status: paidStatus }))
      if (url === `https://r.jina.ai/${feed}`) return Promise.resolve(new Response(readerWorks ? xml : '<html>Challenge</html>'))
      throw new Error(`Unexpected transport ${url}`)
    }) as typeof fetch
    const result = await mod.fetchFromRss(feed, false, 1)
    assertEquals(result.items.length, 1)
    assertEquals(signals.every(signal => signal === signals[0]), true)
    return seen
  } finally {
    globalThis.fetch = originalFetch
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) Deno.env.delete(key)
      else Deno.env.set(key, value)
    }
  }
}

Deno.test('verified paid feed route runs before expensive extraction and shares the total deadline', async () => {
  const seen = await exercise(200, false)
  assertEquals(seen, [feed, feed, 'https://database.example/rest/v1/rpc/fetch_publisher_rss', 'https://api.firecrawl.dev/v2/scrape'])
})
Deno.test('exhausted paid quota does not prevent a working public reader', async () => {
  const seen = await exercise(402, true)
  assertEquals(seen.at(-1), `https://r.jina.ai/${feed}`)
})
Deno.test('failed readers retain the actionable exhausted-credit error', async () => {
  await assertRejects(() => exercise(402, false), Error, 'Firecrawl credits exhausted')
})

Deno.test('Star Observer never contacts paid transports even when configured or when syndication fails', async () => {
  const originalFetch = globalThis.fetch
  const previous = Deno.env.get('FIRECRAWL_API_KEY')
  const seen: string[] = []
  try {
    Deno.env.set('FIRECRAWL_API_KEY', 'must-not-be-used')
    for (const status of [200, 503]) {
      globalThis.fetch = ((input: string | URL | Request) => {
        seen.push(String(input))
        assertEquals(String(input), STAR_OBSERVER_SYNDICATION)
        return Promise.resolve(new Response(xml.replace('Tue, 17 Nov 2026 10:00:00 GMT', new Date().toUTCString()).replace('https://www.starobserver.com.au/story', 'https://www.starobserver.com.au/news/story/245184'), { status }))
      }) as typeof fetch
      if (status === 200) assertEquals((await mod.fetchFromRss('https://www.starobserver.com.au/feed/', false, 1)).items.length, 1)
      else await assertRejects(() => mod.fetchFromRss('https://www.starobserver.com.au/feed/', false, 1), Error, 'syndication HTTP 503')
    }
    assertEquals(seen.length, 2)
  } finally {
    globalThis.fetch = originalFetch
    if (previous === undefined) Deno.env.delete('FIRECRAWL_API_KEY'); else Deno.env.set('FIRECRAWL_API_KEY', previous)
  }
})
