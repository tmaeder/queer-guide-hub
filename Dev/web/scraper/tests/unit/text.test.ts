import { describe, it, expect } from 'vitest';
import {
  stripHtml,
  slugify,
  normalizeName,
  extractDomain,
  normalizeCity,
  cleanText,
  truncate,
  jaccardSimilarity,
  levenshtein,
  levenshteinSimilarity,
} from '../../src/utils/text.js';

describe('stripHtml', () => {
  it('removes HTML tags', () => {
    expect(stripHtml('<p>Hello <b>World</b></p>')).toBe('Hello World');
  });

  it('decodes HTML entities', () => {
    expect(stripHtml('Tom &amp; Jerry')).toBe('Tom & Jerry');
    expect(stripHtml('&lt;script&gt;')).toBe('<script>');
  });

  it('collapses whitespace', () => {
    expect(stripHtml('Hello   \n   World')).toBe('Hello World');
  });
});

describe('slugify', () => {
  it('creates URL-safe slugs', () => {
    expect(slugify('Hello World!')).toBe('hello-world');
    expect(slugify('Café & Bar')).toBe('cafe-bar');
  });

  it('handles accented characters', () => {
    expect(slugify('Zürich')).toBe('zurich');
    expect(slugify('São Paulo')).toBe('sao-paulo');
  });

  it('handles empty string', () => {
    expect(slugify('')).toBe('');
  });
});

describe('normalizeName', () => {
  it('lowercases and strips accents', () => {
    expect(normalizeName('Café Méridien')).toBe('cafe meridien');
  });

  it('removes non-alphanumeric characters', () => {
    expect(normalizeName("Tom's Bar & Grill")).toBe('toms bar grill');
  });
});

describe('extractDomain', () => {
  it('extracts domain from URL', () => {
    expect(extractDomain('https://www.example.com/path')).toBe('example.com');
    expect(extractDomain('http://example.org')).toBe('example.org');
  });

  it('strips www prefix', () => {
    expect(extractDomain('https://www.test.com')).toBe('test.com');
  });

  it('returns empty string for invalid URL', () => {
    expect(extractDomain('not a url')).toBe('');
  });
});

describe('normalizeCity', () => {
  it('normalizes city names for comparison', () => {
    expect(normalizeCity('New York')).toBe('new york');
    expect(normalizeCity('São Paulo')).toBe('sao paulo');
    expect(normalizeCity('Köln')).toBe('koln');
  });
});

describe('cleanText', () => {
  it('trims and collapses whitespace', () => {
    expect(cleanText('  Hello   World  ')).toBe('Hello World');
  });

  it('returns null for empty/null input', () => {
    expect(cleanText(null)).toBeNull();
    expect(cleanText('')).toBeNull();
    expect(cleanText('   ')).toBeNull();
  });
});

describe('truncate', () => {
  it('truncates long strings with ellipsis', () => {
    expect(truncate('Hello World', 8)).toBe('Hello W…');
  });

  it('leaves short strings unchanged', () => {
    expect(truncate('Hi', 10)).toBe('Hi');
  });
});

describe('jaccardSimilarity', () => {
  it('returns 1 for identical strings', () => {
    expect(jaccardSimilarity('hello world', 'hello world')).toBe(1);
  });

  it('returns 0 for completely different strings', () => {
    expect(jaccardSimilarity('abc def', 'xyz uvw')).toBe(0);
  });

  it('returns correct value for partial overlap', () => {
    const sim = jaccardSimilarity('hello world', 'hello there');
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThan(1);
  });
});

describe('levenshtein', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshtein('hello', 'hello')).toBe(0);
  });

  it('returns correct edit distance', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('', 'abc')).toBe(3);
  });
});

describe('levenshteinSimilarity', () => {
  it('returns 1 for identical names', () => {
    expect(levenshteinSimilarity('The Eagle', 'The Eagle')).toBe(1);
  });

  it('returns high similarity for close names', () => {
    expect(levenshteinSimilarity('The Eagle Bar', 'The Eagle')).toBeGreaterThan(0.6);
  });

  it('returns low similarity for different names', () => {
    expect(levenshteinSimilarity('The Eagle', 'Pink Flamingo')).toBeLessThan(0.3);
  });
});
