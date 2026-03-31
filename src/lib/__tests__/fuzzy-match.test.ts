import { describe, it, expect } from 'vitest';
import {
  normalizeText,
  normalizeTitle,
  extractYear,
  extractEdition,
  levenshteinDistance,
  levenshteinSimilarity,
  jaroSimilarity,
  jaroWinklerSimilarity,
  tokenJaccardSimilarity,
  containmentScore,
  computeSimilarity,
  computeTitleSimilarity,
} from '../fuzzy-match';

// ── normalizeText ───────────────────────────────────────────────────────────

describe('normalizeText', () => {
  it('lowercases and trims', () => {
    expect(normalizeText('  Hello World  ')).toBe('hello world');
  });

  it('replaces diacritics', () => {
    expect(normalizeText('Zürich')).toBe('zuerich');
    expect(normalizeText('München')).toBe('muenchen');
    expect(normalizeText('Café')).toBe('cafe');
    expect(normalizeText('Straße')).toBe('strasse');
  });

  it('removes punctuation', () => {
    expect(normalizeText("It's a test!")).toBe('its a test');
    expect(normalizeText('foo@bar.com')).toBe('foobarcom');
  });

  it('collapses whitespace and hyphens', () => {
    expect(normalizeText('New   York-City')).toBe('new york city');
  });

  it('handles Czech/Polish characters', () => {
    expect(normalizeText('Černý')).toBe('cerny');
    expect(normalizeText('Łódź')).toBe('lodz');
  });
});

// ── normalizeTitle ──────────────────────────────────────────────────────────

describe('normalizeTitle', () => {
  it('strips noise words', () => {
    expect(normalizeTitle('The Pride March')).toBe('pride march');
    expect(normalizeTitle('Die Parade der Liebe')).toBe('parade liebe');
  });

  it('preserves meaningful words', () => {
    expect(normalizeTitle('Berlin Pride 2026')).toBe('berlin pride 2026');
  });
});

// ── extractYear / extractEdition ────────────────────────────────────────────

describe('extractYear', () => {
  it('extracts 4-digit year', () => {
    expect(extractYear('Pride 2026')).toBe(2026);
    expect(extractYear('CSD Berlin 2025')).toBe(2025);
  });

  it('returns last year if multiple', () => {
    expect(extractYear('2025 to 2026')).toBe(2026);
  });

  it('returns null if no year', () => {
    expect(extractYear('Pride March')).toBeNull();
  });
});

describe('extractEdition', () => {
  it('extracts edition number', () => {
    expect(extractEdition('5th Annual Pride')).toBe(5);
    expect(extractEdition('1st Edition')).toBe(1);
    expect(extractEdition('23rd Annual Parade')).toBe(23);
  });

  it('returns null if no edition', () => {
    expect(extractEdition('Pride March 2026')).toBeNull();
  });
});

// ── levenshteinDistance ─────────────────────────────────────────────────────

describe('levenshteinDistance', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshteinDistance('hello', 'hello')).toBe(0);
  });

  it('returns length for empty vs non-empty', () => {
    expect(levenshteinDistance('', 'abc')).toBe(3);
    expect(levenshteinDistance('abc', '')).toBe(3);
  });

  it('computes correct distance for known pairs', () => {
    expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
    expect(levenshteinDistance('saturday', 'sunday')).toBe(3);
  });

  it('is symmetric', () => {
    expect(levenshteinDistance('abc', 'xyz')).toBe(levenshteinDistance('xyz', 'abc'));
  });
});

// ── levenshteinSimilarity ───────────────────────────────────────────────────

describe('levenshteinSimilarity', () => {
  it('returns 1.0 for identical strings', () => {
    expect(levenshteinSimilarity('hello', 'hello')).toBe(1.0);
  });

  it('returns 1.0 for two empty strings', () => {
    expect(levenshteinSimilarity('', '')).toBe(1.0);
  });

  it('returns 0 for completely different strings of same length', () => {
    expect(levenshteinSimilarity('abc', 'xyz')).toBeCloseTo(0.0, 1);
  });

  it('returns high similarity for small edits', () => {
    expect(levenshteinSimilarity('Berghain', 'Berghein')).toBeGreaterThan(0.8);
  });
});

// ── jaroSimilarity ──────────────────────────────────────────────────────────

describe('jaroSimilarity', () => {
  it('returns 1.0 for identical strings', () => {
    expect(jaroSimilarity('hello', 'hello')).toBe(1.0);
  });

  it('returns 0.0 for completely different', () => {
    expect(jaroSimilarity('abc', 'xyz')).toBe(0.0);
  });

  it('handles empty strings', () => {
    expect(jaroSimilarity('', '')).toBe(1.0);
    expect(jaroSimilarity('a', '')).toBe(0.0);
  });

  it('scores high for transpositions', () => {
    // MARTHA vs MARHTA — classic Jaro example
    const score = jaroSimilarity('martha', 'marhta');
    expect(score).toBeGreaterThan(0.9);
  });
});

// ── jaroWinklerSimilarity ───────────────────────────────────────────────────

describe('jaroWinklerSimilarity', () => {
  it('boosts score for common prefix', () => {
    const jaro = jaroSimilarity('pride march', 'pride parade');
    const jw = jaroWinklerSimilarity('pride march', 'pride parade');
    expect(jw).toBeGreaterThan(jaro);
  });

  it('equals Jaro when no common prefix', () => {
    const a = 'abc';
    const b = 'xyz';
    expect(jaroWinklerSimilarity(a, b)).toBe(jaroSimilarity(a, b));
  });
});

// ── tokenJaccardSimilarity ──────────────────────────────────────────────────

describe('tokenJaccardSimilarity', () => {
  it('returns 1.0 for identical token sets', () => {
    expect(tokenJaccardSimilarity('a b c', 'a b c')).toBe(1.0);
  });

  it('handles reordered tokens', () => {
    expect(tokenJaccardSimilarity('pride berlin march', 'march pride berlin')).toBe(1.0);
  });

  it('handles partial overlap', () => {
    // {pride, march} vs {pride, parade} = 1 / 3 ≈ 0.333
    expect(tokenJaccardSimilarity('pride march', 'pride parade')).toBeCloseTo(1 / 3, 2);
  });

  it('returns 0 for no overlap', () => {
    expect(tokenJaccardSimilarity('a b', 'x y')).toBe(0);
  });
});

// ── containmentScore ────────────────────────────────────────────────────────

describe('containmentScore', () => {
  it('returns 1.0 for substring containment', () => {
    expect(containmentScore('pride', 'berlin pride festival')).toBe(1.0);
  });

  it('returns token containment for partial overlap', () => {
    // "pride march" tokens: [pride, march], "berlin pride festival" tokens: [berlin, pride, festival]
    // pride is contained, march is not -> 1/2 = 0.5
    expect(containmentScore('pride march', 'berlin pride festival')).toBeCloseTo(0.5, 2);
  });

  it('auto-swaps shorter/longer', () => {
    expect(containmentScore('a very long string', 'short')).toBe(
      containmentScore('short', 'a very long string'),
    );
  });
});

// ── computeSimilarity ───────────────────────────────────────────────────────

describe('computeSimilarity', () => {
  it('returns 1.0 for normalized-identical strings', () => {
    const result = computeSimilarity('Pride March', 'pride march');
    expect(result.score).toBe(1.0);
    expect(result.exactNormalized).toBe(true);
  });

  it('returns high score for typos', () => {
    const result = computeSimilarity('Berghain', 'Berghein');
    expect(result.score).toBeGreaterThan(0.5);
  });

  it('returns high score for diacritic variants', () => {
    const result = computeSimilarity('Café Münchner', 'Cafe Muenchner');
    expect(result.score).toBeGreaterThan(0.85);
  });

  it('returns moderate score for reordered words', () => {
    const result = computeSimilarity('Berlin Pride March', 'March Pride Berlin');
    expect(result.score).toBeGreaterThan(0.6);
  });

  it('returns low score for completely different strings', () => {
    const result = computeSimilarity('Hello World', 'Foo Bar Baz');
    expect(result.score).toBeLessThan(0.3);
  });
});

// ── computeTitleSimilarity ──────────────────────────────────────────────────

describe('computeTitleSimilarity', () => {
  it('strips noise words for comparison', () => {
    const result = computeTitleSimilarity('The Pride March', 'Pride March');
    expect(result.score).toBe(1.0);
  });

  it('detects matching year', () => {
    const result = computeTitleSimilarity('Pride 2026', 'Pride 2026');
    expect(result.yearMatch).toBe(true);
  });

  it('penalizes year mismatch', () => {
    const sameYear = computeTitleSimilarity('Berlin Pride 2026', 'Berlin Pride 2026');
    const diffYear = computeTitleSimilarity('Berlin Pride 2025', 'Berlin Pride 2026');
    expect(diffYear.yearMatch).toBe(false);
    expect(diffYear.score).toBeLessThan(sameYear.score);
  });

  it('penalizes edition mismatch', () => {
    const same = computeTitleSimilarity('5th Annual Pride', '5th Annual Pride');
    const diff = computeTitleSimilarity('5th Annual Pride', '6th Annual Pride');
    expect(diff.editionMatch).toBe(false);
    expect(diff.score).toBeLessThan(same.score);
  });

  it('handles real-world fuzzy event titles', () => {
    // Typo in city name
    const r1 = computeTitleSimilarity('CSD Berlin', 'CSD Berling');
    expect(r1.score).toBeGreaterThan(0.8);

    // Abbreviation vs full
    const r2 = computeTitleSimilarity('Christopher Street Day Berlin', 'CSD Berlin');
    expect(r2.score).toBeGreaterThan(0.3); // partial overlap

    // Same event, different formatting
    const r3 = computeTitleSimilarity('Pride March - Berlin 2026', 'Berlin Pride March 2026');
    expect(r3.score).toBeGreaterThan(0.7);
  });
});

// ── Real-world dedup scenarios ──────────────────────────────────────────────

describe('real-world dedup scenarios', () => {
  it('catches Berghain/Berghein typo', () => {
    const result = computeSimilarity('Berghain', 'Berghein');
    expect(result.score).toBeGreaterThan(0.5);
  });

  it('catches SchwuZ/Schwuz case difference', () => {
    const result = computeSimilarity('SchwuZ', 'Schwuz');
    expect(result.score).toBe(1.0); // normalized identical
  });

  it('distinguishes different events at same venue', () => {
    const r1 = computeTitleSimilarity('Techno Tuesday', 'Fetish Friday');
    expect(r1.score).toBeLessThan(0.4);
  });

  it('catches same event with/without city suffix', () => {
    const result = computeTitleSimilarity('Pride March', 'Pride March Berlin');
    expect(result.score).toBeGreaterThan(0.6);
  });

  it('distinguishes different year editions', () => {
    const result = computeTitleSimilarity('Folsom Europe 2025', 'Folsom Europe 2026');
    expect(result.yearMatch).toBe(false);
    expect(result.score).toBeLessThan(0.8);
  });
});
