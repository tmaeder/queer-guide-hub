import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { robotsSitemaps, sitemapLocations, sitemapPathMatchers, readScrapeBody } from './scrape-bounds.ts'

Deno.test('robots sitemap directives preserve the full URL including scheme, port and query', () => {
  assertEquals(robotsSitemaps('User-agent: *\r\nSitemap: https://shop.example/sitemap.xml\r\n sitemap: https://shop.example:8443/map.xml?a=1&b=2 # comment'), [
    'https://shop.example/sitemap.xml', 'https://shop.example:8443/map.xml?a=1&b=2',
  ])
  assertEquals(robotsSitemaps('Sitemap: broken\nSitemap: file:///tmp/map.xml'), [])
})

Deno.test('sitemap locations distinguish index entries and decode XML URLs', () => {
  assertEquals([...sitemapLocations('<sitemapindex><sitemap><loc>https://shop.example/products.xml?a=1&amp;b=2</loc></sitemap></sitemapindex>', 'sitemap')], ['https://shop.example/products.xml?a=1&b=2'])
  const xml = '<urlset><url><loc><![CDATA[https://shop.example/products/one]]></loc></url><url><loc>https://shop.example/products/two</loc></url><url><loc>truncated'
  assertEquals([...sitemapLocations(xml, 'url')], ['https://shop.example/products/one', 'https://shop.example/products/two'])
  assertEquals([...sitemapLocations(xml, 'sitemap')], [])
})

Deno.test('sitemap location iteration stops without materializing the remaining catalogue', () => {
  const xml = '<urlset>' + '<url><loc>https://shop.example/products/one</loc></url>'.repeat(50_000) + '</urlset>'
  const iterator = sitemapLocations(xml, 'url')
  assertEquals(iterator.next().value, 'https://shop.example/products/one')
  iterator.return?.(undefined)
})

Deno.test('sitemap path globs retain exact matching and escape regex syntax', () => {
  const [pattern] = sitemapPathMatchers(['/products/a.b+*'])
  assertEquals(pattern.test('/products/a.b+one'), true)
  assertEquals(pattern.test('/products/axbOne'), false)
  assertEquals(pattern.test('/other/products/a.b+one'), false)
})

Deno.test('response byte budget cancels a streaming oversized body', async () => {
  let cancelled = false
  const response = new Response(new ReadableStream<Uint8Array>({
    pull(controller) { controller.enqueue(new TextEncoder().encode('12345678')) },
    cancel() { cancelled = true },
  }))
  assertEquals(await readScrapeBody(response, 10), '1234567812')
  assertEquals(cancelled, true)
})

Deno.test('small response is preserved and an incomplete trailing sitemap entry is ignored', async () => {
  const xml = '<urlset><url><loc>https://shop.example/a</loc></url><url><loc>unfinished'
  const text = await readScrapeBody(new Response(xml), 1000)
  assertEquals(text, xml)
  assertEquals([...sitemapLocations(text, 'url')], ['https://shop.example/a'])
})
