import { assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  classifyGeocodeError,
  classifyGeocodeStatus,
  GeocodeFailure,
  parsePhotonReverse,
  reverseGeocode,
} from './reverse-geocode.ts'

// Every fixture below is a REAL Photon response, captured 2026-10-22 with
// &lang=en. Hand-written fixtures are how a parser gets tested against the
// shape you imagine instead of the shape the provider sends.
const LOS_ANGELES = {
  features: [{
    properties: {
      osm_type: 'N', osm_id: 4253186548, osm_key: 'amenity', osm_value: 'events_venue',
      type: 'house', name: 'Ronald F. Deaton Civic Auditorium', street: 'South Main Street',
      locality: 'Civic Center', district: 'Downtown', city: 'Los Angeles',
      county: 'Los Angeles', state: 'California', country: 'United States',
      postcode: '90013', countrycode: 'US',
    },
  }],
}
const ZURICH = {
  features: [{
    properties: {
      name: 'Bahnhofquai', locality: 'City', district: 'Altstadt', city: 'Zurich',
      county: 'Bezirk Zurich', state: 'Zurich', country: 'Switzerland',
      postcode: '8001', countrycode: 'CH',
    },
  }],
}

Deno.test('429 and 5xx are transient; every other 4xx is hard', () => {
  assertEquals(classifyGeocodeStatus(429), 'transient')
  for (const s of [500, 502, 503, 504]) assertEquals(classifyGeocodeStatus(s), 'transient')
  // THE LOAD-BEARING HALF. A 403 is the upstream refusing us, which is exactly
  // what killed the Nominatim path for 28 days. If this ever reads 'transient'
  // the same outage goes green again.
  assertEquals(classifyGeocodeStatus(403), 'hard')
  assertEquals(classifyGeocodeStatus(401), 'hard')
  assertEquals(classifyGeocodeStatus(404), 'hard')
  assertEquals(classifyGeocodeStatus(400), 'hard')
})

Deno.test('a thrown network error is transient, an unknown one is hard', () => {
  assertEquals(classifyGeocodeError('The signal has been aborted'), 'transient')
  assertEquals(classifyGeocodeError('operation timed out'), 'transient')
  assertEquals(classifyGeocodeError('connection reset by peer'), 'transient')
  assertEquals(classifyGeocodeError('Cannot read properties of undefined'), 'hard')
})

Deno.test('parses a real Photon feature onto the stored fields', () => {
  const r = parsePhotonReverse(LOS_ANGELES)!
  assertEquals(r.countryCode, 'US')
  assertEquals(r.country, 'United States')
  assertEquals(r.city, 'Los Angeles')
  // `county` is "Los Angeles" here and is NOT a state. If state ever falls back
  // to county, this row would claim the venue's admin-1 is "Los Angeles" and
  // the same-name-twin check downstream reads a city as a state.
  assertEquals(r.state, 'California')
  assertEquals(
    r.address,
    'Ronald F. Deaton Civic Auditorium, South Main Street, 90013, Los Angeles, California, United States',
  )
})

Deno.test('lang=en country names match what countries.name holds', () => {
  // Without &lang=en Photon returns "Schweiz/Suisse/Svizzera/Svizra", which
  // canonCountry cannot resolve, so every CH venue would silently become
  // "no opinion" instead of a verified match.
  assertEquals(parsePhotonReverse(ZURICH)!.country, 'Switzerland')
  assertEquals(parsePhotonReverse(ZURICH)!.countryCode, 'CH')
})

Deno.test('state is NEVER filled from county, even when state is absent', () => {
  // The LA fixture above has a real `state`, so it cannot detect a county
  // fallback at all — the fallback only fires when state is missing. Measured:
  // mutating `state` to fall back to county SURVIVED the LA assertion. This is
  // the input that makes the refusal observable.
  const noState = {
    features: [{ properties: { city: 'Los Angeles', county: 'Los Angeles', countrycode: 'US' } }],
  }
  assertEquals(parsePhotonReverse(noState)!.state, null)
  assertEquals(parsePhotonReverse(noState)!.city, 'Los Angeles')
})

Deno.test('city falls through the specificity ladder, never to county', () => {
  const noCity = { features: [{ properties: { district: 'Shinjuku', county: 'Wrong', countrycode: 'JP' } }] }
  assertEquals(parsePhotonReverse(noCity)!.city, 'Shinjuku')
  const onlyCounty = { features: [{ properties: { county: 'Nowhere', countrycode: 'JP' } }] }
  assertEquals(parsePhotonReverse(onlyCounty)!.city, null)
})

Deno.test('no feature is null, not an empty verdict', () => {
  // A 200 with no features means "no data here". Returning a filled-in object
  // of nulls would store a row that reads like a checked venue.
  assertEquals(parsePhotonReverse({ features: [] }), null)
  assertEquals(parsePhotonReverse({}), null)
})

Deno.test('address drops empty parts instead of emitting bare commas', () => {
  const sparse = { features: [{ properties: { city: 'Berlin', country: 'Germany', countrycode: 'DE' } }] }
  assertEquals(parsePhotonReverse(sparse)!.address, 'Berlin, Germany')
})

// --- transport: the classification has to survive the fetch boundary --------
function withStubbedFetch(resp: () => Promise<Response>, fn: () => Promise<void>) {
  const real = globalThis.fetch
  globalThis.fetch = resp as unknown as typeof fetch
  return fn().finally(() => { globalThis.fetch = real })
}

Deno.test('a 403 surfaces as a HARD GeocodeFailure', async () => {
  await withStubbedFetch(
    () => Promise.resolve(new Response('forbidden', { status: 403 })),
    async () => {
      const e = await assertRejects(
        () => reverseGeocode(47.37, 8.54, new AbortController().signal),
        GeocodeFailure,
      )
      assertEquals((e as GeocodeFailure).kind, 'hard')
      assertEquals(e.message, 'Reverse geocoding HTTP 403')
    },
  )
})

Deno.test('a 429 surfaces as a TRANSIENT GeocodeFailure', async () => {
  await withStubbedFetch(
    () => Promise.resolve(new Response('slow down', { status: 429 })),
    async () => {
      const e = await assertRejects(
        () => reverseGeocode(47.37, 8.54, new AbortController().signal),
        GeocodeFailure,
      )
      assertEquals((e as GeocodeFailure).kind, 'transient')
    },
  )
})

Deno.test('an aborted fetch is TRANSIENT, not a verdict about the provider', async () => {
  await withStubbedFetch(
    () => Promise.reject(new Error('The signal has been aborted')),
    async () => {
      const e = await assertRejects(
        () => reverseGeocode(47.37, 8.54, new AbortController().signal),
        GeocodeFailure,
      )
      assertEquals((e as GeocodeFailure).kind, 'transient')
    },
  )
})

Deno.test('a 200 is parsed, and the request carries lang=en and a contact UA', async () => {
  let seenUrl = ''
  let seenUa = ''
  await withStubbedFetch(
    ((url: string, init: RequestInit) => {
      seenUrl = url
      seenUa = (init.headers as Record<string, string>)['User-Agent']
      return Promise.resolve(new Response(JSON.stringify(ZURICH), { status: 200 }))
    }) as unknown as () => Promise<Response>,
    async () => {
      const r = await reverseGeocode(47.3769, 8.5417, new AbortController().signal)
      assertEquals(r!.countryCode, 'CH')
      // Both are contractual, not cosmetic: lang=en is what makes the country
      // name resolvable, and OSM-derived services ask for a contact UA.
      assertEquals(seenUrl.includes('lang=en'), true)
      assertEquals(seenUrl.includes('lat=47.3769'), true)
      assertEquals(seenUa.includes('queer.guide'), true)
    },
  )
})
