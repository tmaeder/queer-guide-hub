import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'

const descriptor = Object.getOwnPropertyDescriptor(Deno, 'serve')!
Object.defineProperty(Deno, 'serve', { configurable: true, value: () => ({}) })
const { extractWikiCountryTables, extractWikiList, publishedWikiRideDate, publishedEventDates, extractEventsFromPage, extractCityList, crawlNative, crawlViaSitemap, structuredProductLinks, allowedCrawlUrl, extractProductsFromPage } = await import('./index.ts')
Object.defineProperty(Deno, 'serve', descriptor)
const source = { name: 'Published rides', content_type: 'events', scrape_config: { event_type: 'World Naked Bike Ride' } } as unknown as Parameters<typeof extractWikiList>[2]

Deno.test('Wikipedia country tables support current mw-heading wrappers and legacy headings', () => {
  for (const heading of ['<div class="mw-heading mw-heading2"><h2>Australia</h2><span>[edit]</span></div>', '<h2><span class="mw-headline">Australia</span></h2>']) {
    const items = extractWikiCountryTables(`${heading}<table class="wikitable"><tr><th>Village</th><th>City</th></tr><tr><td>Brunswick</td><td>Melbourne</td></tr></table>`, 'https://en.wikipedia.org/wiki/List_of_gay_villages', source)
    assertEquals(items.map(x => [x.name, x.city, x.country]), [['Brunswick', 'Melbourne', 'Australia']])
  }
})

Deno.test('WNBR uses the published current ride date and skips flag links and references', () => {
  const html = '<nav><h3>Navigation</h3><ul><li><a>Wrong</a></li></ul></nav><div class="mw-parser-output"><h3>Canada</h3><ul><li><a class="image" title="File:Flag"><img></a><a href="/wiki/Toronto">Toronto</a>: 12 Jun 2027 (Previous rides: 13 Jun 2026)</li></ul><h2>References</h2><ul><li><a href="https://example.com">Reference only</a></li></ul></div>'
  const items = extractWikiList(html, 'https://wiki.worldnakedbikeride.org/wiki/List_of_rides', source)
  assertEquals(items.map(x => [x.city, x.country, x.start_date]), [['Toronto', 'Canada', '2027-06-12T00:00:00.000Z']])
})

Deno.test('WNBR never derives a date from ride history, placeholders or impossible days', () => {
  for (const text of ['Toronto: TBA (Previous rides: 13 Jun 2026)', 'Toronto: Unconfirmed 12 Jun 2027', 'Toronto: Cancelled 12 Jun 2027', 'Toronto: 31 Feb 2027', 'Toronto: June 2027']) assertEquals(publishedWikiRideDate(text), undefined)
})

Deno.test('event cards prefer machine dates and support anchor cards', () => {
  const configured = { ...source, url: 'https://events.example/list', scrape_config: { selectors: { card: 'a.event', title: 'h2', date: 'time' } } }
  const items = extractEventsFromPage('<a class="event" href="/show"><h2>Published event</h2><time datetime="2027-01-08T20:00:00+01:00">8 Januar</time></a>', configured.url, configured)
  assertEquals(items.map(x => [x.url, x.start_date]), [['https://events.example/show', '2027-01-08T19:00:00.000Z']])
  assertEquals(publishedEventDates('November 19, 2026 - November 21, 2026'), { start: '2026-11-19T00:00:00.000Z', end: '2026-11-21T00:00:00.000Z' })
  for (const invalid of ['December 29, 0026 - January 2, 2027', 'November 19', 'November 21, 2026 - November 19, 2026']) assertEquals(publishedEventDates(invalid), {})
})

Deno.test('city listings retain publisher city names without guessing countries', () => {
  const items = extractCityList('<a href="https://newyork.gaycities.com"><h4>New York City</h4></a>', 'https://www.gaycities.com/places', { ...source, scrape_config: {} })
  assertEquals(items.map(x => [x.city, x.country, x.url]), [['New York City', undefined, 'https://newyork.gaycities.com/']])
})

Deno.test('native discovery prioritizes product links over a full navigation menu', async () => {
  const original = globalThis.fetch
  const seen: string[] = []
  globalThis.fetch = input => {
    const url = String(input); seen.push(url)
    return Promise.resolve(new Response(url.endsWith('/shop') ? Array.from({ length: 40 }, (_, i) => `<a href="/navigation-${i}">Navigation</a>`).join('') + '<a href="/product/real">Product</a>' : '<h1>Product</h1>'))
  }
  try {
    const result = await crawlNative({ ...source, url: 'https://shop.example/shop', max_pages_per_run: 1, rate_limit_ms: 1, scrape_config: { include_paths: ['/product/*'], max_depth: 1 } })
    assertEquals(result.pages.map(x => x.url), ['https://shop.example/product/real'])
    assertEquals(seen, ['https://shop.example/shop', 'https://shop.example/product/real'])
  } finally { globalThis.fetch = original }
})

Deno.test('configured sitemap selects image-bearing products and refuses another origin', async () => {
  const original = globalThis.fetch
  const seen: string[] = []
  globalThis.fetch = input => {
    const url = String(input); seen.push(url)
    return Promise.resolve(new Response(url.endsWith('.xml') ? '<urlset><url><loc>https://shop.example/category</loc></url><url><loc>https://shop.example/real</loc><image:image><image:loc>https://shop.example/photo.jpg</image:loc></image:image></url></urlset>' : '<h1>Product</h1>', { headers: { 'content-type': url.endsWith('.xml') ? 'application/xml' : 'text/html' } }))
  }
  try {
    const configured = { ...source, url: 'https://shop.example/en', max_pages_per_run: 1, rate_limit_ms: 1, scrape_config: { sitemap_url: 'https://shop.example/english.xml', sitemap_require_images: true } }
    assertEquals((await crawlViaSitemap(configured)).pages.map(x => x.url), ['https://shop.example/real'])
    assertEquals(seen, ['https://shop.example/english.xml', 'https://shop.example/real'])
    assertEquals((await crawlViaSitemap({ ...configured, scrape_config: { sitemap_url: 'https://other.example/catalog.xml' } })).error, 'Configured sitemap must belong to the source origin')
    assertEquals(seen.length, 2)
  } finally { globalThis.fetch = original }
})

Deno.test('structured catalogues expose same-origin ItemList URLs without fabricating products', () => {
  const html = '<script type="application/ld+json">{"@graph":[{"@type":"CollectionPage","mainEntity":{"@type":"ItemList","itemListElement":[{"url":"https://shop.example/real"},{"url":"https://unrelated.example/other"},{"name":"No URL"}]}}]}</script>'
  assertEquals(structuredProductLinks(html, 'https://shop.example/catalogue'), ['https://shop.example/real'])
})

Deno.test('publisher subdomain discovery is opt-in and cannot leave the registered domain', () => {
  const source = 'https://www.gaycities.com/events'
  assertEquals(allowedCrawlUrl('https://newyork.gaycities.com/events/1', source), false)
  assertEquals(allowedCrawlUrl('https://newyork.gaycities.com/events/1', source, true), true)
  for (const url of ['https://evilgaycities.com/events/1', 'https://gaycities.com.evil.example/events/1', 'http://newyork.gaycities.com/events/1', 'https://newyork.gaycities.com:444/events/1', 'https://user:password@newyork.gaycities.com/events/1']) assertEquals(allowedCrawlUrl(url, source, true), false)
})

Deno.test('microdata recommendation products retain their own published deep links', () => {
  const product = (name: string, url: string) => `<article itemscope itemtype="https://schema.org/Product"><a itemprop="url" href="${url}"><span itemprop="name">${name}</span></a><meta itemprop="price" content="25.50"></article>`
  const items = extractProductsFromPage(product('Main', '/main') + product('Recommended', '/other#size-m') + product('Bad', 'javascript:alert(1)'), 'https://shop.example/main', source)
  assertEquals(items.map(x => [x.name, x.url, x.price_amount]), [['Main', 'https://shop.example/main', 25.5], ['Recommended', 'https://shop.example/other#size-m', 25.5]])
})
