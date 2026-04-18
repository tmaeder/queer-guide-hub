import { describe, it, expect } from 'vitest'
import { normalizeVenue } from '../../src/normalize/venue.js'
import type { SourceRawEntity } from '../../src/normalize/schema.js'

const baseRaw: SourceRawEntity = {
  source: 'travelgay',
  sourceId: 'travelgay-venue-the-eagle-london',
  entityType: 'venue',
  url: 'https://www.travelgay.com/venue/the-eagle',
  name: 'The Eagle',
  description: 'A popular gay bar in South London.',
  tags: ['bar', 'lgbtq+'],
  city: 'London',
  country: 'UK',
  website: 'https://www.eaglebar.co.uk',
  phone: '+44 20 7639 1173',
  venueType: 'bar',
  images: [],
  amenities: [],
  fetchedAt: new Date().toISOString(),
}

describe('normalizeVenue', () => {
  it('produces a valid NormalizedVenue', () => {
    const venue = normalizeVenue(baseRaw)
    expect(venue.entityType).toBe('venue')
    expect(venue.name).toBe('The Eagle')
    expect(venue.city).toBe('London')
    expect(venue.country).toBe('United Kingdom') // canonicalised
    expect(venue.venueType).toBe('bar')
    expect(venue.slug).toContain('the-eagle')
    expect(venue.sourceUrl).toBe(baseRaw.url)
  })

  it('generates a slug from name+city+canonical-country', () => {
    const venue = normalizeVenue(baseRaw)
    // 'UK' is canonicalised to 'United Kingdom' before slugification
    expect(venue.slug).toBe('the-eagle-london-united-kingdom')
  })

  it('handles missing optional fields gracefully', () => {
    const raw: SourceRawEntity = {
      ...baseRaw,
      description: undefined,
      phone: undefined,
      geo: undefined,
      website: undefined,
    }
    const venue = normalizeVenue(raw)
    expect(venue.description).toBeNull()
    expect(venue.phone).toBeNull()
    expect(venue.geo).toBeNull()
    expect(venue.website).toBeNull()
  })

  it('caps the image list at 20', () => {
    const raw: SourceRawEntity = {
      ...baseRaw,
      images: Array.from({ length: 30 }, (_, i) => `https://example.com/img${i}.jpg`),
    }
    const venue = normalizeVenue(raw)
    expect(venue.images.length).toBe(20)
  })

  it('deduplicates tags', () => {
    const raw: SourceRawEntity = {
      ...baseRaw,
      tags: ['lgbtq+', 'LGBTQ+', 'bar', 'Bar'],
    }
    const venue = normalizeVenue(raw)
    expect(venue.tags.length).toBe(2)
  })

  it('appends slug suffix when provided', () => {
    const venue = normalizeVenue(baseRaw, '2')
    expect(venue.slug.endsWith('-2')).toBe(true)
  })
})
