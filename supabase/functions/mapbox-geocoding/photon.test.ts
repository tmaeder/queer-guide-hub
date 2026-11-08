// Fixtures are real Photon responses captured 2026-11-08.
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { parseLngLat, photonLang, photonToMapbox } from './photon.ts'

const ZURICH_CITY = {
  type: 'Feature',
  properties: {
    osm_type: 'R', osm_id: 1682248, osm_key: 'place', osm_value: 'city', type: 'city',
    name: 'Zurich', state: 'Zurich', country: 'Switzerland', countrycode: 'CH',
  },
  geometry: { type: 'Point', coordinates: [8.5410422, 47.3744489] as [number, number] },
}

const BAHNHOFQUAI = {
  type: 'Feature',
  properties: {
    osm_type: 'W', osm_id: 889067535, osm_key: 'highway', osm_value: 'tertiary', type: 'street',
    name: 'Bahnhofquai', locality: 'City', district: 'Altstadt', city: 'Zurich',
    county: 'District Zurich', state: 'Zurich', country: 'Switzerland', postcode: '8001', countrycode: 'CH',
  },
  geometry: { type: 'Point', coordinates: [8.5416707, 47.376902] as [number, number] },
}

Deno.test('a settlement result becomes its own city and keeps Mapbox order [lng, lat]', () => {
  const f = photonToMapbox(ZURICH_CITY)!
  assertEquals(f.center, [8.5410422, 47.3744489])
  assertEquals(f.geometry.coordinates, f.center)
  assertEquals(f.properties.city, 'Zurich')
  assertEquals(f.properties.country, 'Switzerland')
  assertEquals(f.place_name, 'Zurich, Switzerland')
  assertEquals(f.id, 'photon.R1682248')
  assert(f.context.some((c) => c.id === 'place' && c.text === 'Zurich'))
})

Deno.test('a street result carries postcode and city into place_name and properties', () => {
  const f = photonToMapbox(BAHNHOFQUAI)!
  assertEquals(f.place_name, 'Bahnhofquai, 8001 Zurich, Switzerland')
  assertEquals(f.properties.postcode, '8001')
  assertEquals(f.properties.city, 'Zurich')
  assert(f.context.some((c) => c.id === 'postcode' && c.text === '8001'))
})

Deno.test('house numbers follow the country convention', () => {
  const ch = photonToMapbox({
    properties: { street: 'Langstrasse', housenumber: '12', city: 'Zurich', country: 'Switzerland', countrycode: 'CH' },
    geometry: { coordinates: [8.52, 47.37] },
  })!
  assertEquals(ch.place_name, 'Langstrasse 12, Zurich, Switzerland')
  const us = photonToMapbox({
    properties: { street: 'Riva Road', housenumber: '2496', city: 'Annapolis', country: 'United States', countrycode: 'US' },
    geometry: { coordinates: [-76.55, 38.97] },
  })!
  assertEquals(us.place_name, '2496 Riva Road, Annapolis, United States')
})

Deno.test('a feature without coordinates is dropped, never placed at 0,0', () => {
  assertEquals(photonToMapbox({ properties: { name: 'x' } }), null)
  assertEquals(photonToMapbox({ geometry: { coordinates: [NaN, 1] as [number, number] } }), null)
})

Deno.test('photonLang maps Accept-Language onto the languages Photon serves', () => {
  assertEquals(photonLang('de-CH,de;q=0.9,en;q=0.8'), 'de')
  assertEquals(photonLang('es-ES,es;q=0.9,fr;q=0.5'), 'fr')
  assertEquals(photonLang('ja'), 'en')
  assertEquals(photonLang(null), 'en')
})

Deno.test('parseLngLat accepts the Mapbox "lng,lat" convention and rejects junk', () => {
  assertEquals(parseLngLat('8.5417, 47.3769'), { lng: 8.5417, lat: 47.3769 })
  assertEquals(parseLngLat('47.3769'), null)
  assertEquals(parseLngLat('abc,def'), null)
  assertEquals(parseLngLat('8.5,95'), null)
})
