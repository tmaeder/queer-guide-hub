import { describe, it, expect } from 'vitest';
import { formatCurrency, formatCents, getCurrencySymbol, isZeroDecimal, ZERO_DECIMAL_CURRENCIES } from '../currency';

describe('currency', () => {
  it('formatCurrency formats USD', () => {
    expect(formatCurrency(10, 'USD')).toMatch(/10/);
  });
  it('formatCurrency handles null currency', () => {
    expect(typeof formatCurrency(5, null)).toBe('string');
  });
  it('formatCents divides by 100 for non-zero-decimal', () => {
    expect(formatCents(1000, 'USD')).toMatch(/10/);
  });
  it('formatCents does not divide for JPY', () => {
    const s = formatCents(1000, 'JPY');
    expect(s).toMatch(/1[,.]?000/);
  });
  it('getCurrencySymbol returns a string', () => {
    expect(typeof getCurrencySymbol('USD')).toBe('string');
  });
  it('isZeroDecimal true for JPY false for USD', () => {
    expect(isZeroDecimal('JPY')).toBe(true);
    expect(isZeroDecimal('USD')).toBe(false);
  });
  it('ZERO_DECIMAL_CURRENCIES includes JPY', () => {
    expect(ZERO_DECIMAL_CURRENCIES.has('JPY')).toBe(true);
  });
});
