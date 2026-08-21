// Unit tests for the spartacus.gayguide.travel listing parsers.
// Run with: cd supabase/functions && deno test --allow-env _shared/spartacus-parse.test.ts
//
// Every fixture below is a verbatim excerpt of a real page fetched from
// spartacus.gayguide.travel — the escaping quirks are the point, so do not
// "tidy" them.
import { assertEquals } from 'jsr:@std/assert'
import {
  fixMojibake,
  parseDetailUrl,
  parseMarkers,
  parseCountries,
  mapCategory,
} from './spartacus-parse.ts'

Deno.test('parseDetailUrl handles the two-segment (country/city) form', () => {
  assertEquals(parseDetailUrl('/goingout/malta/malta-valletta/2063_Tom+Bar'), {
    vertical: 'goingout',
    country: 'malta',
    region: null,
    city: 'malta-valletta',
    id: '2063',
  })
})

Deno.test('parseDetailUrl handles the three-segment (country/region/city) form', () => {
  // Regression: federal countries insert a province tier. Requiring exactly
  // two geo segments dropped Canada entirely (0 of 93) and would have dropped
  // the USA (1,135 venues, the largest country in the corpus).
  assertEquals(parseDetailUrl('/goingout/canada/quebec/montreal/65079_1000+Grammes'), {
    vertical: 'goingout',
    country: 'canada',
    region: 'quebec',
    city: 'montreal',
    id: '65079',
  })
})

Deno.test('parseDetailUrl reads the saunas vertical', () => {
  const got = parseDetailUrl('https://spartacus.gayguide.travel/saunas/germany/berlin/1234_Some+Sauna')
  assertEquals(got?.vertical, 'saunas')
  assertEquals(got?.id, '1234')
})

Deno.test('parseDetailUrl rejects non-detail URLs', () => {
  assertEquals(parseDetailUrl('/goingout/search/'), null)
  assertEquals(parseDetailUrl('/goingout/malta'), null)
  assertEquals(parseDetailUrl('https://example.com/'), null)
})

Deno.test('fixMojibake reverses byte-wise double encoding', () => {
  assertEquals(fixMojibake('Bravó'), 'Bravó')
  assertEquals(fixMojibake('Cafe Babalú'), 'Cafe Babalú')
  assertEquals(fixMojibake('DÃ¼sseldorf'), 'Düsseldorf')
})

Deno.test('fixMojibake leaves already-correct text untouched', () => {
  // The guard matters: detail pages are clean UTF-8, and running them through
  // the reversal would corrupt them.
  assertEquals(fixMojibake('Bravó'), 'Bravó')
  assertEquals(fixMojibake('Tom Bar'), 'Tom Bar')
  assertEquals(fixMojibake('Fjöruborðið'), 'Fjöruborðið')
  assertEquals(fixMojibake(''), '')
})

const MARKERS_HTML = String.raw`
var map = L.map('map-canvas', {center: [35.92, 14.49], zoom: 13});
var markers = [[35.9223429,14.4900123,"barsmarker.png","AXM","<b><a href=\"https:\/\/spartacus.gayguide.travel\/goingout\/malta\/malta-sliema\/97370_AXM\">AXM<\/a><\/b>"],[36.0611111,14.2091667,"restaurantsmarker.png","Salvina's","<b><a href=\"https:\/\/spartacus.gayguide.travel\/goingout\/malta\/gozo-gharb\/16064_Salvina%27s\">Salvina's<\/a><\/b>"]];
var latlngbounds = [];
`

Deno.test('parseMarkers extracts coordinates, category and id', () => {
  const got = parseMarkers(MARKERS_HTML)
  assertEquals(got.length, 2)
  assertEquals(got[0].id, '97370')
  assertEquals(got[0].name, 'AXM')
  assertEquals(got[0].marker, 'bars')
  assertEquals(got[0].lat, 35.9223429)
  assertEquals(got[0].lng, 14.4900123)
  assertEquals(got[0].countrySlug, 'malta')
  assertEquals(got[0].citySlug, 'malta-sliema')
  assertEquals(got[1].id, '16064')
  assertEquals(got[1].marker, 'restaurants')
})

Deno.test('parseMarkers returns empty (not throwing) on a page with no map', () => {
  assertEquals(parseMarkers('<html><body>no markers here</body></html>'), [])
  assertEquals(parseMarkers('var markers = [not json];'), [])
})

Deno.test('parseCountries reads the country dropdown', () => {
  const html = `<select name="countries_id"><option value="">-all countries-</option>
    <option value="7">Germany</option><option value="71">Malta</option>
    <option value="762">Caribbean - Cura&ccedil;ao</option></select>`
  const got = parseCountries(html)
  assertEquals(got.length, 3)
  assertEquals(got[0], { id: '7', name: 'Germany' })
  assertEquals(got[2].name, 'Caribbean - Curaçao')
})

Deno.test('mapCategory maps marker stems and labels to the venues vocabulary', () => {
  assertEquals(mapCategory({ marker: 'bars' }), 'bar')
  assertEquals(mapCategory({ marker: 'sauna' }), 'sauna')
  assertEquals(mapCategory({ marker: 'hotel' }), 'hotel')
  assertEquals(mapCategory({ marker: 'danceclubs' }), 'club')
  assertEquals(mapCategory({ label: 'Book Shops' }), 'shop')
  assertEquals(mapCategory({ label: 'Travel And Transport' }), 'other')
})

Deno.test('mapCategory never returns "unknown"', () => {
  // 'unknown' is what commit_venue_staging_item substitutes for a missing
  // category, and venues_category_check rejects it — so an unmapped value must
  // resolve to 'other' or the row is rejected at commit rather than merely
  // mis-labelled.
  const ALLOWED = new Set([
    'bar', 'club', 'cafe', 'restaurant', 'hotel', 'sauna', 'cruising', 'outdoor',
    'shop', 'community_center', 'organization', 'event-venue', 'theater',
    'gallery', 'salon', 'gym', 'toilet', 'other',
  ])
  for (const probe of ['', 'zzz-not-a-real-category', 'Escorts', '???', 'Général']) {
    const got = mapCategory({ marker: probe, label: probe })
    assertEquals(ALLOWED.has(got), true, `${probe} -> ${got} not in vocabulary`)
  }
  assertEquals(mapCategory({ vertical: 'saunas' }), 'sauna')
  assertEquals(mapCategory({}), 'other')
})
