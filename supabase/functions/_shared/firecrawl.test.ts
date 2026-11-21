import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { firecrawlPage, firecrawlScrape } from './firecrawl.ts'

Deno.test('firecrawlScrape posts the body with bearer auth to the chosen API version', async () => {
  let seen: { url: string; init: RequestInit } | null = null
  const fetcher = ((url: string, init: RequestInit) => { seen = { url, init }; return Promise.resolve(new Response('{}')) }) as unknown as typeof fetch
  await firecrawlScrape('k', { url: 'https://example.com', formats: ['rawHtml'] }, { version: 'v1', redirect: 'error', fetcher })
  assertEquals(seen!.url, 'https://api.firecrawl.dev/v1/scrape')
  assertEquals(seen!.init.method, 'POST')
  assertEquals(seen!.init.redirect, 'error')
  assertEquals((seen!.init.headers as Record<string, string>).Authorization, 'Bearer k')
  assertEquals(JSON.parse(String(seen!.init.body)), { url: 'https://example.com', formats: ['rawHtml'] })
})

Deno.test('firecrawlPage reads v2, v1 and data-less bodies', () => {
  const v2 = firecrawlPage({ success: true, data: { rawHtml: '<p>', markdown: '# t', metadata: { statusCode: 200, url: 'https://a.test/' } } })
  assertEquals([v2.success, v2.rawHtml, v2.markdown, v2.statusCode, v2.url], [true, '<p>', '# t', 200, 'https://a.test/'])
  assertEquals(firecrawlPage({ data: { html: '<v1>' } }).rawHtml, '<v1>')
  assertEquals(firecrawlPage({ rawHtml: '<flat>', metadata: { sourceURL: 'https://b.test/' } }).url, 'https://b.test/')
  assertEquals(firecrawlPage({ success: false }).success, false)
  assertEquals(firecrawlPage(null).rawHtml, undefined)
})
