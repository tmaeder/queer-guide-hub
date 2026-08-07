import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import {
  DEFAULT_EVENT_PREFILTER_KEYWORDS,
  eventbritePrefilterFields,
  prefilterEvents,
  ticketmasterPrefilterFields,
} from './event-prefilter.ts'

const item = (id: string, data: Record<string, unknown>) => ({ sourceId: id, data })
const nameOnly = (d: Record<string, unknown>) => [d.name]

Deno.test('default keyword list is the conservative published set', () => {
  assertEquals([...DEFAULT_EVENT_PREFILTER_KEYWORDS], [
    'pride', 'lgbtq+', 'lgbtq', 'lgbt', 'queer', 'gay', 'lesbian',
    'trans night', 'transgender', 'bisexual', 'nonbinary', 'drag',
    'rainbow family', 'same-sex',
  ])
})

Deno.test('keeps keyword matches case-insensitively, drops the rest, counts all three', () => {
  const items = [
    item('1', { name: 'PRIDE Night at the Ballpark' }),
    item('2', { name: 'Monster Truck Jam' }),
    item('3', { name: 'Drag Brunch Extravaganza' }),
    item('4', { name: 'Taylor Swift: The Eras Tour' }),
  ]
  const r = prefilterEvents(items, { fields: nameOnly })
  assertEquals(r.kept.map((i) => i.sourceId), ['1', '3'])
  assertEquals(r.fetched, 4)
  assertEquals(r.dropped, 2)
})

Deno.test('word boundaries: gay/drag do not fire inside longer words', () => {
  const items = [
    item('1', { name: 'Concert at Gaylord Opryland' }),
    item('2', { name: 'Marvin Gaye Tribute Night' }),
    item('3', { name: 'Dragon Ball Symphonic Adventure' }),
    item('4', { name: 'Gay Men’s Chorus Holiday Show' }),
  ]
  const r = prefilterEvents(items, { fields: nameOnly })
  assertEquals(r.kept.map((i) => i.sourceId), ['4'])
})

Deno.test('separator tolerance: hyphen/space/joined spellings all match', () => {
  const items = [
    item('1', { name: 'Same Sex Wedding Expo' }),        // 'same-sex' sans hyphen
    item('2', { name: 'Non-Binary Art Night' }),         // 'nonbinary' hyphenated
    item('3', { name: 'Trans-Night at the Roxy' }),      // 'trans night' hyphenated
    item('4', { name: 'Transnational Trade Forum' }),    // must NOT match 'trans night'
  ]
  const r = prefilterEvents(items, { fields: nameOnly })
  assertEquals(r.kept.map((i) => i.sourceId), ['1', '2', '3'])
})

Deno.test('lgbtq keyword matches the lgbtq+ spelling', () => {
  const r = prefilterEvents([item('1', { name: 'LGBTQ+ Film Festival' })], { fields: nameOnly })
  assertEquals(r.kept.length, 1)
})

Deno.test('custom keyword override replaces the default list entirely', () => {
  const items = [
    item('1', { name: 'Pride Parade' }),
    item('2', { name: 'Ballroom Vogue Night' }),
  ]
  const r = prefilterEvents(items, { keywords: ['ballroom'], fields: nameOnly })
  assertEquals(r.kept.map((i) => i.sourceId), ['2'])
})

Deno.test('empty keyword override falls back to the default list', () => {
  const r = prefilterEvents([item('1', { name: 'Pride Parade' })], { keywords: [], fields: nameOnly })
  assertEquals(r.kept.length, 1)
})

Deno.test('items with no extractable text are dropped', () => {
  const r = prefilterEvents([item('1', { name: 42, description: null })], { fields: (d) => [d.name, d.description] })
  assertEquals(r.kept.length, 0)
  assertEquals(r.dropped, 1)
})

Deno.test('ticketmaster extractor reaches segment/genre/promoter fields', () => {
  const raw = {
    name: 'Summer Open Air',
    info: 'A big outdoor party.',
    classifications: [{ segment: { name: 'Music' }, genre: { name: 'Pop' }, subGenre: { name: 'Dance Pop' } }],
    promoter: { name: 'Pride Productions LLC' },
    promoters: [{ name: 'Live Nation' }],
  }
  const r = prefilterEvents([item('1', raw)], { fields: ticketmasterPrefilterFields })
  assertEquals(r.kept.length, 1) // matched via promoter name only

  const noSignal = { ...raw, promoter: { name: 'AEG Presents' } }
  const r2 = prefilterEvents([item('2', noSignal)], { fields: ticketmasterPrefilterFields })
  assertEquals(r2.kept.length, 0)
})

Deno.test('ticketmaster extractor tolerates missing/odd-shaped fields', () => {
  const r = prefilterEvents(
    [item('1', { name: 'Queer Poetry Slam', classifications: 'oops', promoters: null })],
    { fields: ticketmasterPrefilterFields },
  )
  assertEquals(r.kept.length, 1)
})

Deno.test('eventbrite extractor reads nested name.text/description.text/summary', () => {
  const kept = prefilterEvents(
    [item('1', { name: { text: 'Lesbian Book Club' }, description: { text: 'Monthly meetup.' } })],
    { fields: eventbritePrefilterFields },
  )
  assertEquals(kept.kept.length, 1)

  const viaSummary = prefilterEvents(
    [item('2', { name: { text: 'Community Picnic' }, summary: 'A rainbow family gathering in the park.' })],
    { fields: eventbritePrefilterFields },
  )
  assertEquals(viaSummary.kept.length, 1)

  const dropped = prefilterEvents(
    [item('3', { name: { text: 'Startup Pitch Night' }, description: { text: 'VCs and founders.' } })],
    { fields: eventbritePrefilterFields },
  )
  assertEquals(dropped.kept.length, 0)
})
