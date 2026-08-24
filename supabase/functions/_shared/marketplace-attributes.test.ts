// Deno tests for the variant/attribute extractor (picked up by discovery in
// `npm run test:functions`). Fixtures mirror REAL raw shapes from
// marketplace_listing_sources.raw (Shopify products.json payloads) — not
// hand-idealized ones (parser_fixture_must_be_real).

import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import {
  attributesEqual,
  canonicalColor,
  canonicalColors,
  canonicalMaterial,
  canonicalSize,
  canonicalSizes,
  extractFeedAttributes,
  extractFit,
  extractGenre,
  extractShopifyVariants,
  mapOptionName,
  mergeAttributes,
} from './marketplace-attributes.ts'

Deno.test('mapOptionName covers the live corpus option names', () => {
  // Distribution measured 2026-08-23: Size/size/SIZE/Größe, Color/COLOR/Colour/Farbe,
  // Taglia/Colore (Italian), metal (jewellery), Title (placeholder — never an axis).
  assertEquals(mapOptionName('Size'), 'size')
  assertEquals(mapOptionName('SIZE'), 'size')
  assertEquals(mapOptionName('Größe'), 'size')
  assertEquals(mapOptionName('Taglia'), 'size')
  assertEquals(mapOptionName('Color'), 'color')
  assertEquals(mapOptionName('Colour'), 'color')
  assertEquals(mapOptionName('Farbe'), 'color')
  assertEquals(mapOptionName('Colore'), 'color')
  assertEquals(mapOptionName('metal'), 'material')
  assertEquals(mapOptionName('Material'), 'material')
  assertEquals(mapOptionName('Title'), null)
  assertEquals(mapOptionName('Style'), null)
  assertEquals(mapOptionName('Phone Model'), null)
})

Deno.test('canonicalSize: alpha ladder, folding, numerics, default-reject', () => {
  assertEquals(canonicalSize('M'), 'm')
  assertEquals(canonicalSize('XXL'), '2xl')
  assertEquals(canonicalSize('XXXL'), '3xl')
  assertEquals(canonicalSize('X-Large'), 'xl')
  assertEquals(canonicalSize('Extra Small'), 'xs')
  assertEquals(canonicalSize('2XL'), '2xl')
  assertEquals(canonicalSize('One Size'), 'one-size')
  assertEquals(canonicalSize('Einheitsgröße'), 'one-size')
  assertEquals(canonicalSize('W32'), 'w32')
  assertEquals(canonicalSize('32"'), 'w32')
  assertEquals(canonicalSize('38'), 'eu-38')
  assertEquals(canonicalSize('EU 40'), 'eu-40')
  assertEquals(canonicalSize('Default Title'), null)
  assertEquals(canonicalSize('Rainbow'), null)
  assertEquals(canonicalSize(''), null)
})

Deno.test('canonicalSizes splits combined values', () => {
  assertEquals(canonicalSizes('S/M'), ['s', 'm'])
  assertEquals(canonicalSizes('L - XL'), ['l', 'xl'])
  assertEquals(canonicalSizes('M'), ['m'])
})

Deno.test('canonicalColor: aliases (EN/DE), compounds, default-reject', () => {
  assertEquals(canonicalColor('Black'), 'black')
  assertEquals(canonicalColor('Schwarz'), 'black')
  assertEquals(canonicalColor('Burgundy'), 'red')
  assertEquals(canonicalColor('Charcoal'), 'grey')
  assertEquals(canonicalColor('Regenbogen'), 'rainbow')
  assertEquals(canonicalColor('Rose Gold'), 'rose-gold')
  assertEquals(canonicalColor('Matte Black'), 'black')
  assertEquals(canonicalColor('Dunkelblau'), 'navy')
  assertEquals(canonicalColor('Leopard'), null)
  assertEquals(canonicalColors('Black/Red'), ['black', 'red'])
})

Deno.test('canonicalMaterial folds metals and fabrics', () => {
  assertEquals(canonicalMaterial('Sterling Silver'), 'silver')
  assertEquals(canonicalMaterial('Gold Plated'), 'gold')
  assertEquals(canonicalMaterial('Edelstahl'), 'stainless-steel')
  assertEquals(canonicalMaterial('Faux Leather'), 'vegan-leather')
  assertEquals(canonicalMaterial('Organic Cotton'), 'cotton')
  assertEquals(canonicalMaterial('Unknownium'), null)
})

Deno.test('extractShopifyVariants: real two-axis product', () => {
  // Shape of a real Shopify products.json product as retained in raw.
  const raw = {
    options: [
      { name: 'Size', position: 1, values: ['S', 'M', 'XXL'] },
      { name: 'Color', position: 2, values: ['Black', 'Rainbow'] },
    ],
    variants: [
      { id: 111, title: 'S / Black', sku: 'TS-S-B', price: '29.00', available: true, inventory_quantity: 4, option1: 'S', option2: 'Black', option3: null, position: 1 },
      { id: 112, title: 'M / Rainbow', sku: 'TS-M-R', price: '31.00', available: false, inventory_quantity: 0, option1: 'M', option2: 'Rainbow', option3: null, position: 2 },
      { id: 113, title: 'XXL / Black', sku: 'TS-XXL-B', price: '31.00', available: true, inventory_quantity: 2, option1: 'XXL', option2: 'Black', option3: null, position: 3 },
    ],
  }
  const { variants, attributes } = extractShopifyVariants(raw, 'EUR')
  assertEquals(variants.length, 3)
  assertEquals(variants[0].option_size, 's')
  assertEquals(variants[0].option_color, 'black')
  assertEquals(variants[0].price, 29)
  assertEquals(variants[0].currency, 'EUR')
  assertEquals(variants[1].available, false)
  assertEquals(variants[2].option_size, '2xl')
  assertEquals(attributes.size, ['2xl', 'm', 's'])
  assertEquals(attributes.color, ['black', 'rainbow'])
})

Deno.test('extractShopifyVariants: Default Title placeholder yields no variants', () => {
  const raw = {
    options: [{ name: 'Title', position: 1, values: ['Default Title'] }],
    variants: [{ id: 9, title: 'Default Title', price: '12.00', option1: 'Default Title', option2: null, option3: null, position: 1 }],
  }
  const { variants, attributes } = extractShopifyVariants(raw, 'USD')
  assertEquals(variants.length, 0)
  assertEquals(attributes, {})
})

Deno.test('extractShopifyVariants: unmapped axes survive in options jsonb', () => {
  const raw = {
    options: [{ name: 'Style', position: 1 }],
    variants: [
      { id: 1, title: 'Classic', price: '10', option1: 'Classic', option2: null, option3: null, position: 1 },
      { id: 2, title: 'Bold', price: '10', option1: 'Bold', option2: null, option3: null, position: 2 },
    ],
  }
  const { variants } = extractShopifyVariants(raw, null)
  assertEquals(variants.length, 2)
  assertEquals(variants[0].options, { Style: 'Classic' })
  assertEquals(variants[0].option_size, null)
})

Deno.test('extractFeedAttributes: AWIN-style colour/condition/dimensions', () => {
  const attrs = extractFeedAttributes({ colour: 'Schwarz', condition: 'new', dimensions: '30 x 20 x 5 cm', ean: '4012345678901' })
  assertEquals(attrs.color, ['black'])
  assertEquals(attrs.condition, 'new')
  assertEquals(attrs.dimensions, '30 x 20 x 5 cm')
  assertEquals(attrs.gtin, '4012345678901')
})

Deno.test('extractGenre: context-gated, German vocabulary, fiction demoted', () => {
  assertEquals(extractGenre('A Queer Memoir of Berlin', null, 'books'), ['memoir'])
  assertEquals(extractGenre('Gedichte für uns', null, 'books'), ['poetry'])
  // fiction dropped when a specific genre matched
  assertEquals(extractGenre('A fantasy novel', null, 'books'), ['scifi-fantasy'])
  // not a book group -> nothing, even with genre words
  assertEquals(extractGenre('A Queer Memoir', null, 'tops'), [])
})

Deno.test('extractFit: explicit garment labels only', () => {
  assertEquals(extractFit("Men's fit tee", null), ['masc-cut'])
  assertEquals(extractFit('Unisex hoodie', null), ['unisex'])
  assertEquals(extractFit('Compression binder', null), ['compression'])
  // bare adjectives / identity words never fire
  assertEquals(extractFit('Tall tales of the village', null), [])
  assertEquals(extractFit('Trans pride shirt', null), [])
})

Deno.test('mergeAttributes unions arrays and keeps first scalars', () => {
  const merged = mergeAttributes(
    { size: ['m', 's'], color: ['black'] },
    { size: ['l'], condition: 'new' },
    { condition: 'used', dimensions: '10cm' },
  )
  assertEquals(merged.size, ['l', 'm', 's'])
  assertEquals(merged.color, ['black'])
  assertEquals(merged.condition, 'new')
  assertEquals(merged.dimensions, '10cm')
})

Deno.test('attributesEqual is order-insensitive', () => {
  assertEquals(attributesEqual({ size: ['s', 'm'], color: ['black'] }, { color: ['black'], size: ['m', 's'] }), true)
  assertEquals(attributesEqual({ size: ['s'] }, { size: ['s', 'm'] }), false)
  assertEquals(attributesEqual({}, {}), true)
})
