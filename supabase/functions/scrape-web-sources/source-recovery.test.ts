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
Deno.test('scraped product rows satisfy the live marketplace validator and canonical drain contract', async () => {
  const { validateMarketplaceNormalized } = await import('../_shared/marketplace-pipeline-utils.ts')
  const row = mod.scrapedStagingRow({name:'Verified product',url:'https://shop.example/product',price_amount:12,currency:'EUR',raw_data:{'@type':'Product'}},source({target_table:'marketplace_products'}),'job-id')
  assertEquals([row.target_table,row.entity_type,row.source_name,row.source_entity_id],['marketplace_listings','marketplace','example','https://shop.example/product'])
  assertEquals(validateMarketplaceNormalized(row.normalized_data).errors,[])
  assertEquals(row.normalized_data.price,12)
  assertEquals(mod.scrapedStagingRow({name:'Melbourne',raw_data:{}},source({target_table:'cities'}),'job').entity_type,'city')
})
Deno.test('published city countries reach the canonical validator without guessing unknown destinations', async () => {
  const { validateCityNormalized } = await import('../_shared/venue-pipeline-utils.ts')
  const row = mod.scrapedStagingRow({name:'Brunswick',city:'Melbourne',country:'Australia',raw_data:{}},source({target_table:'cities'}),'job')
  assertEquals(validateCityNormalized(row.normalized_data).errors,[])
  const registered = source({slug:'gaycities-places',target_table:'cities',scrape_config:{extract:'city_list',country_by_host:{'newyork.gaycities.com':'United States'}}})
  const items = mod.extractFromPage('<a href="https://newyork.gaycities.com"><h4>New York City</h4></a><a href="https://unknown.gaycities.com"><h4>Unknown destination</h4></a>','https://www.gaycities.com/places',registered)
  assertEquals(items.map(x=>x.country),['United States',undefined])
})
Deno.test('Travel Gay calendar preserves explicit dates and excludes month placeholders and conflicting editions', () => {
  const event = (name: string, startDate: string, extra: Record<string,unknown> = {}) => ({'@type':'Event',name,startDate,endDate:startDate,location:{name:'TBA',address:{addressLocality:'Perth',addressCountry:'Australia'}},...extra})
  const html = `<script type="application/ld+json">${JSON.stringify([event('Perth PrideFest 2026','2026-11-08'),event('Auckland Pride 2027','2026-02-01'),event('Winter Pride 2026','2026-12-01',{month:'December'})])}</script>`
  const rows = mod.extractEventsFromPage(html,'https://www.travelgay.com/gay-pride-calendar',source({slug:'travelgay-pride',scrape_config:{}}))
  assertEquals(rows.map(r=>[r.name,r.start_date,r.venue_name]),[['Perth PrideFest 2026','2026-11-08T00:00:00.000Z',undefined]])
})
