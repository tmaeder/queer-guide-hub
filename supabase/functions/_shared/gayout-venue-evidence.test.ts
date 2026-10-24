import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import { gayoutVenueEvidence, gayoutShortDescription } from './gayout-venue-evidence.ts'
const venue = { id: 'x', name: 'Brisotel', latitude: -8.8657789, longitude: 13.1992332, country_code: 'AO', source_url: 'https://www.gayout.com/africa/angola/luanda/hotels/brisotel', publisher_venue_id: 28148 }
const description = 'Small hotel in Luanda, Angola, listed as gay-friendly. Few reviews, so confirm details before booking.'
const node = { '@type': 'LodgingBusiness', name: 'Brisotel', url: venue.source_url, description, telephone: '933 472 424', address: { addressCountry: 'AO' }, geo: { latitude: '-8.86577890', longitude: '13.19923320' } }
const html = (data: unknown = node, id = 28148) => `<button id="venue-checkin-btn" data-venue-id="${id}"></button><script type="application/ld+json">${JSON.stringify(data)}</script>`
Deno.test('registered business facts retain attribution without inventing an official website', () => {
  const proof = gayoutVenueEvidence(venue, html())!
  assertEquals(proof.phone_raw, '933 472 424'); assertEquals(proof.description, description)
  assertEquals('website' in proof, false); assertEquals(proof.human_reviewed, false)
})
Deno.test('listing IDs names countries and coordinates must independently agree', () => {
  assertEquals(gayoutVenueEvidence(venue, html(node, 123)), null)
  for (const changed of [{ ...node, name: 'Other Hotel' }, { ...node, url: 'https://www.gayout.com/other' }, { ...node, address: { addressCountry: 'ZA' } }, { ...node, geo: { latitude: 0, longitude: 0 } }, { ...node, geo: { latitude: -8.9, longitude: 13.3 } }, { ...node, geo: { latitude: '', longitude: '' } }]) assertEquals(gayoutVenueEvidence(venue, html(changed)), null)
})
Deno.test('multiple matching entities cannot silently select the first JSON-LD row', () => {
  assertEquals(gayoutVenueEvidence(venue, html([node, node])), null)
})
Deno.test('publisher telephone cannot be borrowed from page chrome or a different entity', () => {
  const proof = gayoutVenueEvidence(venue, html({ ...node, telephone: undefined }) + '<a href="tel:999999999">Embassy</a>')!
  assertEquals(proof.phone_raw, null); assertEquals(proof.description, description)
})
Deno.test('graph nodes work without using breadcrumb or unrelated business data', () => {
  assertEquals(gayoutVenueEvidence(venue, html({ '@graph': [{ '@type': 'Organization', name: 'GayOut', url: 'https://www.gayout.com', telephone: '000000000' }, node] }))?.phone_raw, '933 472 424')
})
Deno.test('description is a bounded complete publisher summary, never long copyrighted review prose', () => {
  assertEquals(gayoutShortDescription(description), description)
  for (const value of ['Short', '<p>'+description+'</p>', description+' Cookie policy.', Array(30).fill('description').join(' ')]) assertEquals(gayoutShortDescription(value), null)
})
Deno.test('generic malformed or dagger-marked identities stay unresolved', () => {
  for (const changed of [{ ...venue, publisher_venue_id: 0 }, { ...venue, name: 'Hotel' }, { ...venue, name: '†Brisotel' }, { ...venue, source_url: venue.source_url+'?other=1' }]) assertEquals(gayoutVenueEvidence(changed, html()), null)
})
