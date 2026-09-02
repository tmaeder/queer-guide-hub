import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import {
  CONTROL_QUERY_MIN_ELEMENTS,
  OVERPASS_ENDPOINTS,
  classifyOverpassResponse,
  isPlanetControlResult,
  pickMatchingElement,
} from './overpass.ts'

// --- trap 1: an empty 200 is not an answer -----------------------------------

Deno.test('empty 200 WITH a remark is a timeout, never "nothing is there"', () => {
  assertEquals(
    classifyOverpassResponse(200, { elements: [], remark: 'runtime error: Query timed out in "query" at line 3' }),
    'timeout',
  )
  // A remark can also ride along with partial results — still not trustworthy.
  assertEquals(
    classifyOverpassResponse(200, { elements: [{ id: 1 }], remark: 'Query ran out of memory' }),
    'timeout',
  )
})

Deno.test('empty 200 with NO remark is REGIONAL — condemn, do not retry', () => {
  // overpass.osm.ch is a Switzerland-only extract and answers the rest of the
  // planet with a clean empty 200 and no remark at all. Pinned to a third of a
  // 487-city run it cached "no network" for ~450 cities.
  assertEquals(classifyOverpassResponse(200, { elements: [] }), 'regional')
})

Deno.test('busy and regional are different verdicts and must not be merged', () => {
  // After a few thousand requests both real mirrors 504 for a while. Treating
  // that as unhealthy aborts a run that would be fine ten minutes later.
  assertEquals(classifyOverpassResponse(504, {}), 'busy')
  assertEquals(classifyOverpassResponse(502, {}), 'busy')
  assertEquals(classifyOverpassResponse(429, {}), 'busy')
  assertEquals(classifyOverpassResponse(400, {}), 'error')
  assertEquals(classifyOverpassResponse(403, {}), 'error')
})

Deno.test('a non-empty 200 with no remark is the only "ok"', () => {
  assertEquals(classifyOverpassResponse(200, { elements: [{ id: 1, tags: {} }] }), 'ok')
})

// --- trap 2: probe every endpoint with a planet control query ----------------

Deno.test('the endpoint list holds only planet mirrors', () => {
  for (const url of OVERPASS_ENDPOINTS) {
    assertEquals(url.includes('overpass.osm.ch'), false, 'the Swiss extract must never be listed')
    assertEquals(url.startsWith('https://'), true)
  }
  assertEquals(OVERPASS_ENDPOINTS.length >= 2, true, 'one mirror is not a fallback')
})

Deno.test('the control query needs real elements, not merely a 200', () => {
  const enough = { elements: Array.from({ length: CONTROL_QUERY_MIN_ELEMENTS }, (_, i) => ({ id: i })) }
  assertEquals(isPlanetControlResult(200, enough), true)
  assertEquals(isPlanetControlResult(200, { elements: [{ id: 1 }] }), false)
  assertEquals(isPlanetControlResult(200, { elements: [] }), false)
  assertEquals(isPlanetControlResult(504, enough), false)
})

// --- matching: proximity alone may never attribute a claim -------------------

const el = (id: number, name: string, tags: Record<string, string> = {}) =>
  ({ type: 'node', id, tags: { name, ...tags } })

Deno.test('a name match inside the radius is required — proximity alone is not enough', () => {
  const elements = [el(1, 'Kreuzberg Apotheke', { wheelchair: 'no' }), el(2, 'SchwuZ', { wheelchair: 'yes' })]
  assertEquals(pickMatchingElement(elements, 'SchwuZ').element?.id, 2)
  // The pharmacy next door is not our bar. Attributing its wheelchair=no would
  // be a wrong access claim about a door we never checked.
  assertEquals(pickMatchingElement(elements, 'Café Tasso').reason, 'no_match')
})

Deno.test('name comparison is normalised, not literal', () => {
  const elements = [el(1, 'Café  Möbel-Olfe')]
  assertEquals(pickMatchingElement(elements, 'cafe mobel olfe').element?.id, 1)
})

Deno.test('two same-named candidates BLOCK rather than guess', () => {
  // A null result is recoverable; a wrong one is not. Same rule as the
  // same-name city collisions.
  const elements = [el(1, 'Roses', { wheelchair: 'yes' }), el(2, 'Roses', { wheelchair: 'no' })]
  const r = pickMatchingElement(elements, 'Roses')
  assertEquals(r.reason, 'ambiguous')
  assertEquals(r.element, undefined)
})

Deno.test('an exact OSM id wins outright and skips name matching entirely', () => {
  // The venue already carries this element's id in venue_sources, so identity is
  // known and there is nothing to infer.
  const elements = [el(1, 'Old Signboard Name', { wheelchair: 'yes' }), el(2, 'SchwuZ')]
  assertEquals(pickMatchingElement(elements, 'SchwuZ', 'node/1').element?.id, 1)
})

Deno.test('a stale OSM id that is no longer nearby falls back to the name', () => {
  const elements = [el(2, 'SchwuZ', { wheelchair: 'yes' })]
  assertEquals(pickMatchingElement(elements, 'SchwuZ', 'node/999').element?.id, 2)
})

Deno.test('unnamed elements are never candidates', () => {
  const elements = [{ type: 'node', id: 7, tags: { wheelchair: 'yes' } }]
  assertEquals(pickMatchingElement(elements, 'SchwuZ').reason, 'no_match')
})

Deno.test('an empty element list is no_match, and the caller treats it as unknown', () => {
  assertEquals(pickMatchingElement([], 'SchwuZ').reason, 'no_match')
})
