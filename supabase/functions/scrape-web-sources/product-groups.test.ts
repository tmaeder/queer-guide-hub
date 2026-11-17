import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'

const descriptor = Object.getOwnPropertyDescriptor(Deno, 'serve')!
Object.defineProperty(Deno, 'serve', { configurable: true, value: () => ({}) })
let extract: typeof import('./index.ts').extractProductsFromPage
try { ({ extractProductsFromPage: extract } = await import('./index.ts')) }
finally { Object.defineProperty(Deno, 'serve', descriptor) }

const source = { name: 'Example Shop', scrape_config: {} } as Parameters<typeof extract>[2]
const parse = (value: unknown) => extract(`<script type="application/ld+json">${JSON.stringify(value)}</script>`, 'https://shop.example/products/shirt', source)
const variant = (size: string, price: string) => ({
  '@type': 'Product', name: `Shirt ${size}`, sku: size,
  offers: { '@type': 'Offer', url: `https://shop.example/products/shirt?variant=${size}`, price, priceCurrency: 'EUR' },
})

Deno.test('ProductGroup stages explicit variants with their own offer URLs and prices', () => {
  const items = parse({ '@type': 'ProductGroup', name: 'Shirt', url: 'https://shop.example/products/shirt',
    brand: { name: 'Actual Maker' }, description: 'Shared description', hasVariant: [variant('S', '10'), variant('M', '12')] })
  assertEquals(items.map(x => [x.name, x.url, x.price_amount, x.currency, x.brand]), [
    ['Shirt S', 'https://shop.example/products/shirt?variant=S', 10, 'EUR', 'Actual Maker'],
    ['Shirt M', 'https://shop.example/products/shirt?variant=M', 12, 'EUR', 'Actual Maker'],
  ])
  assertEquals(items[0].description, 'Shared description')
})

Deno.test('ProductGroup does not invent variants or reuse an umbrella offer price', () => {
  assertEquals(parse({ '@type': 'ProductGroup', name: 'Shirt' }), [])
  assertEquals(parse({ '@type': 'ProductGroup', name: 'Shirt', hasVariant: [null, 'bad', { '@type': 'Thing' }] }), [])
  const items = parse({ '@type': 'ProductGroup', offers: { price: '999' }, hasVariant: [{ '@type': 'Product', name: 'Actual variant' }] })
  assertEquals(items[0].price_amount, undefined)
})

Deno.test('standalone products and graph products survive malformed sibling nodes', () => {
  const product = variant('S', '10')
  assertEquals(parse({ '@graph': [null, product] }).map(x => x.name), ['Shirt S'])
  assertEquals(parse(product).map(x => x.name), ['Shirt S'])
})

Deno.test('ProductGroup extraction retains the per-source item bound', () => {
  const items = parse({ '@type': 'ProductGroup', hasVariant: Array.from({ length: 700 }, (_, i) => variant(String(i), '10')) })
  assertEquals(items.length, 500)
})
