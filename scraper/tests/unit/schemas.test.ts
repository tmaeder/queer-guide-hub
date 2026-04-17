import { describe, it, expect } from 'vitest';
import {
  SourceName,
  EntityType,
  GeoSchema,
  PlaceSchema,
  VenueSchema,
  EventSchema,
  StaySchema,
} from '../../src/types/schemas.js';

describe('SourceName enum', () => {
  it('accepts valid source names', () => {
    expect(SourceName.parse('wikipedia')).toBe('wikipedia');
    expect(SourceName.parse('iglta')).toBe('iglta');
    expect(SourceName.parse('outsavvy')).toBe('outsavvy');
    expect(SourceName.parse('travelgay')).toBe('travelgay');
    expect(SourceName.parse('patroc')).toBe('patroc');
    expect(SourceName.parse('misterbnb')).toBe('misterbnb');
  });

  it('rejects invalid source names', () => {
    expect(() => SourceName.parse('unknown')).toThrow();
  });
});

describe('EntityType enum', () => {
  it('accepts valid entity types', () => {
    expect(EntityType.parse('venue')).toBe('venue');
    expect(EntityType.parse('event')).toBe('event');
    expect(EntityType.parse('place')).toBe('place');
    expect(EntityType.parse('stay')).toBe('stay');
  });
});

describe('GeoSchema', () => {
  it('accepts valid coordinates', () => {
    expect(GeoSchema.parse({ lat: 51.5074, lng: -0.1278 })).toEqual({ lat: 51.5074, lng: -0.1278 });
  });

  it('rejects out-of-range lat', () => {
    expect(() => GeoSchema.parse({ lat: 91, lng: 0 })).toThrow();
    expect(() => GeoSchema.parse({ lat: -91, lng: 0 })).toThrow();
  });

  it('rejects out-of-range lng', () => {
    expect(() => GeoSchema.parse({ lat: 0, lng: 181 })).toThrow();
    expect(() => GeoSchema.parse({ lat: 0, lng: -181 })).toThrow();
  });
});

describe('PlaceSchema', () => {
  it('validates a minimal place', () => {
    const place = PlaceSchema.parse({
      name: 'The Castro',
      city: 'San Francisco',
      country: 'United States',
      source_url: 'https://example.com',
    });
    expect(place.name).toBe('The Castro');
    expect(place.tags).toEqual([]);
    expect(place.images).toEqual([]);
  });
});

describe('VenueSchema', () => {
  it('validates a full venue', () => {
    const venue = VenueSchema.parse({
      name: 'The Eagle',
      city: 'London',
      country: 'United Kingdom',
      address: '349 Kennington Lane',
      website: 'https://eaglelondon.com',
      source_url: 'https://travelgay.com/eagle-london/',
      tags: ['bar', 'leather'],
    });
    expect(venue.name).toBe('The Eagle');
    expect(venue.tags).toEqual(['bar', 'leather']);
  });
});

describe('EventSchema', () => {
  it('validates a minimal event', () => {
    const event = EventSchema.parse({
      name: 'Berlin Pride',
      start_datetime: new Date('2026-07-25'),
      source_url: 'https://example.com',
    });
    expect(event.name).toBe('Berlin Pride');
    expect(event.timezone).toBe('UTC');
  });

  it('requires start_datetime', () => {
    expect(() => EventSchema.parse({ name: 'Test', source_url: 'https://example.com' })).toThrow();
  });
});

describe('StaySchema', () => {
  it('validates a minimal stay', () => {
    const stay = StaySchema.parse({
      name: 'Cozy Studio',
      city: 'Paris',
      country: 'France',
      source_url: 'https://misterbandb.com/listing/1',
    });
    expect(stay.name).toBe('Cozy Studio');
  });
});
