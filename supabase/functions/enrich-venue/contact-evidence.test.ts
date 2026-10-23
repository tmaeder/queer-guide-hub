import { assertEquals, assertRejects } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { collectContactEvidence, matchingContactPlace, type ContactVenue } from './contact-evidence.ts'
import { ProviderUnavailable } from './provider-outcomes.ts'
const venue: ContactVenue = { id: 'native', name: 'Café Example', latitude: 47, longitude: 8,
  country_code: 'CH', country_id: 'country', city_id: 'city', organization_id: 'org',
  updated_at: '2026-10-23', address: 'Example Street 12, Zurich' }
const place = { fsq_place_id: '1234567890abcdef12345678', name: 'Cafe Example', latitude: 47, longitude: 8,
  location: { country: 'CH', address: 'Example Street 12' }, website: 'https://venue.example/',
  tel: '+41441234567', unresolved_flags: [] }

Deno.test('contact evidence requires unique current name, country, coordinates and compatible address', () => {
  const result = matchingContactPlace(venue, [place])
  assertEquals(result?.website, 'https://venue.example/')
  assertEquals(result?.phone, '+41441234567')
  assertEquals(result?.human_reviewed, false)
  assertEquals(matchingContactPlace(venue, [place, place]), null)
  for (const patch of [{ name: 'Other' }, { latitude: 48 }, { date_closed: '2026-01-01' },
    { location: { country: 'DE', address: 'Example Street 12' } },
    { location: { country: 'CH', address: 'Example Street 14' } },
    { location: { country: 'CH', address: 'Example Street 1' } },
    { unresolved_flags: ['duplicate'] }, { latitude: NaN }, { fsq_place_id: 'unknown' }]) {
    assertEquals(matchingContactPlace(venue, [{ ...place, ...patch }]), null)
  }
})

Deno.test('addressless identities need the tighter distance and unsuitable contacts stay unresolved', () => {
  assertEquals(!!matchingContactPlace({ ...venue, address: null }, [place]), true)
  assertEquals(matchingContactPlace({ ...venue, address: null }, [{ ...place, latitude: 47.0004 }]), null)
  assertEquals(matchingContactPlace(venue, [{ ...place, website: 'http://127.0.0.1/', tel: 'call me' }]), null)
  assertEquals(matchingContactPlace(venue, [{ ...place, website: 'https://user:password@venue.example/', tel: '' }]), null)
  assertEquals(matchingContactPlace({ ...venue, latitude: Infinity }, [place]), null)
})

Deno.test('a supplied native locality may qualify a name but generic or other business names cannot match', () => {
  const local = { ...venue, name: 'Example Hotel Zurich', city_name: 'Zurich' }
  assertEquals(!!matchingContactPlace(local, [{ ...place, name: 'Example Hotel' }]), true)
  assertEquals(matchingContactPlace({ ...local, name: 'Hotel Zurich' }, [{ ...place, name: 'Hotel' }]), null)
  assertEquals(matchingContactPlace(local, [{ ...place, name: 'Other Hotel Zurich' }]), null)
  assertEquals(matchingContactPlace({ ...local, city_name: 'Basel' }, [{ ...place, name: 'Example Hotel' }]), null)
})

Deno.test('scoped capture retains raw source hash and has no credentials in its receipt', async () => {
  const original = globalThis.fetch
  globalThis.fetch = (input, init) => {
    const url = new URL(String(input))
    assertEquals(url.searchParams.get('ll'), '47,8')
    assertEquals(url.searchParams.get('radius'), '100')
    assertEquals(url.searchParams.get('limit'), '50')
    assertEquals(new Headers(init?.headers).get('authorization'), 'Bearer private-key')
    return Promise.resolve(Response.json({ results: [place] }))
  }
  try {
    const result = await collectContactEvidence(venue, 'private-key')
    assertEquals(result.outcome, 'corroborated')
    assertEquals(result.payload_sha256.length, 64)
    assertEquals(JSON.stringify(result).includes('private-key'), false)
    assertEquals(JSON.parse(result.payload_text).results[0].name, place.name)
  } finally { globalThis.fetch = original }
})

Deno.test('source outages and oversized captures cannot become negative contact evidence', async () => {
  const original = globalThis.fetch
  try {
    globalThis.fetch = () => Promise.resolve(new Response('', { status: 429 }))
    await assertRejects(() => collectContactEvidence(venue, 'key'), ProviderUnavailable)
    globalThis.fetch = () => Promise.resolve(new Response('x'.repeat(1_000_001)))
    await assertRejects(() => collectContactEvidence(venue, 'key'), ProviderUnavailable)
    globalThis.fetch = () => Promise.resolve(Response.json({ results: [place, ...Array.from({ length: 49 }, () => ({ name: 'Other' }))] }))
    assertEquals((await collectContactEvidence(venue, 'key')).proof, null)
  } finally { globalThis.fetch = original }
})
