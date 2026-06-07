import { assertEquals, assert } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { extractProduct } from './marketplace-extract.ts'

const BASE = 'https://shop.example.com/p/rainbow-harness'

Deno.test('extracts JSON-LD Product description + images', () => {
  const html = `<!doctype html><html><head>
    <script type="application/ld+json">${JSON.stringify({
      '@type': 'Product',
      name: 'Rainbow Harness',
      description: 'Adjustable leather harness with pride-stitched trim.',
      image: ['/img/a.jpg', { url: 'https://cdn.example.com/b.jpg' }],
    })}</script></head><body></body></html>`
  const r = extractProduct(html, BASE)
  assertEquals(r.descMethod, 'jsonld')
  assert(r.description!.includes('pride-stitched'))
  assertEquals(r.imgMethod, 'jsonld')
  assertEquals(r.images, ['https://shop.example.com/img/a.jpg', 'https://cdn.example.com/b.jpg'])
})

Deno.test('does NOT take description from og (store tagline risk), but fills og image', () => {
  const html = `<!doctype html><html><head>
    <meta property="og:description" content="Store-wide tagline, not product-specific.">
    <meta property="og:image" content="/hero.png">
    </head><body></body></html>`
  const r = extractProduct(html, BASE)
  assertEquals(r.descMethod, 'none')
  assertEquals(r.description, null)
  assertEquals(r.imgMethod, 'og')
  assertEquals(r.images, ['https://shop.example.com/hero.png'])
})

Deno.test('detects soft-404 from og:description copy', () => {
  const html = `<!doctype html><html><head>
    <title>Not found</title>
    <meta property="og:description" content="The page you tried to access does not exist.">
    <meta property="og:image" content="/logo.png">
    </head><body></body></html>`
  const r = extractProduct(html, BASE)
  assertEquals(r.notFound, true)
  assertEquals(r.hasProductSchema, false)
})

Deno.test('flags hasProductSchema true when Product JSON-LD present', () => {
  const html = `<!doctype html><html><head>
    <script type="application/ld+json">${JSON.stringify({ '@type': 'Product', name: 'X' })}</script>
    </head><body></body></html>`
  const r = extractProduct(html, BASE)
  assertEquals(r.hasProductSchema, true)
})

Deno.test('de-dupes images and ignores data URIs', () => {
  const html = `<!doctype html><html><head>
    <meta property="og:image" content="https://cdn.example.com/x.jpg">
    <script type="application/ld+json">${JSON.stringify({
      '@type': 'Product',
      image: ['https://cdn.example.com/x.jpg', 'https://cdn.example.com/x.jpg'],
    })}</script>
    </head><body></body></html>`
  const r = extractProduct(html, BASE)
  assertEquals(r.images, ['https://cdn.example.com/x.jpg'])
})

Deno.test('strips on-origin cdn-cgi image-resizing segments', () => {
  const html = `<!doctype html><html><head>
    <script type="application/ld+json">${JSON.stringify({
      '@type': 'Product',
      image: 'https://shop.example.com/cdn-cgi/image/format=auto,onerror=redirect/media/p/1.jpg',
    })}</script></head><body></body></html>`
  const r = extractProduct(html, BASE)
  assertEquals(r.images, ['https://shop.example.com/media/p/1.jpg'])
})

Deno.test('returns none when nothing extractable', () => {
  const r = extractProduct('<html><head></head><body><p>hi</p></body></html>', BASE)
  assertEquals(r.descMethod, 'none')
  assertEquals(r.imgMethod, 'none')
  assertEquals(r.images, [])
  assertEquals(r.description, null)
})

Deno.test('never throws on garbage input', () => {
  const r = extractProduct('', BASE)
  assertEquals(r.images, [])
})
