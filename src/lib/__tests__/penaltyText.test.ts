import { describe, it, expect } from 'vitest';
import { maxPrisonSuffix } from '../penaltyText';
import { censusCount, censusParts } from '../censusParts';

describe('maxPrisonSuffix', () => {
  // The value pairs below are the ones stored on prod (countries.lgbti_criminalization).
  it('drops a bare category label: "(Years)", "(Unknown)", "(Varies)", "(No)"', () => {
    for (const m of ['Years', 'Unknown', 'Varies', 'No']) {
      expect(maxPrisonSuffix('Up to 8 years imprisonment', m)).toBe('');
    }
  });

  it('drops a label the penalty already says', () => {
    expect(maxPrisonSuffix('10 years to life in prison', 'Life in prison')).toBe('');
  });

  it('keeps a label that adds something', () => {
    expect(maxPrisonSuffix('Death Penalty (possible)', 'Life in prison')).toBe(' (Life in prison)');
  });

  it('handles missing values', () => {
    expect(maxPrisonSuffix(null, null)).toBe('');
    expect(maxPrisonSuffix('', undefined)).toBe('');
  });
});

describe('censusParts', () => {
  it('drops zero counts (Ghana: venues and events gated for signed-out readers)', () => {
    expect(
      censusParts([
        [4, '4 cities'],
        [0, '0 stops'],
        [0, '0 departures'],
      ]),
    ).toEqual(['4 cities']);
  });

  it('keeps the first part when everything is zero, so the row is not empty', () => {
    expect(
      censusParts([
        [0, '0 cities'],
        [0, '0 stops'],
      ]),
    ).toEqual(['0 cities']);
  });

  it('keeps every non-zero count in order', () => {
    expect(
      censusParts([
        [12, '12 cities'],
        [300, '300 stops'],
        [40, '40 departures'],
      ]),
    ).toEqual(['12 cities', '300 stops', '40 departures']);
  });
});

describe('censusCount', () => {
  it('marks a full teaser list as a floor (Germany: "12 cities" was 12 of hundreds)', () => {
    expect(censusCount(12, 12)).toBe('12+');
    expect(censusCount(4, 12)).toBe(4);
  });
});

describe('venueCategoryFallbackLabel', () => {
  it('names known values and spells out unknown ones', async () => {
    const { venueCategoryFallbackLabel } = await import('../venueCategories');
    expect(venueCategoryFallbackLabel('community_center')).toBe('Community');
    expect(venueCategoryFallbackLabel('some_new-kind')).toBe('Some new kind');
    expect(venueCategoryFallbackLabel(null)).toBeNull();
  });
});
