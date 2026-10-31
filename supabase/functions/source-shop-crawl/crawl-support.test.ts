import { allowedSitemap, decodeSitemapBytes, readCanonicalPageUrl, readCatalogProductLinks, readCrawlCategoryLabels, readSelectedProduct, readSitemapLocations, readStaticSchema } from './crawl-support.ts'
function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${JSON.stringify(actual)} != ${JSON.stringify(expected)}`)
}
Deno.test('crawl categories preserve explicit labels and leave unknown catalogs uncategorized', () => {
  equal(readCrawlCategoryLabels(), { category: 'Other', subcategory: 'Other' })
  equal(readCrawlCategoryLabels(' ', ''), { category: 'Other', subcategory: 'Other' })
  equal(readCrawlCategoryLabels('Books', 'Books and Art'), { category: 'Books', subcategory: 'Books and Art' })
  equal(readCrawlCategoryLabels(' Apparel ', 'Underwear'), { category: 'Apparel', subcategory: 'Underwear' })
  equal(readCrawlCategoryLabels('Film', 'Film'), { category: 'Film', subcategory: 'Film' })
})
Deno.test('sitemap locations preserve CDATA URLs and decode ordinary XML entities', () => {
  equal(readSitemapLocations(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc><![CDATA[https://shop.example/en/socks/11-socks.html?a=1&b=2]]></loc></url><url><loc> https://shop.example/product?a=1&amp;b=2 </loc></url><url><loc> </loc></url></urlset>`), ['https://shop.example/en/socks/11-socks.html?a=1&b=2', 'https://shop.example/product?a=1&b=2'])
  equal(readSitemapLocations('<sitemapindex><sitemap><loc><![CDATA[https://shop.example/products.xml]]></loc></sitemap></sitemapindex>'), ['https://shop.example/products.xml'])
})
Deno.test('sitemap decoding handles raw gzip and bounds expanded data', async () => {
  const xml = '<urlset><url><loc>https://shop.example/café</loc></url></urlset>'
  const plain = new TextEncoder().encode(xml)
  const zipped = new Uint8Array(await new Response(new Blob([plain]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer())
  equal(await decodeSitemapBytes(plain), xml)
  equal(await decodeSitemapBytes(zipped), xml)
  const repeated = new TextEncoder().encode(xml.repeat(100))
  const compressed = new Uint8Array(await new Response(new Blob([repeated]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer())
  let error = ''
  try { await decodeSitemapBytes(compressed, 1000) } catch (e) { error = (e as Error).message }
  equal(error, 'Expanded sitemap exceeds size limit')
})
Deno.test('opt-in mixed sitemap filtering keeps product URLs with image metadata only', () => {
  const xml = `<urlset xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"><url><loc>https://shop.example/category</loc></url><url><loc><![CDATA[https://shop.example/product]]></loc><image:image><image:loc>https://shop.example/photo.jpg</image:loc></image:image></url><url><loc>https://shop.example/policy</loc><image:image><image:title>Empty image</image:title></image:image></url></urlset>`
  equal(readSitemapLocations(xml, true), ['https://shop.example/product'])
  equal(readSitemapLocations(xml), ['https://shop.example/category', 'https://shop.example/product', 'https://shop.example/policy'])
  equal(readSitemapLocations('<urlset><url><loc>https://shop.example/product</loc><img:image xmlns:img="http://www.google.com/schemas/sitemap-image/1.1"><img:loc>https://shop.example/photo.jpg</img:loc></img:image></url></urlset>', true), ['https://shop.example/product'])
})
Deno.test('sitemap trust allows only the merchant and exact owned Salzgeber snapshots', () => {
  equal(allowedSitemap('https://www.shop.example/sitemap.xml', 'shop.example'), true)
  equal(allowedSitemap('https://img.queer.guide/imports/salzgeber-film-sitemap.xml', 'salzgeber.shop'), true)
  for (const url of ['https://img.queer.guide/imports/other.xml', 'https://img.queer.guide/imports/salzgeber-film-sitemap.xml?url=http://localhost', 'https://img.queer.guide.evil.example/imports/salzgeber-film-sitemap.xml', 'http://salzgeber.shop/sitemap.xml', 'https://user:password@salzgeber.shop/sitemap.xml', 'https://salzgeber.shop:8443/sitemap.xml']) equal(allowedSitemap(url, 'salzgeber.shop'), false)
  equal(allowedSitemap('https://img.queer.guide/imports/salzgeber-film-sitemap.xml', 'unrelated.example'), false)
})
Deno.test('CSS selectors extract real values without claiming stock', () => {
  const product = readSelectedProduct(`<meta name="description" content="A film &amp; its story"><h1 id="productTitle">A Film</h1><img id="zoomImg" src="/images/film.jpg"><div id="productPrice">1.234,56 €</div><p>ArtNr.: DVD123</p>`, 'https://shop.example/film.html', { name: '#productTitle', image: '#zoomImg', price: '#productPrice', description: 'meta[name="description"]', sku_regex: 'ArtNr\\.:\\s*(\\S+)' }, 'EUR')
  equal(product, { name: 'A Film', description: 'A film & its story', images: ['https://shop.example/images/film.jpg'], price: 1234.56, currency: 'EUR', inStock: null, sku: 'DVD123', author: null })
})
Deno.test('absent fields do not become fabricated product values', () => {
  equal(readSelectedProduct('<h1>Error</h1>', 'https://shop.example', { name: '#productTitle' }), null)
  const missing = readSelectedProduct('<h1 id="name">Film</h1><div id="price">Contact us</div>', 'https://shop.example', { name: '#name', price: '#price' })
  equal(missing?.price, null)
  equal(missing?.images, [])
  equal(readSelectedProduct('<h1>Film</h1><img src="javascript:alert(1)">', 'https://shop.example', { name: 'h1', image: 'img' })?.images, [])
})
Deno.test('locale grouping and decimals preserve the actual price', () => {
  equal(readSelectedProduct('<h1>Film</h1><b>$1,234.56</b>', 'https://shop.example', { name: 'h1', price: 'b' })?.price, 1234.56)
  equal(readSelectedProduct('<h1>Film</h1><b>19,95 EUR</b>', 'https://shop.example', { name: 'h1', price: 'b' })?.price, 19.95)
})

Deno.test('static microdata preserves nested offers and excludes unrelated breadcrumb scopes', () => {
  const page = readStaticSchema(`<title>A Film</title><article itemscope itemtype="https://schema.org/Product"><h1 itemprop="name">A Film</h1><img itemprop="image" src="/film.jpg"><div itemprop="offers" itemscope itemtype="https://schema.org/Offer"><meta itemprop="price" content="14.95"><meta itemprop="priceCurrency" content="EUR"></div><div itemscope itemtype="https://schema.org/BreadcrumbList"><b itemprop="name">Not the product</b></div></article>`)
  equal(page.microdata, { name: 'A Film', image: '/film.jpg', offers: { price: '14.95', priceCurrency: 'EUR' } })
})
Deno.test('static JSON-LD flattens arrays and graphs without inventing a product', () => {
  const page = readStaticSchema(`<script type="application/ld+json">{"@graph":[{"@type":"Product","name":"A Film","offers":{"price":"14.95"}}]}</script>`)
  equal(page.jsonLd.find(x => x['@type'] === 'Product')?.name, 'A Film')
  equal(readStaticSchema('<h1>Page not found</h1>').microdata, undefined)
})

Deno.test('removed-item canonicals are exact URLs and do not invent product data', () => {
  const html = '<title>Shop homepage</title><link rel="canonical" href="/shopping/">'
  equal(readCanonicalPageUrl(html, 'https://shop.example/shopping/old-film.html'), 'https://shop.example/shopping/')
  equal(readSelectedProduct(html, 'https://shop.example/shopping/old-film.html', { name: '#productTitle' }), null)
  equal(readCanonicalPageUrl('<h1>No canonical</h1>', 'https://shop.example/product'), null)
  equal(readCanonicalPageUrl('<link rel="canonical" href="javascript:alert(1)">', 'https://shop.example/product'), null)
  equal(readCanonicalPageUrl('<link rel="canonical" href="/product"><h1 id="productTitle">Film</h1>', 'https://shop.example/product'), 'https://shop.example/product')
})

Deno.test('HTML catalog discovery uses explicit product links and resolves relative URLs', () => {
  const html = `<a href="/about">Navigation</a><div class="product"><a href="../rubber-shirt#details">Shirt</a><a href="../rubber-shirt">Same shirt</a><a href="https://www.shop.example/rubber-shorts?a=1&amp;b=2">Shorts</a></div>`
  equal(readCatalogProductLinks(html, 'https://www.shop.example/catalog/new', '.product a'), ['https://www.shop.example/rubber-shirt', 'https://www.shop.example/rubber-shorts?a=1&b=2'])
})
Deno.test('HTML catalog discovery rejects off-host and unsafe links and ignores base tags', () => {
  const html = `<base href="https://other.example/"><a href="/safe">Safe</a><a href="https://other.example/evil">Off-host</a><a href="https://shop.example.evil.test/evil">Suffix</a><a href="https://user:password@shop.example/evil">Credentials</a><a href="https://shop.example:8443/evil">Port</a><a href="http://shop.example/evil">HTTP</a><a href="javascript:alert(1)">Script</a><a href="#section">Fragment</a><a href="https://[">Broken</a>`
  equal(readCatalogProductLinks(html, 'https://shop.example/catalog', 'a'), ['https://shop.example/safe'])
  let error = ''
  try { readCatalogProductLinks(html, 'https://shop.example/catalog', '') } catch (e) { error = (e as Error).message }
  equal(error, 'HTML catalog requires a product link selector')
})
