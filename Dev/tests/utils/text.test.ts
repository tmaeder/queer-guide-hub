import { describe, it, expect } from 'vitest'
import {
  slugify,
  normalizeText,
  extractDomain,
  stripHtml,
  dedupeStrings,
  safeUrl,
  canonicalCountry,
} from '../../src/utils/text.js'

describe('slugify', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(slugify('The Eagle Bar')).toBe('the-eagle-bar')
  })

  it('strips diacritics', () => {
    expect(slugify('Café Über')).toBe('cafe-uber')
  })

  it('removes special characters', () => {
    expect(slugify("Charlie's Bar & Grill!")).toBe('charlies-bar-grill')
  })

  it('collapses multiple hyphens', () => {
    expect(slugify('foo---bar')).toBe('foo-bar')
  })

  it('trims leading/trailing hyphens', () => {
    expect(slugify('-foo-')).toBe('foo')
  })
})

describe('normalizeText', () => {
  it('lowercases and replaces punctuation with space', () => {
    // apostrophe is a non-word char → replaced with space, then collapsed
    expect(normalizeText("Foo's Bar!")).toBe('foo s bar')
  })

  it('strips diacritics', () => {
    expect(normalizeText('Café')).toBe('cafe')
  })

  it('collapses whitespace', () => {
    expect(normalizeText('  foo   bar  ')).toBe('foo bar')
  })
})

describe('extractDomain', () => {
  it('extracts domain without www', () => {
    expect(extractDomain('https://www.example.com/path')).toBe('example.com')
  })

  it('handles domains without www', () => {
    expect(extractDomain('https://travelgay.com/venues')).toBe('travelgay.com')
  })

  it('returns empty string for invalid URLs', () => {
    expect(extractDomain('not-a-url')).toBe('')
  })
})

describe('stripHtml', () => {
  it('removes HTML tags', () => {
    expect(stripHtml('<p>Hello <strong>world</strong></p>')).toBe('Hello world')
  })

  it('collapses whitespace', () => {
    expect(stripHtml('<div>  foo  </div>')).toBe('foo')
  })
})

describe('dedupeStrings', () => {
  it('removes duplicates case-insensitively', () => {
    expect(dedupeStrings(['foo', 'Foo', 'bar'])).toEqual(['foo', 'bar'])
  })

  it('preserves order', () => {
    expect(dedupeStrings(['b', 'a', 'c'])).toEqual(['b', 'a', 'c'])
  })
})

describe('safeUrl', () => {
  it('returns a valid URL string', () => {
    expect(safeUrl('https://example.com')).toBe('https://example.com/')
  })

  it('prepends https if missing', () => {
    expect(safeUrl('example.com')).toBe('https://example.com/')
  })

  it('returns null for empty string', () => {
    expect(safeUrl('')).toBeNull()
  })

  it('returns null for null', () => {
    expect(safeUrl(null)).toBeNull()
  })
})

describe('canonicalCountry', () => {
  it('maps UK to United Kingdom', () => {
    expect(canonicalCountry('UK')).toBe('United Kingdom')
  })

  it('maps USA to United States', () => {
    expect(canonicalCountry('usa')).toBe('United States')
  })

  it('title-cases unknown countries', () => {
    expect(canonicalCountry('germany')).toBe('Germany')
  })
})
