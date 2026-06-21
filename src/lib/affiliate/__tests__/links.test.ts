import { describe, it, expect } from 'vitest';
import { applySubId, goHref, AFFILIATE_REL } from '../links';
import { BOOKING_LABEL_BASE, AFFILIATE_SURFACES, isAffiliateSurface } from '../config';

describe('applySubId', () => {
  it('adds sub_id for Travelpayouts-native partners (Aviasales)', () => {
    const out = applySubId('https://www.aviasales.com/?params=ZRHBCN1&marker=452012', 'aviasales', 'venue');
    expect(new URL(out).searchParams.get('sub_id')).toBe('venue');
  });

  it('uses placement for GetYourGuide', () => {
    const out = applySubId('https://www.getyourguide.com/s/?q=Berlin&partner_id=2PBDXWH', 'getyourguide', 'event');
    expect(new URL(out).searchParams.get('placement')).toBe('event');
    expect(new URL(out).searchParams.has('sub_id')).toBe(false);
  });

  it('folds the surface into the Booking.com label', () => {
    const out = applySubId('https://www.booking.com/searchresults.html?ss=Paris', 'booking', 'city');
    expect(new URL(out).searchParams.get('label')).toBe(`${BOOKING_LABEL_BASE}-city`);
  });

  it('is idempotent', () => {
    const once = applySubId('https://www.aviasales.com/?marker=452012', 'aviasales', 'trip');
    const twice = applySubId(once, 'aviasales', 'trip');
    expect(twice).toBe(once);
  });

  it('returns the url unchanged for unknown partners', () => {
    const raw = 'https://example.com/?x=1';
    expect(applySubId(raw, 'nope', 'venue')).toBe(raw);
  });

  it('never throws on malformed urls', () => {
    expect(applySubId('not a url', 'aviasales', 'venue')).toBe('not a url');
  });
});

describe('goHref', () => {
  it('falls back to a directly-tagged url when no proxy origin is set', () => {
    // VITE_SEARCH_PROXY_URL is unset in the test env.
    const out = goHref({
      url: 'https://www.aviasales.com/?marker=452012',
      partner: 'aviasales',
      surface: 'venue',
      vertical: 'flight',
    });
    expect(new URL(out).searchParams.get('sub_id')).toBe('venue');
  });
});

describe('surface taxonomy', () => {
  it('exposes the frozen surface list', () => {
    expect(AFFILIATE_SURFACES).toContain('venue');
    expect(AFFILIATE_SURFACES).toContain('esim');
    expect(isAffiliateSurface('venue')).toBe(true);
    expect(isAffiliateSurface('bogus')).toBe(false);
  });
});

describe('AFFILIATE_REL', () => {
  it('marks links as sponsored + nofollow + noopener', () => {
    expect(AFFILIATE_REL).toContain('sponsored');
    expect(AFFILIATE_REL).toContain('nofollow');
    expect(AFFILIATE_REL).toContain('noopener');
  });
});
