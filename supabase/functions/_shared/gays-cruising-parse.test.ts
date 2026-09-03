import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import {
  COUNTRY_TOKENS,
  dedupeBySourceId,
  parseSitemapLocs,
  parseSpotPage,
  parseSpotUrl,
  splitNameAndCity,
} from './gays-cruising-parse.ts'

// ────────────────────────────────────────────────────────────
// Fixtures are SYNTHETIC, built to the structure measured on 2026-08-30 (slug
// shape, sitemap element names, schema.org Place). They are not captured page
// bytes: the source carries no licence, and a parser is testable from its shape
// alone. The edge cases below are therefore chosen, not sampled — which is the
// better test anyway.
// ────────────────────────────────────────────────────────────

const placePage = (name: string, url: string, geo?: { lat: string; lng: string }) => `
<html><head>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Place","name":${JSON.stringify(name)},
 "url":${JSON.stringify(url)},
 "description":"Informacion de la zona cruising. Localizacion, comentarios y zonas cercanas."
 ${geo ? `,"geo":{"@type":"GeoCoordinates","latitude":"${geo.lat}","longitude":"${geo.lng}"}` : ''}}
</script>
</head><body></body></html>`

Deno.test('parseSitemapLocs reads a sitemap index', () => {
  const xml = `<?xml version="1.0"?><sitemapindex>
    <sitemap><loc>https://x/es/a_1.xml</loc><lastmod>2025-03-01</lastmod></sitemap>
    <sitemap><loc>https://x/de/a_1.xml</loc><lastmod>2025-03-01</lastmod></sitemap>
  </sitemapindex>`
  assertEquals(parseSitemapLocs(xml), ['https://x/es/a_1.xml', 'https://x/de/a_1.xml'])
})

Deno.test('parseSpotUrl recovers id, lang and country token', () => {
  const p = parseSpotUrl('https://www.gays-cruising.com/es/cruising/foo_bar_nyon_suisse_83162')
  assertEquals(p?.sourceId, '83162')
  assertEquals(p?.lang, 'es')
  assertEquals(p?.countryToken, 'suisse')
})

Deno.test('country token is matched longest-first, not "token before the id"', () => {
  // The naive split takes `unidos` and maps nothing. estados_unidos must win.
  const p = parseSpotUrl('https://x/es/cruising/some_place_dallas_estados_unidos_37498')
  assertEquals(p?.countryToken, 'estados_unidos')
  assertEquals(COUNTRY_TOKENS[p!.countryToken!], 'US')
})

Deno.test('a slug with no trailing id is rejected rather than guessed', () => {
  assertEquals(parseSpotUrl('https://x/es/cruising/no_numeric_suffix'), null)
})

Deno.test('an unknown country token yields undefined, never a guess or empty string', () => {
  const page = placePage('Somewhere, Sousse', 'https://x/es/cruising/somewhere_sousse_tunisie_5')
  const spot = parseSpotPage(page, 'https://x/es/cruising/somewhere_sousse_tunisie_5')
  // `tunisie` is not in the partial map — undefined, and specifically NOT ''
  // which would violate venues_country_iso2_check.
  assertEquals(spot?.countryCode, undefined)
  assertEquals(Object.prototype.hasOwnProperty.call(spot, 'countryCode'), true)
})

Deno.test('name and city split on the LAST comma', () => {
  assertEquals(splitNameAndCity('Signy centre WC etage coop, Nyon'), {
    name: 'Signy centre WC etage coop',
    city: 'Nyon',
  })
  // A venue name containing a comma keeps it.
  assertEquals(splitNameAndCity('Bar Le Nord, Sud, Lyon'), { name: 'Bar Le Nord, Sud', city: 'Lyon' })
  // No comma -> no city invented.
  assertEquals(splitNameAndCity('Cruising Point'), { name: 'Cruising Point' })
})

Deno.test('parseSpotPage returns facts and NO prose field', () => {
  const url = 'https://x/es/cruising/signy_nyon_suisse_83162'
  const spot = parseSpotPage(placePage('Signy centre, Nyon', url, { lat: '46.39', lng: '6.23' }), url)
  assertEquals(spot?.sourceId, '83162')
  assertEquals(spot?.name, 'Signy centre')
  assertEquals(spot?.city, 'Nyon')
  assertEquals(spot?.countryCode, 'CH')
  assertEquals(spot?.lat, 46.39)
  assertEquals(spot?.lng, 6.23)
  // The fixture carries a description; the parser must not surface it anywhere.
  assertEquals(JSON.stringify(spot).toLowerCase().includes('informacion'), false)
  assertEquals(Object.keys(spot!).includes('description'), false)
})

Deno.test('a lone coordinate is not a location, and 0/0 is not a location', () => {
  const url = 'https://x/es/cruising/a_b_espana_1'
  const half = parseSpotPage(
    placePage('A, B', url).replace('"url"', '"geo":{"latitude":"41.4"},"url"'),
    url,
  )
  assertEquals(half?.lat, undefined)
  const nullIsland = parseSpotPage(placePage('A, B', url, { lat: '0', lng: '0' }), url)
  assertEquals(nullIsland?.lat, undefined)
})

Deno.test('a page with no Place returns null rather than a defective row', () => {
  assertEquals(parseSpotPage('<html><body>nothing</body></html>', 'https://x/es/cruising/a_1'), null)
})

Deno.test('malformed JSON-LD does not throw and does not abort later blocks', () => {
  const url = 'https://x/es/cruising/a_b_espana_9'
  const html = `<script type="application/ld+json">{ broken</script>` + placePage('A, B', url)
  assertEquals(parseSpotPage(html, url)?.sourceId, '9')
})

Deno.test('dedupeBySourceId collapses the per-language duplicates', () => {
  // The same spot as it appears in the es/de/fr sitemaps: identical id.
  const spots = ['es', 'de', 'fr'].map((lang) => ({
    sourceId: '83162',
    name: 'Signy centre',
    url: `https://x/${lang}/cruising/signy_nyon_suisse_83162`,
  }))
  const out = dedupeBySourceId([...spots, { sourceId: '99', name: 'Other', url: 'https://x/es/cruising/o_99' }])
  assertEquals(out.length, 2)
  assertEquals(out[0].url.includes('/es/'), true) // first occurrence wins
})
