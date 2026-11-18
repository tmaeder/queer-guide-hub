import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { discover, factHash, localInstant, ORIGIN, parseBusiness, parseEvent, sourceUrl } from './prideplaces-parse.ts'

const url = `${ORIGIN}/united-states/atlanta/professional-services/example`
const schema = (value: unknown) => `<script type="application/ld+json">${JSON.stringify(value)}</script>`
const business = (extra = {}) => schema({ '@type': 'LocalBusiness', name: 'Example Legal', address: { addressLocality: 'Atlanta', addressRegion: 'GA', addressCountry: 'US', streetAddress: 'N/A' }, ...extra }) + schema({ '@type': 'ProfilePage', about: ['Professional Services'] })
const eventUrl = `${ORIGIN}/events/example`
const event = (date = '11/18/2026', start = '10:00 PM', end = 'N/A') => schema({ '@type': 'Event', name: 'Weekly social', startDate: '2025-07-23T00:00:00-04:00', location: { name: 'Example venue', address: { addressCountry: 'US' } } }) + `<div class="event-date-info">Next Start Date ${date} recurs every week Start Time ${start} End Time ${end}</div>`

Deno.test('directory count drives all pages, independent of the original 807 total', () => {
  const result = discover(`<span class="total__js">25</span><a class="search_view_listing_button" href="${url}">View</a><a class="search_view_listing_button" href="${url}-2">View</a>`, 'business', `${ORIGIN}/search_results`)
  assertEquals(result.urls.length, 2)
  assertEquals(result.pages.length, 12)
  assertEquals(result.pages.includes(`${ORIGIN}/search_results?page=13`), true)
  assertEquals(result.expected, 25)
})
Deno.test('missing totals, empty templates and challenge pages fail coverage', () => {
  assertThrows(() => discover('<html>Directory</html>', 'business', `${ORIGIN}/search_results`))
  assertThrows(() => discover('<title>Just a moment...</title>', 'event', `${ORIGIN}/events`))
  assertThrows(() => discover('<html>Events</html>', 'event', `${ORIGIN}/events`))
  assertEquals(discover('<p>No upcoming events</p>', 'event', `${ORIGIN}/events`).urls, [])
})
Deno.test('event discovery follows later index pages and ignores external lookalikes', () => {
  assertEquals(discover(`<a href="/events/example">Event</a><a href="/events?page=2">Next</a><a href="https://evil.test/events/fake">x</a>`, 'event', `${ORIGIN}/events`), { urls: [eventUrl], pages: [`${ORIGIN}/events?page=2`], expected: undefined })
})
Deno.test('source URLs reject credentials and off-source pages; business identities stay stable', () => {
  assertEquals(sourceUrl(`${url}?tracking=1#section`, 'business'), url)
  assertEquals(sourceUrl(`${ORIGIN}/pro/20251113234406`, 'business'), `${ORIGIN}/pro/20251113234406`)
  assertThrows(() => sourceUrl('https://other.test/events/example', 'event'))
  assertThrows(() => sourceUrl('https://user@www.prideplaces.org/events/example', 'event'))
  assertThrows(() => sourceUrl(`${ORIGIN}/login`, 'business'))
})
Deno.test('professional services remain included without ownership claims or copied marketing', () => {
  const item = parseBusiness(business({ description: 'COPYRIGHT MARKETING', image: 'https://test/image.jpg' }), url)
  assertEquals(item.category, 'other')
  assertEquals(item.name, 'Example Legal')
  assertEquals(item.images, [])
  assertEquals(String(item.description).includes('COPYRIGHT'), false)
  assertEquals((item.location as Record<string, unknown>).address, undefined)
})
Deno.test('opaque Facebook IDs and legacy page paths are not reinterpreted by the adapter', () => {
  const links = ['https://www.facebook.com/profile.php?id=100000000000000001', 'https://www.facebook.com/pages/Example/100000000000000002']
  assertEquals((parseBusiness(business({ sameAs: links }), url).metadata as Record<string, unknown>).social_links, links)
})
Deno.test('placeholder phones and the source default US point are not imported', () => {
  const item = parseBusiness(business({ telephone: '01234567890', address: { addressCountry: 'US' }, geo: { latitude: '38.7945952', longitude: '-106.5348379' } }), url)
  assertEquals((item.contacts as Record<string, unknown>).phone, undefined)
  assertEquals((item.location as Record<string, unknown>).lat, undefined)
})
Deno.test('incomplete profiles retain their identity and require downstream review', () => {
  assertEquals((parseBusiness('<h1>Ricardo</h1>', url).metadata as Record<string, unknown>).incomplete_business_profile, true)
  assertThrows(() => parseBusiness('<html>Nothing here</html>', url))
})
Deno.test('visible current date wins over stale event schema and preserves occurrence identity', () => {
  const item = parseEvent(event(), eventUrl, { timezone: 'America/New_York', venueId: 'venue' })
  assertEquals(item.sourceId, `${eventUrl}:2026-11-18`)
  assertEquals(item.start_date, '2026-11-19T03:00:00.000Z')
  assertEquals(item.recurrence_rule, { freq: 'WEEKLY', interval: 1, byDay: ['WE'] })
})
Deno.test('summer times use daylight savings, and overnight ends advance the local day', () => {
  const item = parseEvent(event('07/22/2026', '10:00 PM', '2:00 AM'), eventUrl, { timezone: 'America/New_York', venueId: 'venue' })
  assertEquals(item.start_date, '2026-07-23T02:00:00.000Z')
  assertEquals(item.end_date, '2026-07-23T06:00:00.000Z')
})
Deno.test('missing clocks, missing zones and ambiguous DST times stay unknown', () => {
  assertEquals(parseEvent(event('11/18/2026', 'N/A'), eventUrl, { timezone: 'America/New_York' }).start_date, undefined)
  assertEquals(parseEvent(event(), eventUrl).start_date, undefined)
  assertEquals(localInstant('2026-03-08', '2:30 AM', 'America/New_York'), undefined)
  assertEquals(localInstant('2026-11-01', '1:30 AM', 'America/New_York'), undefined)
  assertEquals(localInstant('2026-11-18', '13:00 PM', 'America/New_York'), undefined)
  assertEquals(localInstant('2026-11-18', '10:00 PM', 'invalid/zone'), undefined)
})
Deno.test('invalid and unpublished dates produce incomplete Review identities without using stale schema', () => {
  for (const html of [event('02/30/2026'), schema({ '@type': 'Event', name: 'Example', startDate: '2025-01-01' })]) {
    const item = parseEvent(html, eventUrl)
    assertEquals(item.sourceId, eventUrl)
    assertEquals(item.start_date, undefined)
    assertEquals((item.metadata as Record<string, unknown>).date_unknown, true)
    assertEquals((item.metadata as Record<string, unknown>).requires_review, true)
  }
})
Deno.test('fact hashing ignores operational timestamps/prose and detects changed facts and reversions', async () => {
  const a = parseBusiness(business(), url)
  const hash = await factHash(a)
  assertEquals(await factHash({ ...a, description: 'Different prose', metadata: { ...(a.metadata as object), captured_at: 'later', scan_run_id: 'different' } }), hash)
  assertEquals(await factHash({ ...a, contacts: { phone: '123' } }) === hash, false)
  assertEquals(await factHash(a), hash)
})
