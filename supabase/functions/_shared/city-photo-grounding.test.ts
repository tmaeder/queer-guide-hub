import { assert, assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { cityPhotoIsGrounded, commonsPhotoLocation, validCityPhotoPoint } from './city-photo-grounding.ts'

const location = (latitude: number, longitude: number) => ({ latitude, longitude, datum: 'WGS-84' as const, source: 'commons_extended_metadata' as const })
const photo = (latitude: number, longitude: number) => ({ source: 'wikimedia', license: 'CC BY-SA 4.0', photographer: 'Published creator', location: location(latitude, longitude) })

Deno.test('source locations reject York/New York and Hudson/Hudson River Park namesakes', () => {
  const nyc = photo(40.7335, -74.0106)
  assertEquals(cityPhotoIsGrounded(nyc, { latitude: 53.95763, longitude: -1.08271 }), false)
  assertEquals(cityPhotoIsGrounded(nyc, { latitude: 42.2528649, longitude: -73.790959 }), false)
  assert(cityPhotoIsGrounded(nyc, { latitude: 40.7128, longitude: -74.006 }))
  assertEquals(cityPhotoIsGrounded(photo(50.8225, -0.1372), { latitude: 43.09284973, longitude: -77.64831543 }), false)
})

Deno.test('source coordinate guard accepts actual nearby city photos and bounds the radius', () => {
  assert(cityPhotoIsGrounded(photo(51.991250, 13.084722), { latitude: 51.996, longitude: 13.079 }))
  assert(cityPhotoIsGrounded(photo(53.679346, 10.242726), { latitude: 53.67472222, longitude: 10.24111111 }))
  const longitude = (km: number) => 1 + km / 6371 * 180 / Math.PI
  assert(cityPhotoIsGrounded(photo(0, longitude(9.999)), { latitude: 0, longitude: 1 }))
  assertEquals(cityPhotoIsGrounded(photo(0, longitude(10.001)), { latitude: 0, longitude: 1 }), false)
  assert(cityPhotoIsGrounded(photo(0, -179.999), { latitude: 0, longitude: 179.999 }))
})

Deno.test('missing, malformed and unknown-datum coordinates never become source evidence', () => {
  const good = { GPSLatitude: { value: '51.991250' }, GPSLongitude: { value: '13.084722' }, GPSMapDatum: { value: 'WGS-84' } }
  assertEquals(commonsPhotoLocation(good), location(51.991250, 13.084722))
  for (const value of ['', ' ', 'NaN', '1e2', '0x20', '52 north', '<b>52</b>', true, null, 91]) {
    assertEquals(commonsPhotoLocation({ ...good, GPSLatitude: { value } }), undefined)
  }
  for (const value of ['', 'EPSG:3857', undefined]) {
    assertEquals(commonsPhotoLocation({ ...good, GPSMapDatum: { value } }), undefined)
  }
  assertEquals(commonsPhotoLocation({ ...good, GPSLatitude: { value: 0 }, GPSLongitude: { value: 0 } }), undefined)
  assertEquals(commonsPhotoLocation({ ...good, GPSLongitude: { value: 181 } }), undefined)
  assertEquals(validCityPhotoPoint({ latitude: 0, longitude: 0 }), false)
  assertEquals(validCityPhotoPoint({ latitude: ' ', longitude: 1 }), false)
})

Deno.test('city grounding requires actual supported source licensing and a stored city point', () => {
  const city = { latitude: 51.99125, longitude: 13.084722 }
  assertEquals(cityPhotoIsGrounded({ source: 'pexels', license: 'CC0', location: location(51.99125, 13.084722) }, city), false)
  assertEquals(cityPhotoIsGrounded({ source: 'wikimedia', license: 'CC0' }, city), false)
  for (const license of ['', 'CC', 'unknown', 'unknown_pending_verification', 'All rights reserved', 'CC BY-NC 4.0']) {
    assertEquals(cityPhotoIsGrounded({ ...photo(51.99125, 13.084722), license }, city), false)
  }
  for (const license of ['CC0', 'CC BY 3.0', 'CC BY-SA 2.0', 'Public domain']) {
    assert(cityPhotoIsGrounded({ ...photo(51.99125, 13.084722), license }, city))
  }
  for (const photographer of ['', 'Unknown', 'Unknown author', 'No machine-readable author provided. Creator assumed.']) {
    assertEquals(cityPhotoIsGrounded({ ...photo(51.99125, 13.084722), photographer }, city), false)
  }
  assert(cityPhotoIsGrounded({ ...photo(51.99125, 13.084722), license: 'CC0', photographer: '' }, city))
  assertEquals(cityPhotoIsGrounded(photo(51.99125, 13.084722), null), false)
})

