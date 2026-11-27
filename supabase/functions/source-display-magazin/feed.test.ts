import { assertEquals, assertRejects, assertThrows } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { DISPLAY_FEED, displayFeedItems, fetchDisplayFeed } from './feed.ts'

const descriptor = Object.getOwnPropertyDescriptor(Deno, 'serve')!
Object.defineProperty(Deno, 'serve', { configurable: true, value: () => ({}) })
let eventAdapter: typeof import('./index.ts')['eventAdapter']
try { ({ eventAdapter } = await import('./index.ts')) }
finally { Object.defineProperty(Deno, 'serve', descriptor) }

const now = Date.parse('2026-11-17T12:00:00Z')
const options = { now, daysBack: 7, limit: 10 }
const event = { id: 12345, title: 'Publisher event', description: '<p>Actual publisher text</p>', start_date: '2026-11-17 19:00:00', end_date: '2026-11-18 22:00:00', url: 'https://www.display-magazin.ch/events/publisher-event-12345/', venue: { venue: 'Parent venue', city: 'Basel' } }
const feed = (events: unknown[]) => ({ generated: now / 1000, events })

Deno.test('Display sessions retain their own city, time, venue and tickets without an aggregate end', () => {
  const session = { date: '2026-11-18', start: '19:30', venue: 'Zürich venue', city: 'Zürich', address: 'Actual street', tickets: 'https://tickets.example/show', price: 0 }
  const input = feed([{ ...event, kultur_art: 'kino', categories: [{ slug: 'kultur' }], sessions: [session, session, { ...session, city: 'Bern', venue: 'Bern venue' }] }])
  const rows = displayFeedItems(input, options)
  assertEquals(rows.length, 2)
  assertEquals(rows[0].sourceId === rows[1].sourceId, false)
  assertEquals(displayFeedItems(input, options).map(r => r.sourceId), rows.map(r => r.sourceId))
  const normalized = eventAdapter.normalize(rows[0]) as import('./index.ts').StagedItem
  assertEquals(normalized.start_date, '2026-11-18T18:30:00.000Z')
  assertEquals(normalized.end_date, null)
  assertEquals(normalized.venue_name, 'Zürich venue')
  assertEquals((normalized.location as Record<string, unknown>).city, 'Zürich')
  assertEquals(normalized.ticket_url, session.tickets)
  assertEquals(normalized.event_type, 'film')
  assertEquals((normalized.metadata as Record<string, unknown>).cost, 0)
  assertEquals((normalized.metadata as Record<string, unknown>).source_feed, DISPLAY_FEED)
})

Deno.test('Display ordinary events preserve the publisher post identity and obey the batch cap', () => {
  const rows = displayFeedItems(feed([event, { ...event, id: 12346 }]), { ...options, limit: 1 })
  assertEquals(rows.length, 1)
  assertEquals(rows[0].sourceId, '12345')
  assertEquals(eventAdapter.normalize(rows[0]).sourceId, '12345')
})

Deno.test('Display only treats explicit ticket fields as booking links', () => {
  for (const tickets of [undefined, null, '', '   ', { url: 'https://tickets.example/' }]) {
    const normalized = eventAdapter.normalize({ sourceId: '12345', data: {
      ...event, website: 'https://organizer.example/programme', tickets,
    } }) as import('./index.ts').StagedItem
    assertEquals(normalized.ticket_url, null)
    assertEquals(normalized.website, 'https://organizer.example/programme')
  }
  const normalized = eventAdapter.normalize({ sourceId: '12345', data: {
    ...event, tickets: '  https://tickets.example/exact-show  ',
  } }) as import('./index.ts').StagedItem
  assertEquals(normalized.ticket_url, 'https://tickets.example/exact-show')
})

Deno.test('Display country identity uses explicit countries rather than shared postcode lengths', () => {
  for (const [country, city, address, expected] of [
    ['FR', 'Paris', 'Rue exemple, 75001 Paris', 'FR'],
    ['IT', 'Milano', 'Via esempio, 20121 Milano', 'IT'],
    ['LI', 'Vaduz', 'Beispielstrasse, 9490 Vaduz', 'LI'],
    ['Austria', 'Wien', 'Beispielgasse, 1010 Wien', 'AT'],
    ['Switzerland', 'Basel', 'Beispielgasse, 4058 Basel', 'CH'],
    ['Germany', 'Lindau', 'Beispielstrasse, 88131 Lindau', 'DE'],
    [undefined, 'Paris', 'Rue exemple, 75001 Paris', undefined],
    [undefined, 'Wien', 'Beispielgasse, 1010 Wien', undefined],
    [undefined, 'Vaduz', 'Beispielstrasse, 9490 Vaduz', undefined],
  ]) {
    const normalized = eventAdapter.normalize({ sourceId: '12345', data: {
      ...event, venue: { venue: 'Published venue', country, city, address },
    } }) as import('./index.ts').StagedItem
    assertEquals(normalized.location?.country, expected)
    assertEquals(normalized.location?.city, city)
  }
})

Deno.test('Display rejects stale/challenge feeds, foreign publisher links and impossible session dates', () => {
  for (const invalid of ['<html>challenge</html>', { events: [] }, { generated: 0, events: [event] }, { ...feed([event]), generated: now / 1000 + 86400 }]) assertThrows(() => displayFeedItems(invalid, options))
  for (const bad of [{ ...event, url: 'https://foreign.example/events/12345' }, { ...event, sessions: [{ date: '2026-02-30', start: '19:00' }] }, { ...event, sessions: [{ date: '2026-11-18', start: '29:00' }] }]) assertThrows(() => displayFeedItems(feed([bad]), options))
})

Deno.test('Display excludes old/far-future occurrences rather than pretending an empty import succeeded', () => {
  assertThrows(() => displayFeedItems(feed([{ ...event, start_date: '2020-01-01 19:00:00', end_date: '2020-01-01 21:00:00' }]), options))
  assertThrows(() => displayFeedItems(feed([{ ...event, start_date: '2030-01-01 19:00:00', end_date: null }]), options))
})

Deno.test('Display feed reader uses the exact static endpoint, rejects redirects/errors and caps bytes', async () => {
  const fetcher = ((url: string | URL | Request) => { assertEquals(String(url), DISPLAY_FEED); return Promise.resolve(Response.json(feed([event]))) }) as typeof fetch
  assertEquals((await fetchDisplayFeed(AbortSignal.timeout(1000), fetcher) as { events: unknown[] }).events.length, 1)
  await assertRejects(() => fetchDisplayFeed(AbortSignal.timeout(1000), (() => Promise.resolve(new Response('limited', { status: 429 }))) as typeof fetch))
  await assertRejects(() => fetchDisplayFeed(AbortSignal.timeout(1000), (() => Promise.resolve(new Response('x'.repeat(2_000_001)))) as typeof fetch))
})

Deno.test('Display preserves an inconsistent publisher end for review without inventing a date', () => {
  const raw = { sourceId: '12345', data: { ...event, start_date: '2026-11-17 23:00:00', end_date: '2026-11-17 04:00:00' } }
  const normalized = eventAdapter.normalize(raw) as import('./index.ts').StagedItem
  assertEquals(normalized.start_date, '2026-11-17T22:00:00.000Z')
  assertEquals(normalized.end_date, null)
  assertEquals(normalized.dates?.end, undefined)
  assertEquals(normalized.metadata.source_date_issue, { code: 'publisher_end_before_start', published_end: '2026-11-17 04:00:00' })
})

Deno.test('Display excludes locationless calendar observances without inventing a venue', () => {
  assertEquals(displayFeedItems(feed([event, { ...event, id: 12346, venue: null }]), options).length, 1)
})
