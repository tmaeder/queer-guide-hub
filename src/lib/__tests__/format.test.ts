import { describe, it, expect } from 'vitest';
import { formatDate, formatDateTime } from '../format';

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
