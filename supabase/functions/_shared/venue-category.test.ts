// Unit tests for the venues.category / country coercion helpers.
// Run with: cd supabase/functions && deno test --allow-env _shared/venue-category.test.ts
import { assertEquals } from 'jsr:@std/assert'
import { VENUE_CATEGORIES, normalizeVenueCategory, normalizeIso2Country } from './venue-category.ts'

// The three real failures this module exists to prevent, measured 2026-08-22.
Deno.test('maps the values that were losing rows at commit', () => {
  // source-osm-venue emitted a HYPHEN; the vocabulary uses an underscore.
  // 203 of 381 osm rows (53%) were rejected by venues_category_check.
  assertEquals(normalizeVenueCategory('community-center'), 'community_center')
  // community-manual emitted 'nightclub'; the vocabulary is 'club'. 13 of 13.
  assertEquals(normalizeVenueCategory('nightclub'), 'club')
  // source-refuge-restrooms emitted NOTHING, so commit substituted 'unknown'
  // — a value the CHECK does not contain. 907 of 1,851 rows (49%).
  assertEquals(normalizeVenueCategory(undefined, 'toilet'), 'toilet')
  assertEquals(normalizeVenueCategory(''), 'other')
})

Deno.test('never returns a value outside the vocabulary', () => {
  // 'unknown' is the specific trap: commit_venue_staging_item substitutes it
  // for a missing category and venues_category_check rejects it, so an
  // unmapped input must degrade to 'other' — mis-categorised is recoverable,
  // rejected is silently dropped. There is deliberately no `got !== 'unknown'`
  // assertion here: the VenueCategory return type makes that unrepresentable,
  // and tsc rejects the comparison as impossible. The membership check below
  // covers it at runtime for untyped JS callers.
  const probes = [
    'unknown', '', '   ', 'zzz-not-real', '???', 'Général', 'BAR', 'Night Club',
    'community centre', 'event venue', 'sex shop', 'bath house', null, undefined,
  ]
  for (const p of probes) {
    const got = normalizeVenueCategory(p as string | null | undefined)
    assertEquals(
      (VENUE_CATEGORIES as readonly string[]).includes(got),
      true,
      `${JSON.stringify(p)} -> ${got} is not in the vocabulary`,
    )
  }
})

Deno.test('handles separator and case drift generically', () => {
  assertEquals(normalizeVenueCategory('community centre'), 'community_center')
  assertEquals(normalizeVenueCategory('COMMUNITY_CENTER'), 'community_center')
  assertEquals(normalizeVenueCategory('event venue'), 'event-venue')
  assertEquals(normalizeVenueCategory('event_venue'), 'event-venue')
  assertEquals(normalizeVenueCategory('  Bar  '), 'bar')
})

Deno.test('maps common source spellings', () => {
  assertEquals(normalizeVenueCategory('pub'), 'bar')
  assertEquals(normalizeVenueCategory('theatre'), 'theater')
  assertEquals(normalizeVenueCategory('cinema'), 'theater')
  assertEquals(normalizeVenueCategory('bathhouse'), 'sauna')
  assertEquals(normalizeVenueCategory('restroom'), 'toilet')
  assertEquals(normalizeVenueCategory('hostel'), 'hotel')
})

Deno.test('normalizeIso2Country returns undefined, never the empty string', () => {
  // venues_country_iso2_check is `country IS NULL OR country ~ '^[A-Z]{2}$'`
  // — NULL is allowed, '' is NOT. source-osm-venue sent `addr:country ?? ''`
  // and OSM usually has no addr:country, so those rows could never commit.
  assertEquals(normalizeIso2Country(''), undefined)
  assertEquals(normalizeIso2Country('   '), undefined)
  assertEquals(normalizeIso2Country(null), undefined)
  assertEquals(normalizeIso2Country(undefined), undefined)
  assertEquals(normalizeIso2Country('Germany'), undefined)
  assertEquals(normalizeIso2Country('USA'), undefined)
})

Deno.test('normalizeIso2Country upper-cases a valid code', () => {
  assertEquals(normalizeIso2Country('de'), 'DE')
  assertEquals(normalizeIso2Country('US'), 'US')
  assertEquals(normalizeIso2Country(' mt '), 'MT')
})

Deno.test('every vocabulary member round-trips', () => {
  for (const c of VENUE_CATEGORIES) assertEquals(normalizeVenueCategory(c), c)
})

// pipeline-normalize used to only lower-case raw.category. A community
// submitter typing "nightclub" produced a value no vocabulary member matches;
// pipeline-validate approved the row and commit rejected it on
// venues_category_check. Normalizing at the normalize stage keeps the MEANING
// ('club'); commit's backstop would only flatten it to 'other'.
Deno.test('submitter free-text maps to meaning, not to the fallback', () => {
  assertEquals(normalizeVenueCategory('nightclub'), 'club')
  assertEquals(normalizeVenueCategory('Night Club'), 'club')
  assertEquals(normalizeVenueCategory('NIGHTCLUB'), 'club')
  // Only genuinely unmappable input should reach the fallback.
  assertEquals(normalizeVenueCategory('zzz'), 'other')
})
