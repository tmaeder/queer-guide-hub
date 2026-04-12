import { describe, it, expect } from 'vitest';
import {
  validateSlug,
  generateSlug,
  validateVenue,
  validateEvent,
  validateNewsArticle,
  validateNewsSource,
  validateCMSContent,
  validateImportRow,
  validateImportBatch,
} from '../contentValidation';

describe('validateSlug', () => {
  it('should accept valid slug', () => {
    expect(validateSlug('my-venue')).toHaveLength(0);
  });

  it('should reject uppercase', () => {
    const errors = validateSlug('My-Venue');
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject spaces', () => {
    const errors = validateSlug('my venue');
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject leading/trailing hyphens', () => {
    expect(validateSlug('-bad')).toHaveLength(1);
    expect(validateSlug('bad-')).toHaveLength(1);
  });

  it('should reject double hyphens', () => {
    expect(validateSlug('a--b')).toHaveLength(1);
  });

  it('should reject slug over 128 chars', () => {
    const long = 'a'.repeat(129);
    const errors = validateSlug(long);
    expect(errors.some(e => e.message.includes('128'))).toBe(true);
  });

  it('should return empty for empty string', () => {
    expect(validateSlug('')).toHaveLength(0);
  });
});

describe('generateSlug', () => {
  it('should lowercase and hyphenate', () => {
    expect(generateSlug('My Great Venue')).toBe('my-great-venue');
  });

  it('should remove accents', () => {
    expect(generateSlug('Café Résumé')).toBe('cafe-resume');
  });

  it('should remove special characters', () => {
    expect(generateSlug('Hello! @World#')).toBe('hello-world');
  });

  it('should collapse multiple hyphens', () => {
    expect(generateSlug('a   b   c')).toBe('a-b-c');
  });

  it('should trim leading/trailing hyphens', () => {
    expect(generateSlug('  hello  ')).toBe('hello');
  });

  it('should truncate to maxLength', () => {
    expect(generateSlug('A very long title', 10).length).toBeLessThanOrEqual(10);
  });
});

describe('validateVenue', () => {
  it('should require name', () => {
    const result = validateVenue({});
    expect(result.isValid).toBe(false);
    expect(result.errors.some(e => e.field === 'name')).toBe(true);
  });

  it('should accept valid venue', () => {
    const result = validateVenue({ name: 'My Bar', city: 'Berlin', country: 'Germany' });
    expect(result.isValid).toBe(true);
  });

  it('should reject name shorter than 2 chars', () => {
    const result = validateVenue({ name: 'X' });
    expect(result.isValid).toBe(false);
  });

  it('should validate email format', () => {
    const result = validateVenue({ name: 'Bar', email: 'not-email' });
    expect(result.errors.some(e => e.field === 'email')).toBe(true);
  });

  it('should validate website URL', () => {
    const result = validateVenue({ name: 'Bar', website: 'not-a-url' });
    expect(result.errors.some(e => e.field === 'website')).toBe(true);
  });

  it('should validate latitude range', () => {
    const result = validateVenue({ name: 'Bar', latitude: 200 });
    expect(result.errors.some(e => e.field === 'latitude')).toBe(true);
  });

  it('should validate longitude range', () => {
    const result = validateVenue({ name: 'Bar', longitude: -200 });
    expect(result.errors.some(e => e.field === 'longitude')).toBe(true);
  });
});

describe('validateEvent', () => {
  it('should require title', () => {
    const result = validateEvent({});
    expect(result.isValid).toBe(false);
  });

  it('should accept valid event', () => {
    const result = validateEvent({ title: 'Pride Parade', description: 'Annual event' });
    expect(result.isValid).toBe(true);
  });

  it('should reject title shorter than 3 chars', () => {
    const result = validateEvent({ title: 'AB' });
    expect(result.isValid).toBe(false);
  });

  it('should reject end_date before start_date', () => {
    const result = validateEvent({
      title: 'Test Event',
      start_date: '2024-06-15',
      end_date: '2024-06-10',
    });
    expect(result.errors.some(e => e.field === 'end_date')).toBe(true);
  });
});

describe('validateNewsArticle', () => {
  it('should require title', () => {
    const result = validateNewsArticle({});
    expect(result.isValid).toBe(false);
  });

  it('should accept valid article', () => {
    const result = validateNewsArticle({ title: 'Breaking News Story' });
    expect(result.isValid).toBe(true);
  });

  it('should validate URL format', () => {
    const result = validateNewsArticle({ title: 'Valid Title', url: 'not-a-url' });
    expect(result.errors.some(e => e.field === 'url')).toBe(true);
  });
});

describe('validateNewsSource', () => {
  it('should require name, url, and category', () => {
    const result = validateNewsSource({});
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });

  it('should accept valid source', () => {
    const result = validateNewsSource({
      name: 'PinkNews',
      url: 'https://pinknews.co.uk',
      category: 'news',
    });
    expect(result.isValid).toBe(true);
  });

  it('should validate fetch_frequency range', () => {
    const result = validateNewsSource({
      name: 'Source',
      url: 'https://example.com',
      category: 'news',
      fetch_frequency: 10, // below min of 30
    });
    expect(result.errors.some(e => e.field === 'fetch_frequency')).toBe(true);
  });
});

describe('validateCMSContent', () => {
  it('should require title', () => {
    const result = validateCMSContent({});
    expect(result.isValid).toBe(false);
  });

  it('should accept string title', () => {
    const result = validateCMSContent({ title: 'My Page' });
    expect(result.isValid).toBe(true);
  });

  it('should require English title in JSONB', () => {
    const result = validateCMSContent({ title: { de: 'Hallo' } });
    expect(result.isValid).toBe(false);
  });

  it('should accept JSONB title with English', () => {
    const result = validateCMSContent({ title: { en: 'Hello', de: 'Hallo' } });
    expect(result.isValid).toBe(true);
  });

  it('should validate slug', () => {
    const result = validateCMSContent({ title: 'Test', slug: 'BAD SLUG' });
    expect(result.errors.some(e => e.field === 'slug')).toBe(true);
  });

  it('should validate meta_title length', () => {
    const result = validateCMSContent({ title: 'Test', meta_title: 'x'.repeat(100) });
    expect(result.errors.some(e => e.field === 'meta_title')).toBe(true);
  });
});

describe('validateImportRow', () => {
  it('should flag missing required fields', () => {
    const errors = validateImportRow({ name: '' }, 0, 'venues', ['name']);
    expect(errors.some(e => e.severity === 'error')).toBe(true);
  });

  it('should warn on invalid URL fields', () => {
    const errors = validateImportRow({ website: 'not-url' }, 0, 'venues');
    expect(errors.some(e => e.severity === 'warning' && e.field === 'website')).toBe(true);
  });

  it('should warn on invalid email fields', () => {
    const errors = validateImportRow({ email: 'bad' }, 0, 'venues');
    expect(errors.some(e => e.field === 'email')).toBe(true);
  });

  it('should error on invalid latitude', () => {
    const errors = validateImportRow({ latitude: '999' }, 0, 'venues');
    expect(errors.some(e => e.severity === 'error' && e.field === 'latitude')).toBe(true);
  });

  it('should error on invalid longitude', () => {
    const errors = validateImportRow({ longitude: '-999' }, 0, 'venues');
    expect(errors.some(e => e.field === 'longitude')).toBe(true);
  });

  it('should warn on excessively long values', () => {
    const errors = validateImportRow({ name: 'x'.repeat(11000) }, 0, 'venues');
    expect(errors.some(e => e.severity === 'warning')).toBe(true);
  });

  it('should skip empty values', () => {
    const errors = validateImportRow({ website: '', email: '' }, 0, 'venues');
    expect(errors).toHaveLength(0);
  });
});

describe('validateImportBatch', () => {
  it('should error on empty batch', () => {
    const result = validateImportBatch([], 'venues');
    expect(result.isValid).toBe(false);
    expect(result.errors[0].message).toContain('No data');
  });

  it('should validate all rows', () => {
    const rows = [
      { name: 'Bar A', latitude: '999' },
      { name: 'Bar B', latitude: '47' },
    ];
    const result = validateImportBatch(rows, 'venues');
    expect(result.errors.some(e => e.field === 'latitude')).toBe(true);
  });

  it('should warn on duplicate rows', () => {
    const rows = [
      { name: 'Duplicate', city: 'Berlin' },
      { name: 'Duplicate', city: 'Berlin' },
    ];
    const result = validateImportBatch(rows, 'venues');
    expect(result.warnings.some(e => e.field === 'duplicate')).toBe(true);
  });

  it('should be valid with clean data', () => {
    const rows = [
      { name: 'Bar A', city: 'Berlin' },
      { name: 'Bar B', city: 'Munich' },
    ];
    const result = validateImportBatch(rows, 'venues');
    expect(result.isValid).toBe(true);
  });

  it('should check required fields', () => {
    const rows = [{ name: '', city: 'Berlin' }];
    const result = validateImportBatch(rows, 'venues', ['name']);
    expect(result.isValid).toBe(false);
  });
});
