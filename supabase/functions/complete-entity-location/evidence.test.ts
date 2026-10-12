import { test } from 'node:test'
import assert from 'node:assert/strict'
import { acceptFeature, canQueryNamedPlace, selectFeature } from './evidence.ts'

const feature = (properties = {}, coordinates = [8.53, 47.37]) => ({ geometry: { coordinates }, properties: {
  countrycode: 'CH', city: 'Zürich', street: 'Kanzleistrasse', housenumber: '80', postcode: '8004', ...properties,
} })
test('accepts a matching street, house number, city and country', () => {
  assert.equal(acceptFeature({ address: 'Kanzleistrasse 80', city: 'Zürich' }, 'CH', feature(), false), true)
})
test('refuses country, city, house number and postcode contradictions', () => {
  for (const row of [
    { address: 'Kanzleistrasse 81', city: 'Zürich' },
    { address: 'Kanzleistrasse 80', city: 'Bern' },
    { address: 'Kanzleistrasse 80', city: 'Zürich', postal_code: '3000' },
  ]) assert.equal(acceptFeature(row, 'CH', feature(), false), false)
  assert.equal(acceptFeature({ address: 'Kanzleistrasse 80', city: 'Zürich' }, 'DE', feature(), false), false)
})
test('does not turn a city or street centroid into a precise location', () => {
  assert.equal(acceptFeature({ address: 'Kanzleistrasse 80', city: 'Zürich' }, 'CH', feature({ housenumber: '' }), false), false)
  assert.equal(acceptFeature({ address: 'Kanzleistrasse 80' }, 'CH', feature(), false), false)
})
test('reverse evidence must be within 250 metres and agree with known country/postcode', () => {
  const row = { latitude: 47.37, longitude: 8.53, postal_code: '8004' }
  assert.equal(acceptFeature(row, 'CH', feature(), true), true)
  assert.equal(acceptFeature(row, 'CH', feature({}, [8.6, 47.4]), true), false)
  assert.equal(acceptFeature(row, 'DE', feature(), true), false)
  assert.equal(acceptFeature(row, 'CH', feature({ postcode: '3000' }), true), false)
})
test('rejects null island and coordinates outside bounds', () => {
  for (const coords of [[0, 0], [181, 40], [8, 91], [NaN, 40]]) {
    assert.equal(acceptFeature({ address: 'Kanzleistrasse 80', city: 'Zürich' }, 'CH', feature({}, coords), false), false)
  }
})
test('uses a validated nearby postcode even when a waterway without one ranks first', () => {
  const row = { latitude: 47.37, longitude: 8.53 }
  const waterway = feature({ postcode: '', housenumber: '', street: '' })
  const address = feature()
  assert.equal(selectFeature(row, 'CH', [waterway, address], true), address)
  assert.equal(selectFeature(row, 'CH', [waterway, feature({ countrycode: 'DE' })], true), waterway)
})
test('accepts an exact named place with country, locality and postcode evidence', () => {
  const row = { name: 'Bare Oaks Family Naturist Park', address: 'Bare Oaks Family Naturist Park, Ontario, Canada', city: 'Ontario' }
  const poi = feature({ name: row.name, osm_key: 'tourism', street: 'Kennedy Road', housenumber: '20237',
    city: 'East Gwillimbury', state: 'Ontario', countrycode: 'CA', postcode: 'L0G 1V0' }, [-79.3697176, 44.1496418])
  assert.equal(canQueryNamedPlace(row, 'CA'), true)
  assert.equal(canQueryNamedPlace({ name: 'Public Bathroom', address: 'Public Bathroom, Deer Park', city: 'Deer Park' }, 'US'), false)
  assert.equal(acceptFeature(row, 'CA', poi, false), true)
  assert.equal(acceptFeature(row, 'US', poi, false), false)
  assert.equal(acceptFeature({ ...row, city: 'Quebec' }, 'CA', poi, false), false)
  assert.equal(acceptFeature(row, 'CA', { ...poi, properties: { ...poi.properties, osm_key: 'waterway' } }, false), false)
  assert.equal(acceptFeature(row, 'CA', { ...poi, properties: { ...poi.properties, name: 'Bare Oaks Road' } }, false), false)
})
test('rejects distant same-name POIs instead of choosing an ambiguous point', () => {
  const row = { name: 'Bare Oaks Family Naturist Park', address: 'Bare Oaks Family Naturist Park, Ontario, Canada', city: 'Ontario' }
  const props = { name: row.name, osm_key: 'tourism', city: 'East Gwillimbury', state: 'Ontario', countrycode: 'CA', postcode: 'L0G 1V0' }
  const nearby = { properties: props, geometry: { coordinates: [-79.3697, 44.1496] } }
  const distant = { properties: props, geometry: { coordinates: [-79.1, 44.3] } }
  assert.equal(selectFeature(row, 'CA', [nearby, distant], false), undefined)
  assert.equal(selectFeature(row, 'CA', [nearby, { ...distant, geometry: { coordinates: [-79.3742, 44.1476] } }], false), nearby)
})
