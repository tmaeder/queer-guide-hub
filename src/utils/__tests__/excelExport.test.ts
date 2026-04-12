import { describe, it, expect } from 'vitest';
import { formatDate, formatDateTime, formatArray, formatBoolean, generateFilename } from '../excelExport';

// Only test pure formatting helpers — exportToExcel and fetchAllRows need
// heavy mocking of exceljs and supabase respectively, tested via integration.

describe('formatDate', () => {
  it('should format ISO date string to yyyy-MM-dd', () => {
    expect(formatDate('2024-06-15T10:30:00Z')).toBe('2024-06-15');
  });

  it('should return empty string for null', () => {
    expect(formatDate(null)).toBe('');
  });

  it('should return empty string for undefined', () => {
    expect(formatDate(undefined)).toBe('');
  });

  it('should return raw string for invalid date', () => {
    expect(formatDate('not-a-date')).toBe('not-a-date');
  });
});

describe('formatDateTime', () => {
  it('should format to yyyy-MM-dd HH:mm', () => {
    const result = formatDateTime('2024-06-15T10:30:00Z');
    expect(result).toMatch(/2024-06-15 \d{2}:\d{2}/);
  });

  it('should return empty string for null', () => {
    expect(formatDateTime(null)).toBe('');
  });

  it('should return raw string for invalid date', () => {
    expect(formatDateTime('nope')).toBe('nope');
  });
});

describe('formatArray', () => {
  it('should join array with semicolons', () => {
    expect(formatArray(['a', 'b', 'c'])).toBe('a; b; c');
  });

  it('should return empty string for null', () => {
    expect(formatArray(null)).toBe('');
  });

  it('should return empty string for empty array', () => {
    expect(formatArray([])).toBe('');
  });

  it('should return empty string for undefined', () => {
    expect(formatArray(undefined)).toBe('');
  });
});

describe('formatBoolean', () => {
  it('should return Yes for true', () => {
    expect(formatBoolean(true)).toBe('Yes');
  });

  it('should return No for false', () => {
    expect(formatBoolean(false)).toBe('No');
  });

  it('should return empty string for null', () => {
    expect(formatBoolean(null)).toBe('');
  });

  it('should return empty string for undefined', () => {
    expect(formatBoolean(undefined)).toBe('');
  });
});

describe('generateFilename', () => {
  it('should include content type', () => {
    const filename = generateFilename('venues');
    expect(filename).toContain('venues');
  });

  it('should end with .xlsx', () => {
    expect(generateFilename('events')).toMatch(/\.xlsx$/);
  });

  it('should include date in yyyy-MM-dd format', () => {
    const filename = generateFilename('venues');
    expect(filename).toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('should start with queerguide prefix', () => {
    expect(generateFilename('news')).toMatch(/^queerguide-/);
  });
});
