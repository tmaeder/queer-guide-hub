import { describe, it, expect } from 'vitest';
import { findDuplicates, findBestMatch, type DedupeCandidate } from '../../src/utils/dedupe.js';

describe('findDuplicates', () => {
  it('finds name+city+website duplicates', () => {
    const entities: DedupeCandidate[] = [
      { id: '1', name: 'The Eagle', city: 'London', website: 'https://www.eaglelondon.com', entityType: 'venue' },
      { id: '2', name: 'The Eagle', city: 'London', website: 'https://eaglelondon.com', entityType: 'venue' },
    ];

    const matches = findDuplicates(entities);
    expect(matches.length).toBe(1);
    expect(matches[0].method).toBe('name_city_website');
    expect(matches[0].confidence).toBeGreaterThan(0.8);
  });

  it('finds name+address duplicates', () => {
    const entities: DedupeCandidate[] = [
      { id: '1', name: 'The Eagle', city: 'London', address: '349 Kennington Lane SE11', entityType: 'venue' },
      { id: '2', name: 'The Eagle', city: 'London', address: '349 Kennington Lane', entityType: 'venue' },
    ];

    const matches = findDuplicates(entities);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('does not match different entity types', () => {
    const entities: DedupeCandidate[] = [
      { id: '1', name: 'The Eagle', city: 'London', entityType: 'venue' },
      { id: '2', name: 'The Eagle', city: 'London', entityType: 'event' },
    ];

    const matches = findDuplicates(entities);
    expect(matches.length).toBe(0);
  });

  it('finds fuzzy name matches in same city', () => {
    const entities: DedupeCandidate[] = [
      { id: '1', name: 'Comptons of Soho', city: 'London', entityType: 'venue' },
      { id: '2', name: "Compton's of Soho", city: 'London', entityType: 'venue' },
    ];

    const matches = findDuplicates(entities);
    expect(matches.length).toBe(1);
  });

  it('does not match clearly different venues', () => {
    const entities: DedupeCandidate[] = [
      { id: '1', name: 'The Eagle', city: 'London', entityType: 'venue' },
      { id: '2', name: 'Pink Flamingo', city: 'London', entityType: 'venue' },
    ];

    const matches = findDuplicates(entities);
    expect(matches.length).toBe(0);
  });
});

describe('findBestMatch', () => {
  it('returns the best match from a list', () => {
    const candidate: DedupeCandidate = {
      id: 'new',
      name: 'The Eagle',
      city: 'London',
      website: 'https://eaglelondon.com',
      entityType: 'venue',
    };

    const existing: DedupeCandidate[] = [
      { id: '1', name: 'Pink Flamingo', city: 'London', entityType: 'venue' },
      { id: '2', name: 'The Eagle', city: 'London', website: 'https://www.eaglelondon.com', entityType: 'venue' },
    ];

    const match = findBestMatch(candidate, existing);
    expect(match).not.toBeNull();
    expect(match!.confidence).toBeGreaterThan(0.5);
  });

  it('returns null when no match found', () => {
    const candidate: DedupeCandidate = {
      id: 'new',
      name: 'Totally Unique Venue',
      city: 'London',
      entityType: 'venue',
    };

    const existing: DedupeCandidate[] = [
      { id: '1', name: 'Pink Flamingo', city: 'Berlin', entityType: 'venue' },
    ];

    const match = findBestMatch(candidate, existing);
    expect(match).toBeNull();
  });
});

describe('new dedupe rules', () => {
  it('matches via geo_name when coords are within 150m and name is similar', () => {
    const a: DedupeCandidate = {
      id: '1', name: "Tom's Bar", city: 'Berlin',
      lat: 52.49725, lng: 13.34182, entityType: 'venue',
    };
    // Same venue, ~40m off, punctuation stripped (classic source drift).
    const b: DedupeCandidate = {
      id: '2', name: 'Toms Bar', city: 'Berlin',
      lat: 52.49760, lng: 13.34182, entityType: 'venue',
    };
    const match = findBestMatch(a, [b]);
    expect(match).not.toBeNull();
    expect(['geo_name', 'fuzzy', 'name_city_website']).toContain(match!.method);
    expect(match!.confidence).toBeGreaterThan(0.7);
  });

  it('matches via domain_city even when names differ', () => {
    const a: DedupeCandidate = {
      id: '1', name: 'Cafe Roma',
      city: 'Berlin', website: 'https://caferoma.de', entityType: 'venue',
    };
    const b: DedupeCandidate = {
      id: '2', name: 'Cafe Roma Berlin Mitte',
      city: 'Berlin', website: 'https://www.caferoma.de/location', entityType: 'venue',
    };
    const match = findBestMatch(a, [b]);
    expect(match).not.toBeNull();
    // Strongest applicable rule should fire (name_city_website or domain_city).
    expect(['name_city_website', 'domain_city']).toContain(match!.method);
    expect(match!.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('does not use geo_name when cities disagree AND distance is far', () => {
    const a: DedupeCandidate = {
      id: '1', name: 'The Eagle', city: 'London',
      lat: 51.4866, lng: -0.1105, entityType: 'venue',
    };
    // Different city, far away, same name.
    const b: DedupeCandidate = {
      id: '2', name: 'The Eagle', city: 'New York',
      lat: 40.7128, lng: -74.006, entityType: 'venue',
    };
    const match = findBestMatch(a, [b]);
    expect(match).toBeNull();
  });
});
