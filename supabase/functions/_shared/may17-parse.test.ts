import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { normalizeMay17Event, normalizeMay17Page, type May17Raw } from './may17-parse.ts'

// Real /wp-json/tribe/events/v1/events items captured 2026-11-22, trimmed to the
// fields under test.

const AMP: May17Raw = {
  id: 217858,
  status: 'publish',
  url: 'https://may17.org/event/lgbtqi-awareness-informational-workshop-for-georgian-immigrants-in-new-york/',
  title: 'LGBTQI+ Awareness &amp; Informational Workshop for Georgian Immigrants in New York',
  description: '<p>This community-based educational workshop, led by Konstantine Svanidze</p>',
  all_day: false,
  utc_start_date: '2026-05-03 18:00:00',
  utc_end_date: '2026-05-03 19:00:00',
  timezone: 'America/New_York',
  website: 'https://www.facebook.com/events/1632918124620182/',
  image: { url: 'https://may17.org/wp-content/uploads/2026/04/event.jpg' },
  venue: {
    venue: 'Brooklyn, NY',
    address: '4611 12th Avenue',
    city: 'Brooklyn',
    country: 'United States',
    zip: '11219',
    stateprovince: 'NY',
    geo_lat: null,
    geo_lng: null,
  },
  is_virtual: false,
  hide_from_listings: false,
}

const VIRTUAL: May17Raw = {
  id: 244524,
  status: 'publish',
  url: 'https://may17.org/event/planning-and-implementing-2slgbtqi-events-amid-rising-hate-egale-canada-free-webinar/',
  title: 'Planning and Implementing 2SLGBTQI Events Amid Rising Hate',
  description: '<p>A free one-hour webinar held in recognition of IDAHOBIT</p>',
  utc_start_date: '2026-05-07 16:00:00',
  utc_end_date: '2026-05-07 17:00:00',
  timezone: 'America/Toronto',
  website: 'https://egale.ca/egale-in-action/idahobit-2026/',
  image: { url: 'https://may17.org/wp-content/uploads/2026/05/egale-workshop.jpg' },
  // the "venue" here is the country — it must never become venue_name
  venue: { venue: 'Canada', address: '120 Carlton Street', city: 'Toronto', country: 'Canada', geo_lat: 43.662727, geo_lng: -79.3763465 },
  is_virtual: true,
}

const NO_VENUE: May17Raw = {
  id: 244534,
  status: 'publish',
  url: 'https://may17.org/event/idahobit-flag-raising-south-gippsland-shire-council/',
  title: 'IDAHOBIT Flag Raising – South Gippsland Shire Council',
  description: '<p>South Gippsland Shire Council raises the rainbow flag</p>',
  utc_start_date: '2026-05-12 14:00:00',
  utc_end_date: '2026-05-12 14:00:00',
  timezone: 'Australia/Melbourne',
  image: false,
  venue: [],
}

Deno.test('decodes entities in titles and strips HTML from descriptions', () => {
  const e = normalizeMay17Event(AMP)!
  assertEquals(e.title, 'LGBTQI+ Awareness & Informational Workshop for Georgian Immigrants in New York')
  assertEquals(e.description, 'This community-based educational workshop, led by Konstantine Svanidze')
})

Deno.test('reads the UTC start/end, not the local wall-clock fields', () => {
  const e = normalizeMay17Event(AMP)!
  assertEquals(e.start, '2026-05-03T18:00:00.000Z')
  assertEquals(e.end, '2026-05-03T19:00:00.000Z')
})

Deno.test('keeps city/country/address, never the venue record as a venue', () => {
  const e = normalizeMay17Event(VIRTUAL)!
  assertEquals([e.city, e.country, e.address], ['Toronto', 'Canada', '120 Carlton Street'])
  assertEquals([e.lat, e.lng], [43.662727, -79.3763465])
  assertEquals(e.online, true)
  assertEquals('venue' in e, false)
})

Deno.test('an empty venue array and a false image are absent, not errors', () => {
  const e = normalizeMay17Event(NO_VENUE)!
  assertEquals([e.city, e.country, e.lat, e.image], [null, null, null, null])
  assertEquals(e.id, '244534')
})

Deno.test('drops unpublished, hidden and undated rows', () => {
  assertEquals(normalizeMay17Event({ ...AMP, status: 'draft' }), null)
  assertEquals(normalizeMay17Event({ ...AMP, hide_from_listings: true }), null)
  assertEquals(normalizeMay17Event({ ...AMP, utc_start_date: null }), null)
  assertEquals(normalizeMay17Event({ ...AMP, utc_start_date: '2026-05-03' }), null)
  assertEquals(normalizeMay17Page([AMP, { ...AMP, status: 'draft' }, NO_VENUE]).length, 2)
})
