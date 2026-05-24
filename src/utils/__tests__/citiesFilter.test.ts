import { describe, it, expect } from 'vitest';
import {
  filterAndSortCities,
  tierFor,
  parseSetParam,
  isCitiesSortKey,
  isEqualityTier,
  type CityForFilter,
} from '@/utils/citiesFilter';

const city = (overrides: Partial<CityForFilter> & { id: string; name: string }): CityForFilter => ({
  population: 1_000_000,
  countries: { name: 'Germany', equality_score: 70, continents: { code: 'EU' } },
  ...overrides,
});

const FIXTURES: CityForFilter[] = [
  city({ id: 'berlin', name: 'Berlin', population: 3_700_000, countries: { name: 'Germany', equality_score: 75, continents: { code: 'EU' } } }),
  city({ id: 'madrid', name: 'Madrid', population: 3_300_000, countries: { name: 'Spain', equality_score: 89, continents: { code: 'EU' } } }),
  city({ id: 'bangkok', name: 'Bangkok', population: 10_500_000, countries: { name: 'Thailand', equality_score: 34, continents: { code: 'AS' } } }),
  city({ id: 'mexico', name: 'Mexico City', population: 9_200_000, countries: { name: 'Mexico', equality_score: 62, continents: { code: 'NA' } } }),
  city({ id: 'cairo', name: 'Cairo', population: 9_500_000, countries: { name: 'Egypt', equality_score: 5, continents: { code: 'AF' } } }),
  city({ id: 'orphan', name: 'Orphan', population: null, countries: null }),
];

const noCounts: ReadonlyMap<string, number> = new Map();

describe('tierFor', () => {
  it('maps scores to existing equalityScore.ts cutoffs', () => {
    expect(tierFor(95)).toBe('very-high');
    expect(tierFor(80)).toBe('very-high');
    expect(tierFor(79)).toBe('high');
    expect(tierFor(60)).toBe('high');
    expect(tierFor(59)).toBe('moderate');
    expect(tierFor(40)).toBe('moderate');
    expect(tierFor(39)).toBe('low');
    expect(tierFor(20)).toBe('low');
    expect(tierFor(19)).toBe('very-low');
    expect(tierFor(0)).toBe('very-low');
  });

  it('returns "unknown" for null / undefined', () => {
    expect(tierFor(null)).toBe('unknown');
    expect(tierFor(undefined)).toBe('unknown');
  });
});

describe('filterAndSortCities', () => {
  it('returns everything sorted by population when no filters set', () => {
    const out = filterAndSortCities(FIXTURES, noCounts, {
      q: '',
      continents: new Set(),
      tiers: new Set(),
      sort: 'population',
    });
    expect(out.map((c) => c.id)).toEqual(['bangkok', 'cairo', 'mexico', 'berlin', 'madrid', 'orphan']);
  });

  it('text search matches name / name_en / name_de / region / country', () => {
    const withAliases = [
      ...FIXTURES,
      city({ id: 'koln', name: 'Köln', name_en: 'Cologne', countries: { name: 'Germany', equality_score: 75, continents: { code: 'EU' } } }),
    ];
    const byEnglishAlias = filterAndSortCities(withAliases, noCounts, {
      q: 'cologne',
      continents: new Set(),
      tiers: new Set(),
      sort: 'name',
    });
    expect(byEnglishAlias.map((c) => c.id)).toEqual(['koln']);

    const byCountry = filterAndSortCities(FIXTURES, noCounts, {
      q: 'spain',
      continents: new Set(),
      tiers: new Set(),
      sort: 'name',
    });
    expect(byCountry.map((c) => c.id)).toEqual(['madrid']);
  });

  it('continent filter narrows to selected codes (case-insensitive)', () => {
    const out = filterAndSortCities(FIXTURES, noCounts, {
      q: '',
      continents: new Set(['eu']),
      tiers: new Set(),
      sort: 'name',
    });
    expect(out.map((c) => c.id)).toEqual(['berlin', 'madrid']);
  });

  it('multiple continents OR together', () => {
    const out = filterAndSortCities(FIXTURES, noCounts, {
      q: '',
      continents: new Set(['eu', 'as']),
      tiers: new Set(),
      sort: 'name',
    });
    expect(out.map((c) => c.id).sort()).toEqual(['bangkok', 'berlin', 'madrid']);
  });

  it('equality tier filter uses existing cutoffs', () => {
    const veryHigh = filterAndSortCities(FIXTURES, noCounts, {
      q: '',
      continents: new Set(),
      tiers: new Set(['very-high']),
      sort: 'name',
    });
    expect(veryHigh.map((c) => c.id)).toEqual(['madrid']);

    const veryLow = filterAndSortCities(FIXTURES, noCounts, {
      q: '',
      continents: new Set(),
      tiers: new Set(['very-low']),
      sort: 'name',
    });
    expect(veryLow.map((c) => c.id)).toEqual(['cairo']);
  });

  it('"unknown" tier filter captures cities without equality data', () => {
    const out = filterAndSortCities(FIXTURES, noCounts, {
      q: '',
      continents: new Set(),
      tiers: new Set(['unknown']),
      sort: 'name',
    });
    expect(out.map((c) => c.id)).toEqual(['orphan']);
  });

  it('sort by name uses locale-aware alphabetical', () => {
    const out = filterAndSortCities(FIXTURES, noCounts, {
      q: '',
      continents: new Set(),
      tiers: new Set(),
      sort: 'name',
    });
    expect(out.map((c) => c.id)).toEqual(['bangkok', 'berlin', 'cairo', 'madrid', 'mexico', 'orphan']);
  });

  it('sort by equality places unknowns last', () => {
    const out = filterAndSortCities(FIXTURES, noCounts, {
      q: '',
      continents: new Set(),
      tiers: new Set(),
      sort: 'equality',
    });
    expect(out.map((c) => c.id)).toEqual(['madrid', 'berlin', 'mexico', 'bangkok', 'cairo', 'orphan']);
  });

  it('sort by venues uses provided counts', () => {
    const counts = new Map([
      ['berlin', 142],
      ['madrid', 98],
      ['bangkok', 31],
      ['mexico', 58],
    ]);
    const out = filterAndSortCities(FIXTURES, counts, {
      q: '',
      continents: new Set(),
      tiers: new Set(),
      sort: 'venues',
    });
    expect(out.slice(0, 4).map((c) => c.id)).toEqual(['berlin', 'madrid', 'mexico', 'bangkok']);
  });

  it('combines text + continent + tier together', () => {
    const out = filterAndSortCities(FIXTURES, noCounts, {
      q: 'in',
      continents: new Set(['eu']),
      tiers: new Set(['very-high']),
      sort: 'name',
    });
    expect(out.map((c) => c.id)).toEqual(['madrid']);
  });

  it('does not mutate the input array', () => {
    const before = FIXTURES.map((c) => c.id);
    filterAndSortCities(FIXTURES, noCounts, {
      q: '',
      continents: new Set(),
      tiers: new Set(),
      sort: 'name',
    });
    expect(FIXTURES.map((c) => c.id)).toEqual(before);
  });
});

describe('parseSetParam', () => {
  it('returns empty set for null / undefined / empty', () => {
    expect(parseSetParam(null).size).toBe(0);
    expect(parseSetParam(undefined).size).toBe(0);
    expect(parseSetParam('').size).toBe(0);
  });

  it('splits, lowercases, and trims', () => {
    const out = parseSetParam(' EU ,as,  na ');
    expect(Array.from(out).sort()).toEqual(['as', 'eu', 'na']);
  });

  it('drops empty segments', () => {
    expect(Array.from(parseSetParam(',eu,,as,'))).toEqual(['eu', 'as']);
  });
});

describe('type guards', () => {
  it('isCitiesSortKey accepts known keys only', () => {
    expect(isCitiesSortKey('population')).toBe(true);
    expect(isCitiesSortKey('name')).toBe(true);
    expect(isCitiesSortKey('equality')).toBe(true);
    expect(isCitiesSortKey('venues')).toBe(true);
    expect(isCitiesSortKey('garbage')).toBe(false);
    expect(isCitiesSortKey(null)).toBe(false);
  });

  it('isEqualityTier accepts known tiers only', () => {
    expect(isEqualityTier('very-high')).toBe(true);
    expect(isEqualityTier('unknown')).toBe(true);
    expect(isEqualityTier('nope')).toBe(false);
  });
});
