/**
 * Discovery bridge for an explicitly verified venue whose OSM object has no
 * LGBTQ tags. Evidence is separate from OSM and expires; never manufacture tags.
 * Source checked 2026-11-18: https://cafemanhattan.co.za/ explicitly identifies
 * an LGBTQI+ owned bar & kitchen at 74 Waterkant Street, Cape Town. The address
 * matches live OSM node 4802447522. Coverage is this candidate, not the city.
 */
export function verifiedSeeds(city: string, now = Date.now()) {
  const checkedAt = '2026-11-18T00:00:00Z'
  const age = now - Date.parse(checkedAt)
  if (city !== 'Cape Town' || age < 0 || age > 90 * 86_400_000) return []
  return [{
    id: 4802447522, lat: -33.9162396, lon: 18.417165,
    evidence: {
      source_url: 'https://cafemanhattan.co.za/',
      checked_at: checkedAt,
      expires_at: '2027-02-16T00:00:00Z',
      claim: 'LGBTQI+ owned bar & kitchen',
      expected_name: 'Cafe Manhattan',
      expected_house_number: '74',
      expected_street: 'Waterkant Street',
    },
  }]
}
export function matchesVerifiedSeed(tags: Record<string, string>, evidence: ReturnType<typeof verifiedSeeds>[number]['evidence']): boolean {
  const normalize = (value: string) => value.normalize('NFKD').replace(/\p{M}/gu, '').trim().toLowerCase()
  return normalize(tags.name ?? '') === normalize(evidence.expected_name) &&
    tags['addr:housenumber'] === evidence.expected_house_number &&
    normalize(tags['addr:street'] ?? '') === normalize(evidence.expected_street) &&
    ['restaurant', 'bar', 'pub'].includes(tags.amenity)
}
