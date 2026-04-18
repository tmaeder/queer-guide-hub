import { describe, it, expect } from 'vitest';
import { normalizeEntity } from '../../src/normalize/normalize.js';
import type { SourceRawEntity } from '../../src/types/schemas.js';

function makeRaw(overrides: Partial<SourceRawEntity> & { raw_data: Record<string, unknown> }): SourceRawEntity {
  return {
    source_name: 'wikipedia',
    source_id: 'test-1',
    entity_type: 'place',
    url: 'https://example.com',
    fetched_at: new Date(),
    ...overrides,
  };
}

function ok<T>(result: { ok: true; entity: T } | { ok: false; reason: string }): T {
  if (!result.ok) throw new Error(`expected ok, got reject: ${result.reason}`);
  return result.entity;
}

describe('normalizeEntity', () => {
  describe('place normalization', () => {
    it('normalizes a valid place entity', () => {
      const raw = makeRaw({
        entity_type: 'place',
        raw_data: {
          name: '  The Castro  ',
          description: 'Famous LGBTQ+ neighborhood',
          city: 'San Francisco',
          country: 'United States',
          region: 'California',
          source_url: 'https://en.wikipedia.org/wiki/List_of_gay_villages',
        },
      });

      const e = ok(normalizeEntity(raw));
      expect(e.type).toBe('place');
      expect(e.data.name).toBe('The Castro');
      expect(e.data.city).toBe('San Francisco');
      expect(e.data.country).toBe('United States');
    });

    it('rejects with structured reason for missing fields', () => {
      const res1 = normalizeEntity(makeRaw({
        entity_type: 'place',
        raw_data: { name: 'Test', city: null, country: 'US' },
      }));
      expect(res1.ok).toBe(false);
      if (!res1.ok) expect(res1.reason).toBe('missing_city');

      const res2 = normalizeEntity(makeRaw({
        entity_type: 'place',
        raw_data: { name: '', city: 'X', country: 'Y' },
      }));
      expect(res2.ok).toBe(false);
      if (!res2.ok) expect(res2.reason).toBe('missing_name');

      const res3 = normalizeEntity(makeRaw({
        entity_type: 'place',
        raw_data: { name: 'N', city: 'X', country: null },
      }));
      expect(res3.ok).toBe(false);
      if (!res3.ok) expect(res3.reason).toBe('missing_country');
    });
  });

  describe('venue normalization', () => {
    it('normalizes a valid venue', () => {
      const raw = makeRaw({
        entity_type: 'venue',
        source_name: 'travelgay',
        raw_data: {
          name: "Tom's Bar",
          description: 'Popular gay bar',
          city: 'Berlin',
          country: 'Germany',
          address: 'Motzstraße 19',
          website: 'https://tomsbar.de',
          source_url: 'https://travelgay.com/tom-bar-berlin/',
        },
      });

      const e = ok(normalizeEntity(raw));
      expect(e.type).toBe('venue');
      expect(e.data.name).toBe("Tom's Bar");
      expect(e.data.website).toBe('https://tomsbar.de');
    });

    it('stores country as null (not empty string) when missing', () => {
      const raw = makeRaw({
        entity_type: 'venue',
        source_name: 'patroc',
        raw_data: {
          name: 'X',
          city: 'London',
          country: null,
          source_url: 'https://patroc.com/gay/london/',
        },
      });
      const e = ok(normalizeEntity(raw));
      expect(e.data.country).toBeNull();
    });

    it('adds https:// to bare domain websites', () => {
      const raw = makeRaw({
        entity_type: 'venue',
        source_name: 'patroc',
        raw_data: {
          name: 'Test Bar',
          city: 'London',
          country: 'UK',
          website: 'testbar.co.uk',
          source_url: 'https://patroc.com/gay/london/',
        },
      });

      const e = ok(normalizeEntity(raw));
      expect(e.data.website).toBe('https://testbar.co.uk');
    });
  });

  describe('event normalization', () => {
    it('normalizes a valid event', () => {
      const raw = makeRaw({
        entity_type: 'event',
        source_name: 'iglta',
        raw_data: {
          name: 'Berlin Pride',
          city: 'Berlin',
          country: 'Germany',
          start_datetime: '2026-07-25T12:00:00Z',
          end_datetime: '2026-07-25T22:00:00Z',
          timezone: 'Europe/Berlin',
          source_url: 'https://iglta.org/events/berlin-pride',
        },
      });

      const e = ok(normalizeEntity(raw));
      expect(e.type).toBe('event');
      expect(e.data.name).toBe('Berlin Pride');
      expect(e.data.timezone).toBe('Europe/Berlin');
    });

    it('infers timezone when not provided', () => {
      const raw = makeRaw({
        entity_type: 'event',
        source_name: 'outsavvy',
        raw_data: {
          name: 'London Drag Night',
          city: 'London',
          country: 'United Kingdom',
          start_datetime: '2026-03-15T20:00:00Z',
          source_url: 'https://outsavvy.com/event/123/london-drag-night',
        },
      });

      const e = ok(normalizeEntity(raw));
      expect(e.data.timezone).toBe('Europe/London');
    });

    it('rejects event without start date with structured reason', () => {
      const res = normalizeEntity(makeRaw({
        entity_type: 'event',
        source_name: 'iglta',
        raw_data: { name: 'Some Event', start_datetime: null },
      }));
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.reason).toBe('unparseable_start_date');
    });
  });

  describe('stay normalization', () => {
    it('normalizes a valid stay', () => {
      const raw = makeRaw({
        entity_type: 'stay',
        source_name: 'misterbnb',
        raw_data: {
          name: 'Cozy Studio Marais',
          city: 'Paris',
          country: 'France',
          price_range: '$80/night',
          source_url: 'https://misterbandb.com/listing/12345',
        },
      });

      const e = ok(normalizeEntity(raw));
      expect(e.type).toBe('stay');
      expect(e.data.name).toBe('Cozy Studio Marais');
    });
  });

  describe('geo normalization', () => {
    it('parses valid geo coordinates', () => {
      const raw = makeRaw({
        entity_type: 'venue',
        raw_data: {
          name: 'Test', city: 'London', country: 'UK',
          geo: { lat: 51.5074, lng: -0.1278 },
          source_url: 'https://example.com',
        },
      });
      const e = ok(normalizeEntity(raw));
      expect(e.data.lat).toBe(51.5074);
      expect(e.data.lng).toBe(-0.1278);
    });

    it('preserves coordinates at the prime meridian (lng=0)', () => {
      // The original bug: `geo?.lng || null` nulled Greenwich (lng=0).
      const raw = makeRaw({
        entity_type: 'venue',
        raw_data: {
          name: 'Greenwich', city: 'London', country: 'UK',
          geo: { lat: 51.4779, lng: 0 },
          source_url: 'https://example.com',
        },
      });
      const e = ok(normalizeEntity(raw));
      expect(e.data.lat).toBe(51.4779);
      expect(e.data.lng).toBe(0);
    });

    it('rejects (0,0) as "Null Island"', () => {
      const raw = makeRaw({
        entity_type: 'venue',
        raw_data: {
          name: 'X', city: 'Y', country: 'Z',
          geo: { lat: 0, lng: 0 },
          source_url: 'https://example.com',
        },
      });
      const e = ok(normalizeEntity(raw));
      expect(e.data.lat).toBeNull();
      expect(e.data.lng).toBeNull();
    });

    it('rejects out-of-range coordinates', () => {
      const raw = makeRaw({
        entity_type: 'venue',
        raw_data: {
          name: 'Test', city: 'London', country: 'UK',
          geo: { lat: 999, lng: -999 },
          source_url: 'https://example.com',
        },
      });
      const e = ok(normalizeEntity(raw));
      expect(e.data.lat).toBeNull();
      expect(e.data.lng).toBeNull();
    });
  });

  describe('tag normalization', () => {
    it('deduplicates and lowercases tags', () => {
      const raw = makeRaw({
        entity_type: 'venue',
        raw_data: {
          name: 'Test', city: 'London', country: 'UK',
          tags: ['Bar', 'bar', 'LGBTQ', 'lgbtq', 'Nightlife'],
          source_url: 'https://example.com',
        },
      });
      const e = ok(normalizeEntity(raw));
      expect(e.data.tags).toEqual(['bar', 'lgbtq', 'nightlife']);
    });
  });
});
