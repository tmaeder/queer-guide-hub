import { describe, expect, it } from 'vitest';
import { formatPrice, hasValidPrice } from '../price';

describe('hasValidPrice', () => {
  it('rejects 0, negatives, null/undefined, NaN, Infinity', () => {
    expect(hasValidPrice(0)).toBe(false);
    expect(hasValidPrice(-5)).toBe(false);
    expect(hasValidPrice(null)).toBe(false);
    expect(hasValidPrice(undefined)).toBe(false);
    expect(hasValidPrice(NaN)).toBe(false);
    expect(hasValidPrice(Infinity)).toBe(false);
  });
  it('accepts positive finite numbers', () => {
    expect(hasValidPrice(1)).toBe(true);
    expect(hasValidPrice(120.5)).toBe(true);
  });
});

describe('formatPrice', () => {
  it('returns unavailable label for invalid prices', () => {
    expect(formatPrice(0, 'EUR', { locale: 'en-US' })).toBe('Price on request');
    expect(formatPrice(null, 'EUR', { locale: 'en-US' })).toBe('Price on request');
    expect(formatPrice(undefined, 'EUR', { locale: 'en-US' })).toBe('Price on request');
    expect(formatPrice(NaN, 'EUR', { locale: 'en-US' })).toBe('Price on request');
    expect(formatPrice(-10, 'EUR', { locale: 'en-US' })).toBe('Price on request');
  });
  it('honours custom unavailable label', () => {
    expect(formatPrice(0, 'EUR', { locale: 'en-US', unavailableLabel: 'n/a' })).toBe('n/a');
  });
  it('formats EUR with no fractions', () => {
    expect(formatPrice(120, 'EUR', { locale: 'en-US' })).toBe('€120');
  });
  it('normalizes lowercase currency codes', () => {
    expect(formatPrice(50, 'eur', { locale: 'en-US' })).toBe('€50');
  });
  it('defaults to EUR when currency is missing', () => {
    expect(formatPrice(42, null, { locale: 'en-US' })).toBe('€42');
    expect(formatPrice(42, undefined, { locale: 'en-US' })).toBe('€42');
  });
  it('formats USD', () => {
    expect(formatPrice(99, 'USD', { locale: 'en-US' })).toBe('$99');
  });
  it('falls back gracefully for invalid currency', () => {
    expect(formatPrice(75, 'XYZZZ', { locale: 'en-US' })).toMatch(/75/);
  });
});
