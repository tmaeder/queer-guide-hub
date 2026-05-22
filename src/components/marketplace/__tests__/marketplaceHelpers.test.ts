import { describe, it, expect } from 'vitest';
import {
  formatListingPrice,
  getOutboundLink,
  linkHealthState,
  sourceDisplayLabel,
  sourceProvenanceLine,
  trustPillsFor,
} from '../marketplaceHelpers';

const listing = {
  id: 'l1',
  source_type: 'awin',
  external_url: 'https://example.com',
  link_health: 'ok',
  last_link_checked_at: new Date().toISOString(),
} as never;

describe('marketplaceHelpers', () => {
  it('getOutboundLink returns object or null', () => {
    const link = getOutboundLink(listing);
    expect(link === null || typeof link === 'object').toBe(true);
  });
  it('sourceDisplayLabel returns string or null', () => {
    expect(typeof sourceDisplayLabel('awin') === 'string' || sourceDisplayLabel('awin') === null).toBe(true);
  });
  it('sourceProvenanceLine returns string or null', () => {
    const out = sourceProvenanceLine(listing);
    expect(out === null || typeof out === 'string').toBe(true);
  });
  it('trustPillsFor returns array', () => {
    expect(Array.isArray(trustPillsFor(listing))).toBe(true);
  });
  it('linkHealthState returns known state', () => {
    expect(['ok', 'stale', 'broken', 'unknown']).toContain(linkHealthState(listing));
  });
});

describe('formatListingPrice', () => {
  // EUR is 1 EUR = 1.08 USD; GBP is 1 GBP = 1.27 USD.
  const rates = { USD: 1, EUR: 1.08, GBP: 1.27 };

  const eurListing = {
    id: 'a',
    price: 32,
    price_usd: 34.56, // 32 * 1.08
    currency: 'EUR',
    price_type: 'fixed',
  } as never;

  const usdListing = {
    id: 'b',
    price: 100,
    price_usd: 100,
    currency: 'USD',
    price_type: 'fixed',
  } as never;

  it('shows native EUR + USD ≈ when display=USD', () => {
    const out = formatListingPrice(eurListing, { displayCurrency: 'USD', rates });
    expect(out.primary).toMatch(/€/);
    expect(out.primary).toMatch(/32/);
    expect(out.secondary).toMatch(/≈/);
    expect(out.secondary).toMatch(/\$/);
  });

  it('shows native EUR + GBP ≈ when display=GBP', () => {
    const out = formatListingPrice(eurListing, { displayCurrency: 'GBP', rates });
    expect(out.primary).toMatch(/€/);
    // 34.56 USD / 1.27 ≈ 27 GBP
    expect(out.secondary).toMatch(/≈/);
    expect(out.secondary).toMatch(/£|GBP/);
    expect(out.secondary).not.toMatch(/\$/);
  });

  it('hides secondary when native == display', () => {
    const out = formatListingPrice(usdListing, { displayCurrency: 'USD', rates });
    expect(out.secondary).toBeNull();
  });

  it('hides secondary when fx rate is missing', () => {
    const out = formatListingPrice(eurListing, { displayCurrency: 'JPY', rates });
    expect(out.secondary).toBeNull();
  });

  it('returns Free for price_type=free', () => {
    expect(formatListingPrice({ price_type: 'free' } as never).primary).toBe('Free');
  });

  it('returns Price varies when no price set', () => {
    expect(formatListingPrice({} as never).primary).toBe('Price varies');
  });
});
