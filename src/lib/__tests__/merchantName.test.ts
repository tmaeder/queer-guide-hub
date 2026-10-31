import { describe, it, expect } from 'vitest';
import { cleanMerchantName, pickMerchantName } from '../merchantName';

// Fixtures are real `business_name` values read from prod on 2026-10-31.
describe('cleanMerchantName', () => {
  it("keeps the seller's own spelling", () => {
    // The domain-derived guess was "Marekrichard".
    expect(cleanMerchantName('Marek+Richard')).toBe('Marek+Richard');
  });

  it('cuts a store-title suffix', () => {
    expect(cleanMerchantName('SUPER GAY UNDERWEAR | Official Online Store')).toBe(
      'SUPER GAY UNDERWEAR',
    );
    expect(cleanMerchantName('Otherwild – Shop')).toBe('Otherwild');
  });

  it('rejects a bare domain, which is not a name', () => {
    expect(cleanMerchantName('demask.com')).toBeNull();
  });

  it('rejects empty and overlong values', () => {
    expect(cleanMerchantName('')).toBeNull();
    expect(cleanMerchantName(null)).toBeNull();
    expect(cleanMerchantName('x'.repeat(49))).toBeNull();
  });

  it('does not cut a hyphen that is part of the name', () => {
    expect(cleanMerchantName('Queer-Shop')).toBe('Queer-Shop');
  });
});

describe('pickMerchantName', () => {
  it('takes the most frequent usable name', () => {
    expect(pickMerchantName(['demask.com', 'Demask', 'Demask', 'Other'])).toBe('Demask');
  });

  it('returns null when nothing is usable, so the caller falls back', () => {
    expect(pickMerchantName(['demask.com', null, ''])).toBeNull();
  });
});
