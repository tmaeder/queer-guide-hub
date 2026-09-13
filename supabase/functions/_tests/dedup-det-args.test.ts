import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { buildDetArgs } from '../pipeline-deduplicate/index.ts'

// Real staging shapes, copied from prod rows (2026-09-10) rather than invented —
// the whole class of bug these guard against is "the payload is not shaped the
// way the reader assumes", which a hand-written fixture reproduces by accident
// at best.

const MARKETPLACE_ROW = {
  name: 'Upgraded Icy Silk High-Cut Brief (Night Purple)',
  description: 'x',
  sourceId: 'nattaup:upgraded-icy-silk-high-cut-brief-night-purple-2',
  sourceName: 'nattaup',
  urls: ['https://nattaup.com/products/upgraded-icy-silk-high-cut-brief-night-purple-2'],
  metadata: {
    brand: 'V SERIES',
    merchant_domain: 'nattaup.com',
    source_slug: 'nattaup',
    shop_domain: 'nattaup.com',
  },
}

const VENUE_ROW = {
  name: 'BKA Theater',
  contacts: { website: 'https://www.bka-theater.de' },
  location: { lat: 52.49, lng: 13.39, address: 'Mehringdamm 34', city: 'Berlin', country: 'DE' },
}

Deno.test('marketplace identity args come from metadata/urls/camelCase, not top level', () => {
  // Locks in the fix for the 708 stranded listings: every one of these was NULL
  // because the reader looked at the top level, killing four of the RPC's five
  // branches and dropping everything into the semantic fallback.
  const a = buildDetArgs('marketplace', MARKETPLACE_ROW, false)!
  assertEquals(a.p_source_entity_id, 'nattaup:upgraded-icy-silk-high-cut-brief-night-purple-2')
  assertEquals(a.p_merchant_domain, 'nattaup.com')
  assertEquals(a.p_brand, 'V SERIES')
  assertEquals(a.p_source_slug, 'nattaup')
  assertEquals(
    a.p_external_url,
    'https://nattaup.com/products/upgraded-icy-silk-high-cut-brief-night-purple-2',
  )
})

Deno.test('empty strings do not satisfy a marketplace identity arg', () => {
  // pipeline-normalize emits absent fields as '' rather than omitting them, so
  // `a ?? b` returns '' and the fallback never fires. `pick` must skip past it.
  const a = buildDetArgs('marketplace', {
    ...MARKETPLACE_ROW,
    merchant_domain: '',
    brand: '   ',
  }, false)!
  assertEquals(a.p_merchant_domain, 'nattaup.com', "'' must not win over the metadata value")
  assertEquals(a.p_brand, 'V SERIES', 'whitespace must not win over the metadata value')
})

Deno.test('venue domain stays NULL even when contacts.website is present', () => {
  // NOT an oversight — a safety property. venues.website_domain is frequently an
  // aggregator rather than the venue's own site (measured on prod: facebook.com
  // on 554 live venues, tinyurl.com 369, display-magazin.ch 311,
  // misterbandb.com 311, instagram.com 136; 3,037 venues share a domain with
  // another venue). find_venue_duplicate_candidates scores a domain hit
  // `domain_proximity` at a flat 0.950 and venue autoMerge is 0.90, so feeding
  // it would put 554 unrelated venues above the auto-merge bar behind nothing
  // but geoGuard(250) — which is porous, since 2,665 venues sit on 908 shared
  // city-centroid points.
  //
  // If you are here because you "fixed" the NULL: read the comment on the venue
  // case in pipeline-deduplicate/index.ts. An aggregator veto and a score below
  // 0.90 have to come first.
  const a = buildDetArgs('venue', VENUE_ROW, false)!
  assertEquals(a.p_website_domain, null)
  assertEquals(a.p_phone_e164, null)
  assertEquals(a.p_email, null)
  // The args that ARE load-bearing for venues must still arrive.
  assertEquals(a.p_name, 'BKA Theater')
  assertEquals(a.p_address, 'Mehringdamm 34')
  assertEquals(a.p_city, 'Berlin')
  assertEquals(a.p_country, 'DE')
})

Deno.test('hotel omits p_city/p_country entirely', () => {
  // find_hotel_duplicate_candidates has no such parameters, and PostgREST
  // resolves overloads BY ARGUMENT NAME — an unknown name is a silent PGRST202
  // 404, so hotel dedup would stop finding candidates at all.
  const a = buildDetArgs('hotel', VENUE_ROW, true)!
  assertEquals('p_city' in a, false)
  assertEquals('p_country' in a, false)
  assertEquals('p_platform_ids' in a, true)
})
