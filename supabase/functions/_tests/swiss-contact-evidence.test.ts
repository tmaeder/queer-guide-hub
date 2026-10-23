import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { contactEvidence } from '../../../scripts/data-quality/collect-swiss-osm-contact-evidence.ts'
const venue = { venue_id: 'venue', organization_id: 'org', name: 'Fixture Café', latitude: 47.37698, longitude: 8.53918, country_code: 'CH', city_id: 'city', country_id: 'country' }
const element = { type: 'node', id: 123, lat: venue.latitude, lon: venue.longitude, tags: { name: venue.name, amenity: 'cafe', website: 'https://cafe.example/contact', phone: '+41441234567', 'addr:country': 'CH' } }

Deno.test('Swiss contact evidence requires country, coordinates and unique nearby identity', () => {
  assertEquals(contactEvidence(venue, [element])?.website, 'https://cafe.example/contact')
  assertEquals(contactEvidence({ ...venue, country_code: 'DE' }, [element]), null)
  assertEquals(contactEvidence({ ...venue, latitude: 0 }, [element]), null)
  assertEquals(contactEvidence({ ...venue, latitude: Number.NaN }, [element]), null)
  assertEquals(contactEvidence({ ...venue, name: 'Another place' }, [element]), null)
  assertEquals(contactEvidence(venue, [{ ...element, lat: 47.4 }]), null)
  assertEquals(contactEvidence(venue, [element, { ...element, id: 124 }]), null)
  assertEquals(contactEvidence({ ...venue, name: '† Fixture Café' }, [element]), null)
})

Deno.test('Swiss evidence preserves conflicting country and disused place boundaries', () => {
  assertEquals(contactEvidence(venue, [{ ...element, tags: { ...element.tags, 'addr:country': 'FR' } }]), null)
  assertEquals(contactEvidence(venue, [{ ...element, tags: { ...element.tags, 'disused:amenity': 'cafe' } }]), null)
  assertEquals(contactEvidence(venue, [{ ...element, tags: { ...element.tags, opening_hours: 'closed' } }]), null)
  assertEquals(contactEvidence(venue, [{ ...element, id: -1 }]), null)
  assertEquals(contactEvidence(venue, [{ ...element, type: 'unknown' }]), null)
})

Deno.test('conflicting website hosts are not copied and source evidence remains explicit', () => {
  const conflicting = { ...element, tags: { ...element.tags, 'contact:website': 'https://different.example/' } }
  assertEquals(contactEvidence(venue, [conflicting])?.website, null)
  assertEquals(contactEvidence(venue, [element])?.source_url, 'https://www.openstreetmap.org/node/123')
  assertEquals(contactEvidence(venue, [element])?.element, element)
  assertEquals(contactEvidence(venue, [{ ...element, tags: { name: venue.name } }]), null)
})
