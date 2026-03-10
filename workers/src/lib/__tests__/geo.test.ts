import { describe, it, expect } from 'vitest';
import { haversineKm, resolveCountryName, cleanContentText, batchNearest, pointInPolygon } from '../geo';

describe('haversineKm', () => {
  it('computes Paris to London distance (~344 km)', () => {
    const d = haversineKm(48.8566, 2.3522, 51.5074, -0.1278);
    expect(d).toBeCloseTo(344, -1); // within ~10 km
  });

  it('returns 0 for same point', () => {
    const d = haversineKm(40.0, -74.0, 40.0, -74.0);
    expect(d).toBeCloseTo(0, 3);
  });

  it('computes New York to Tokyo distance (~10,800 km)', () => {
    const d = haversineKm(40.7128, -74.006, 35.6762, 139.6503);
    expect(d).toBeCloseTo(10850, -2); // within ~100 km
  });
});

describe('resolveCountryName', () => {
  it('resolves 2-letter codes', () => {
    expect(resolveCountryName('us')).toBe('United States');
    expect(resolveCountryName('gb')).toBe('United Kingdom');
    expect(resolveCountryName('de')).toBe('Germany');
  });

  it('resolves demonyms', () => {
    expect(resolveCountryName('american')).toBe('United States');
    expect(resolveCountryName('british')).toBe('United Kingdom');
  });

  it('resolves common aliases', () => {
    expect(resolveCountryName('holland')).toBe('Netherlands');
    expect(resolveCountryName('czechia')).toBe('Czech Republic');
  });

  it('trims whitespace', () => {
    expect(resolveCountryName('  us  ')).toBe('United States');
  });

  it('is case-insensitive', () => {
    expect(resolveCountryName('US')).toBe('United States');
    expect(resolveCountryName('American')).toBe('United States');
  });

  it('returns original name for unknown countries', () => {
    expect(resolveCountryName('Narnia')).toBe('Narnia');
  });
});

describe('cleanContentText', () => {
  it('returns empty string for empty input', () => {
    expect(cleanContentText('')).toBe('');
  });

  it('decodes basic HTML entities', () => {
    expect(cleanContentText('&amp; &lt; &gt; &quot;')).toBe('& < > "');
  });

  it('decodes smart quotes', () => {
    const result = cleanContentText('&#8220;hello&#8221;');
    expect(result).toBe('\u201Chello\u201D');
  });

  it('decodes numeric entities', () => {
    expect(cleanContentText('&#65;&#66;&#67;')).toBe('ABC');
  });

  it('replaces nbsp with space', () => {
    expect(cleanContentText('hello&nbsp;world')).toBe('hello world');
  });

  it('collapses excessive newlines', () => {
    expect(cleanContentText('a\n\n\n\nb')).toBe('a\n\nb');
  });

  it('trims lines', () => {
    expect(cleanContentText('  hello  \n  world  ')).toBe('hello\nworld');
  });
});

describe('batchNearest', () => {
  it('returns nearest points sorted by distance', () => {
    const points = [
      { lat: 51.5074, lon: -0.1278 }, // London
      { lat: 40.7128, lon: -74.006 }, // New York
      { lat: 35.6762, lon: 139.6503 }, // Tokyo
    ];
    const result = batchNearest(48.8566, 2.3522, points, 2); // From Paris
    expect(result).toHaveLength(2);
    expect(result[0][0]).toBe(0); // London is closest
  });

  it('limits results to requested count', () => {
    const points = [
      { lat: 51.5074, lon: -0.1278 },
      { lat: 40.7128, lon: -74.006 },
      { lat: 35.6762, lon: 139.6503 },
    ];
    const result = batchNearest(48.8566, 2.3522, points, 1);
    expect(result).toHaveLength(1);
  });
});

describe('pointInPolygon', () => {
  const square = [
    { lat: -1, lon: -1 },
    { lat: -1, lon: 1 },
    { lat: 1, lon: 1 },
    { lat: 1, lon: -1 },
  ];

  it('returns true for point inside polygon', () => {
    expect(pointInPolygon(0, 0, square)).toBe(true);
  });

  it('returns false for point outside polygon', () => {
    expect(pointInPolygon(2, 2, square)).toBe(false);
  });

  it('returns false for degenerate polygon', () => {
    expect(pointInPolygon(0, 0, [{ lat: 0, lon: 0 }])).toBe(false);
  });
});
