import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'

const savedServe = Deno.serve
Deno.serve = (() => ({})) as unknown as typeof Deno.serve
let crawl: typeof import('./index.ts').crawlViaSitemap
try { ({ crawlViaSitemap: crawl } = await import('./index.ts')) } finally { Deno.serve = savedServe }

const source = {
  url: 'https://shop.example/collections/all', slug: 'fixture', user_agent: 'test',
  scrape_config: {}, max_pages_per_run: 5, rate_limit_ms: 0,
} as Parameters<typeof crawl>[0]

Deno.test('sitemap discovery shares eight fetches across all robots roots', async () => {
  const savedFetch = globalThis.fetch
  const fetched: string[] = []
  globalThis.fetch = async (input) => {
    const url = String(input)
    if (url.endsWith('/robots.txt')) return new Response(
      Array.from({ length: 20 }, (_, i) => `Sitemap: https://shop.example/root-${i}.xml`).join('\n'),
    )
    fetched.push(url)
    return new Response('<urlset/>', { headers: { 'content-type': 'application/xml' } })
  }
  try {
    const result = await crawl(source)
    assertEquals(result.pages, [])
    assertEquals(fetched.length, 8)
    assertEquals(fetched.at(-1), 'https://shop.example/root-7.xml')
  } finally { globalThis.fetch = savedFetch }
})

Deno.test('a depleted nested sitemap budget stops traversal and polite delays', async () => {
  const savedFetch = globalThis.fetch
  const savedTimeout = globalThis.setTimeout
  const fetched: string[] = []
  let politeDelays = 0
  globalThis.setTimeout = ((...parameters: Parameters<typeof savedTimeout>) => {
    const [handler, timeout, ...args] = parameters
    if (timeout === 500) politeDelays++
    return savedTimeout(handler, timeout === 500 ? 0 : timeout, ...args)
  }) as typeof setTimeout
  globalThis.fetch = async (input) => {
    const url = String(input)
    if (url.endsWith('/robots.txt')) return new Response('Sitemap: https://shop.example/index.xml')
    fetched.push(url)
    const xml = url.endsWith('/index.xml')
      ? '<sitemapindex>' + Array.from({ length: 20 }, (_, i) =>
        `<sitemap><loc>https://shop.example/products-${i}.xml</loc></sitemap>`).join('') + '</sitemapindex>'
      : '<urlset/>'
    return new Response(xml, { headers: { 'content-type': 'application/xml' } })
  }
  try {
    const result = await crawl(source)
    assertEquals(result.pages, [])
    assertEquals(fetched.length, 8)
    assertEquals(politeDelays, 6)
  } finally {
    globalThis.fetch = savedFetch
    globalThis.setTimeout = savedTimeout
  }
})
