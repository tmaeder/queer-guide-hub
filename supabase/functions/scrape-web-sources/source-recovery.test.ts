import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
const descriptor = Object.getOwnPropertyDescriptor(Deno, 'serve')!
Object.defineProperty(Deno, 'serve', { configurable: true, value: () => ({}) })
let mod: typeof import('./index.ts')
try { mod = await import('./index.ts') }
finally { Object.defineProperty(Deno, 'serve', descriptor) }
const source = (extra: Record<string, unknown> = {}) => ({ slug: 'example', name: 'Example', url: 'https://shop.example/', scrape_config: {}, ...extra }) as Parameters<typeof mod.extractFromPage>[2]

Deno.test('Wikipedia country tables accept current wrapped headings and original headings', () => {
  const table = '<table class="wikitable"><tr><th>Village</th><th>City</th></tr><tr><td>Brunswick</td><td>Melbourne</td></tr></table>'
  for (const heading of ['<h2><span class="mw-headline">Australia</span></h2>', '<div class="mw-heading mw-heading2"><h2 id="Australia">Australia</h2><span>edit</span></div>']) {
    const rows = mod.extractWikiCountryTables(heading + table, 'https://en.wikipedia.org/wiki/List_of_gay_villages', source())
    assertEquals(rows.map(r => [r.city, r.country]), [['Melbourne', 'Australia']])
  }
})
Deno.test('WNBR uses the city link and explicit current ride date, never a previous date', () => {
  const html = '<h3>Belgium</h3><ul><li><a href="/wiki/File:status.gif"><img></a><a href="/wiki/Brussels">Brussels</a>: 20 Jun 2026 <span class="previous-rides">(21 Jun 2025)</span></li><li><a href="/wiki/Ghent">Ghent</a>: ? <span class="previous-rides">20 Jun 2025</span></li></ul>'
  const rows = mod.extractWikiList(html, 'https://wiki.worldnakedbikeride.org/wiki/List_of_rides', source({ content_type: 'events' }))
  assertEquals(rows.map(r => [r.city, r.country, r.start_date]), [['Brussels','Belgium','2026-06-20T00:00:00.000Z'],['Ghent','Belgium',undefined]])
})
Deno.test('GayCities directory extracts named destination hosts and excludes utility links', () => {
  const html = '<a aria-label="New York City" href="https://newyork.gaycities.com"><img></a><a aria-label="New York City" href="https://newyork.gaycities.com">New York</a><a aria-label="Blog" href="https://blog.gaycities.com">Blog</a><a aria-label="Other" href="https://other.example">Other</a>'
  const rows = mod.extractFromPage(html, 'https://www.gaycities.com/places', source({slug:'gaycities-places',scrape_config:{extract:'city_list',selectors:{card:'a[aria-label]'}}}))
  assertEquals(rows.map(r => [r.name,r.url]), [['New York City','https://newyork.gaycities.com/']])
})
Deno.test('bounded merchant crawl follows product cards before navigation consumes its queue', async () => {
  const original = globalThis.fetch
  const calls: string[] = []
  globalThis.fetch = (input) => {
    const url = String(input); calls.push(url)
    return Promise.resolve(new Response(url.endsWith('/product/real') ? '<h1>Real</h1>' : '<a href="/about">About</a>'.repeat(20) + '<a class="product" href="/product/real">Real</a>'))
  }
  try {
    const result = await mod.crawlNative(source({max_pages_per_run:1, rate_limit_ms:1, scrape_config:{link_selector:'a.product',include_paths:['/product/*']}}))
    assertEquals(calls, ['https://shop.example/','https://shop.example/product/real'])
    assertEquals(result.pages.map(p=>p.url), ['https://shop.example/product/real'])
  } finally { globalThis.fetch = original }
})
Deno.test('nested product microdata retains each product URL and does not borrow related prices', () => {
  const html = '<section itemscope itemtype="https://schema.org/Product"><meta itemprop="name" content="Main"><meta itemprop="url" content="/main"><article itemscope itemtype="https://schema.org/Product"><a href="/related"><span itemprop="name">Related</span></a><meta itemprop="price" content="12"><meta itemprop="priceCurrency" content="EUR"></article></section>'
  const rows = mod.extractProductsFromPage(html,'https://shop.example/main',source())
  assertEquals(rows.map(r=>[r.name,r.url,r.price_amount]),[['Main','https://shop.example/main',undefined],['Related','https://shop.example/related',12]])
})
