import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { isEventLike, parentRefOf, toParentRef } from './jsonld-parent-ref.ts'
import * as sdk from '../../../client-sdk/parent-ref.ts'

// schema.org's own EventSeries example, copied verbatim from
// https://schema.org/EventSeries on 2026-11-22. superEvent there is a bare
// URL string, the shape a name-only reader would silently drop.
const OLYMPICS = JSON.parse(
  Deno.readTextFileSync(new URL('./__fixtures__/schemaorg-eventseries-olympics.json', import.meta.url)),
) as Record<string, unknown>[]
const byId = (id: string) => OLYMPICS.find((n) => n['@id'] === id)!

Deno.test('fixture is the four-node schema.org example', () => {
  assertEquals(OLYMPICS.length, 4)
})

Deno.test('superEvent as a bare URL string -> url-only ref', () => {
  assertEquals(parentRefOf(byId('http://www.olympic.org/rio-2016-summer-olympics')), {
    name: null, url: 'http://www.olympic.org/olympic-games', type: null,
  })
  // rowing -> Rio, i.e. the DIRECT parent, not the root of the tree
  assertEquals(parentRefOf(byId('http://www.rio2016.com/en/rowing'))?.url,
    'http://www.olympic.org/rio-2016-summer-olympics')
})

Deno.test('negative: an event with no superEvent and no container has no parent_ref', () => {
  assertEquals(parentRefOf(byId('http://www.olympic.org/olympic-games')), null)
  assertEquals(parentRefOf({ '@type': 'Event', name: 'Standalone party', startDate: '2026-01-01' }), null)
})

Deno.test('superEvent object -> name + url + type', () => {
  assertEquals(
    parentRefOf({ '@type': 'Event', superEvent: { '@type': 'Festival', name: ' Folsom Europe 2027 ', url: 'https://folsomeurope.berlin/' } }),
    { name: 'Folsom Europe 2027', url: 'https://folsomeurope.berlin/', type: 'Festival' },
  )
})

Deno.test('enclosing container counts only when it is event-like; superEvent wins over it', () => {
  const series = { '@type': 'EventSeries', name: 'Travestie im Kiez Berlin', url: 'https://www.ticketcorner.ch/artist/x/' }
  assertEquals(parentRefOf({ '@type': 'TheaterEvent' }, series)?.name, 'Travestie im Kiez Berlin')
  assertEquals(parentRefOf({ '@type': 'Event' }, { '@type': 'WebPage', name: 'Programme', url: 'https://x.example/' }), null)
  assertEquals(parentRefOf({ '@type': 'Event', superEvent: 'https://own-parent.example/' }, series)?.url, 'https://own-parent.example/')
})

Deno.test('a superEvent pointing at the event itself is not a parent', () => {
  assertEquals(parentRefOf({ '@type': 'Festival', url: 'https://a.example/x', superEvent: { name: 'X', url: 'https://a.example/x' } }), null)
})

Deno.test('junk is rejected rather than recorded', () => {
  assertEquals(toParentRef('not a url'), null)
  assertEquals(toParentRef({ '@type': 'Event' }), null)
  assertEquals(toParentRef([null, 'mailto:x@y.z', { name: 'Second' }])?.name, 'Second')
  assertEquals(isEventLike({ '@type': ['Thing', 'MusicEvent'] }), true)
})

// client-sdk/parent-ref.ts is the browser/worker copy. Same inputs, same
// outputs — a divergence here means the extension and the edge sources would
// record different parents for the same page.
Deno.test('client-sdk copy behaves identically', () => {
  const series = { '@type': 'EventSeries', name: 'S', url: 'https://s.example/' }
  const cases: [Record<string, unknown>, unknown][] = [
    ...OLYMPICS.map((n) => [n, undefined] as [Record<string, unknown>, unknown]),
    [{ '@type': 'Event' }, series],
    [{ '@type': 'Event' }, { '@type': 'WebPage', name: 'P' }],
    [{ '@type': 'Event', superEvent: [{ name: 'A', '@id': 'https://a.example/' }] }, undefined],
    [{ '@type': 'Festival', url: 'https://a.example/x', superEvent: { url: 'https://a.example/x' } }, undefined],
  ]
  for (const [node, enc] of cases) assertEquals(sdk.parentRefOf(node, enc), parentRefOf(node, enc))
})
