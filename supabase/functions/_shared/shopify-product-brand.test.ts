import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { brandFromShopifyProduct } from './shopify-product-brand.ts'

const corrections = {
  'flex-graphene-condoms': { vendor: 'One World', brand: 'ONE Condoms' },
}

Deno.test('a product correction separates a condom brand from an unrelated book imprint', () => {
  const rules = { productBrandOverrides: corrections }
  assertEquals(brandFromShopifyProduct({ handle: 'flex-graphene-condoms', vendor: 'One World' }, 'Wildflower', rules), 'ONE Condoms')
  assertEquals(brandFromShopifyProduct({ handle: 'minor-feelings', vendor: 'One World' }, 'Wildflower', rules), 'One World')
  assertEquals(brandFromShopifyProduct({ handle: 'flex-graphene-condoms', vendor: 'One World' }, 'Another shop'), 'One World')
})

Deno.test('a changed vendor or a different handle cannot inherit an old correction', () => {
  const rules = { productBrandOverrides: corrections }
  assertEquals(brandFromShopifyProduct({ handle: 'flex-graphene-condoms', vendor: 'New Maker' }, 'Wildflower', rules), 'New Maker')
  assertEquals(brandFromShopifyProduct({ handle: 'flex-graphene-condoms-new', vendor: 'One World' }, 'Wildflower', rules), 'One World')
})

Deno.test('verified products can be attributed within an excluded generic category vendor', () => {
  const rules = {
    excludedVendors: ['essentials'],
    productBrandOverrides: { 'sk8erboy-locked-socks': { vendor: 'essentials', brand: 'Sk8erboy' } },
  }
  assertEquals(brandFromShopifyProduct({ handle: 'sk8erboy-locked-socks', vendor: ' essentials ' }, 'Cuffed', rules), 'Sk8erboy')
  assertEquals(brandFromShopifyProduct({ handle: 'unidentified-accessory', vendor: 'essentials' }, 'Cuffed', rules), null)
})

Deno.test('an explicit unknown maker does not fall back to the seller or a vendor alias', () => {
  assertEquals(brandFromShopifyProduct({ handle: 'anthology', vendor: 'Multiple Authors' }, 'Queer Lit', {
    vendorAliases: { 'Multiple Authors': 'Wrong Substitute' },
    productBrandOverrides: { anthology: { vendor: 'Multiple Authors', brand: null } },
  }), null)
})

Deno.test('malformed corrections leave existing vendor handling intact', () => {
  for (const entry of [null, [], 'ONE Condoms', 42, {}, { brand: 'ONE Condoms' },
    { vendor: 'One World' }, { vendor: 'One World', brand: '' },
    { vendor: 'One World', brand: 42 }, { vendor: '', brand: 'ONE Condoms' }]) {
    assertEquals(brandFromShopifyProduct({ handle: 'flex', vendor: 'One World' }, 'Wildflower', {
      productBrandOverrides: { flex: entry },
    }), 'One World')
  }
})

Deno.test('inherited configuration properties cannot correct a product', () => {
  const inherited = Object.create(corrections)
  assertEquals(brandFromShopifyProduct({ handle: 'flex-graphene-condoms', vendor: 'One World' }, 'Wildflower', {
    productBrandOverrides: inherited,
  }), 'One World')
  assertEquals(brandFromShopifyProduct({ handle: 'flex', vendor: 'One World' }, 'Wildflower', {
    productBrandOverrides: { flex: Object.create({ vendor: 'One World', brand: 'ONE Condoms' }) },
  }), 'One World')
})

Deno.test('unconfigured shops retain vendor aliases, exclusions and numeric-vendor fallbacks', () => {
  assertEquals(brandFromShopifyProduct({ handle: 'item', vendor: ' Mein Shop ' }, 'Store', {
    vendorAliases: { 'Mein Shop': 'UNTITLEDrubber' },
  }), 'UNTITLEDrubber')
  assertEquals(brandFromShopifyProduct({ handle: 'item', vendor: 'Book' }, 'Store', {
    excludedVendors: ['Book'],
  }), null)
  assertEquals(brandFromShopifyProduct({ handle: 'item', vendor: '9781728209982' }, 'Queer Lit'), 'Queer Lit')
})
