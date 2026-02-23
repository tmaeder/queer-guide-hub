import { describe, it, expect } from 'vitest';
import {
  matchPartner,
  cleanTrackingParams,
  rewriteAffiliateUrl,
  isAffiliateDomain,
  type AffiliatePartner,
} from '../affiliate';

const PARTNERS: AffiliatePartner[] = [
  {
    id: '1',
    partner_name: 'Aviasales',
    domains: ['aviasales.com', 'search.aviasales.com'],
    url_patterns: null,
    parameters: { marker: '452012' },
    redirect_template: null,
    enabled: true,
  },
  {
    id: '2',
    partner_name: 'Travelpayouts',
    domains: ['tp.media', 'travelpayouts.com'],
    url_patterns: null,
    parameters: { trs: '241762', shmarker: '452012' },
    redirect_template: null,
    enabled: true,
  },
  {
    id: '3',
    partner_name: 'Booking.com',
    domains: ['booking.com'],
    url_patterns: null,
    parameters: {},
    redirect_template: null,
    enabled: true,
  },
  {
    id: '4',
    partner_name: 'Disabled Partner',
    domains: ['disabled.example.com'],
    url_patterns: null,
    parameters: { ref: 'abc' },
    redirect_template: null,
    enabled: false,
  },
];

describe('affiliate', () => {
  // ── matchPartner ──
  describe('matchPartner', () => {
    it('matches exact domain', () => {
      const partner = matchPartner('https://aviasales.com/flights', PARTNERS);
      expect(partner?.partner_name).toBe('Aviasales');
    });

    it('matches subdomain of partner domain', () => {
      const partner = matchPartner('https://search.aviasales.com/results?q=ZRH', PARTNERS);
      expect(partner?.partner_name).toBe('Aviasales');
    });

    it('matches with www prefix', () => {
      const partner = matchPartner('https://www.booking.com/hotels', PARTNERS);
      expect(partner?.partner_name).toBe('Booking.com');
    });

    it('returns null for unknown domain', () => {
      expect(matchPartner('https://google.com', PARTNERS)).toBeNull();
    });

    it('returns null for disabled partner', () => {
      expect(matchPartner('https://disabled.example.com/page', PARTNERS)).toBeNull();
    });

    it('returns null for malformed URL', () => {
      expect(matchPartner('not-a-url', PARTNERS)).toBeNull();
    });

    it('returns null for empty partners list', () => {
      expect(matchPartner('https://aviasales.com', [])).toBeNull();
    });
  });

  // ── cleanTrackingParams ──
  describe('cleanTrackingParams', () => {
    it('removes utm_source and utm_medium', () => {
      const url = 'https://example.com/page?utm_source=google&utm_medium=cpc&id=123';
      const cleaned = cleanTrackingParams(url);
      expect(cleaned).toContain('id=123');
      expect(cleaned).not.toContain('utm_source');
      expect(cleaned).not.toContain('utm_medium');
    });

    it('removes fbclid and gclid', () => {
      const url = 'https://example.com/?fbclid=abc123&gclid=def456&page=1';
      const cleaned = cleanTrackingParams(url);
      expect(cleaned).not.toContain('fbclid');
      expect(cleaned).not.toContain('gclid');
      expect(cleaned).toContain('page=1');
    });

    it('removes all known tracking params', () => {
      const params = 'utm_source=a&utm_medium=b&utm_campaign=c&utm_term=d&utm_content=e&fbclid=f&gclid=g&mc_cid=h&mc_eid=i&msclkid=j&twclid=k&_ga=l&_gl=m&dclid=n&srsltid=o';
      const url = `https://example.com/?${params}&keep=true`;
      const cleaned = cleanTrackingParams(url);
      const parsed = new URL(cleaned);
      expect(parsed.searchParams.get('keep')).toBe('true');
      expect(parsed.searchParams.has('utm_source')).toBe(false);
      expect(parsed.searchParams.has('fbclid')).toBe(false);
      expect(parsed.searchParams.has('_ga')).toBe(false);
    });

    it('preserves specified keys', () => {
      const url = 'https://example.com/?utm_source=google&marker=452012';
      const cleaned = cleanTrackingParams(url, new Set(['marker']));
      expect(cleaned).toContain('marker=452012');
      expect(cleaned).not.toContain('utm_source');
    });

    it('returns original URL for malformed input', () => {
      expect(cleanTrackingParams('not-a-url')).toBe('not-a-url');
    });

    it('returns URL unchanged when no tracking params exist', () => {
      const url = 'https://example.com/page?id=1&name=test';
      const cleaned = cleanTrackingParams(url);
      const original = new URL(url);
      const parsed = new URL(cleaned);
      expect(parsed.searchParams.get('id')).toBe(original.searchParams.get('id'));
      expect(parsed.searchParams.get('name')).toBe(original.searchParams.get('name'));
    });
  });

  // ── rewriteAffiliateUrl ──
  describe('rewriteAffiliateUrl', () => {
    it('adds affiliate params for Aviasales', () => {
      const url = 'https://aviasales.com/flights?from=ZRH&to=BCN';
      const rewritten = rewriteAffiliateUrl(url, PARTNERS);
      const parsed = new URL(rewritten);
      expect(parsed.searchParams.get('marker')).toBe('452012');
      expect(parsed.searchParams.get('from')).toBe('ZRH');
    });

    it('adds multiple affiliate params for Travelpayouts', () => {
      const url = 'https://tp.media/redirect?campaign=flights';
      const rewritten = rewriteAffiliateUrl(url, PARTNERS);
      const parsed = new URL(rewritten);
      expect(parsed.searchParams.get('trs')).toBe('241762');
      expect(parsed.searchParams.get('shmarker')).toBe('452012');
    });

    it('prevents double-tagging when marker already correct', () => {
      const url = 'https://aviasales.com/flights?marker=452012&from=ZRH';
      const rewritten = rewriteAffiliateUrl(url, PARTNERS);
      const parsed = new URL(rewritten);
      // marker should still be 452012, not duplicated
      expect(parsed.searchParams.get('marker')).toBe('452012');
      expect(parsed.searchParams.getAll('marker').length).toBe(1);
    });

    it('overwrites incorrect affiliate param value', () => {
      const url = 'https://aviasales.com/flights?marker=wrongvalue';
      const rewritten = rewriteAffiliateUrl(url, PARTNERS);
      const parsed = new URL(rewritten);
      expect(parsed.searchParams.get('marker')).toBe('452012');
    });

    it('cleans tracking params while adding affiliate params', () => {
      const url = 'https://aviasales.com/flights?utm_source=google&fbclid=abc&from=ZRH';
      const rewritten = rewriteAffiliateUrl(url, PARTNERS);
      const parsed = new URL(rewritten);
      expect(parsed.searchParams.get('marker')).toBe('452012');
      expect(parsed.searchParams.get('from')).toBe('ZRH');
      expect(parsed.searchParams.has('utm_source')).toBe(false);
      expect(parsed.searchParams.has('fbclid')).toBe(false);
    });

    it('returns URL unchanged for unknown domain', () => {
      const url = 'https://unknown.com/page?id=1';
      expect(rewriteAffiliateUrl(url, PARTNERS)).toBe(url);
    });

    it('returns URL unchanged for disabled partner', () => {
      const url = 'https://disabled.example.com/page';
      expect(rewriteAffiliateUrl(url, PARTNERS)).toBe(url);
    });

    it('returns URL unchanged for partner with empty parameters', () => {
      const url = 'https://booking.com/hotel/ch/zurich?checkin=2026-03-01';
      const rewritten = rewriteAffiliateUrl(url, PARTNERS);
      const parsed = new URL(rewritten);
      // Booking.com has no params — only tracking cleanup should happen
      expect(parsed.searchParams.get('checkin')).toBe('2026-03-01');
    });

    it('returns malformed URL unchanged', () => {
      expect(rewriteAffiliateUrl('not-a-url', PARTNERS)).toBe('not-a-url');
    });
  });

  // ── isAffiliateDomain ──
  describe('isAffiliateDomain', () => {
    it('returns true for known affiliate domain', () => {
      expect(isAffiliateDomain('https://aviasales.com/flights', PARTNERS)).toBe(true);
      expect(isAffiliateDomain('https://www.booking.com/hotel', PARTNERS)).toBe(true);
    });

    it('returns false for unknown domain', () => {
      expect(isAffiliateDomain('https://google.com', PARTNERS)).toBe(false);
    });

    it('returns false for disabled partner', () => {
      expect(isAffiliateDomain('https://disabled.example.com', PARTNERS)).toBe(false);
    });

    it('returns false for malformed URL', () => {
      expect(isAffiliateDomain('not-a-url', PARTNERS)).toBe(false);
    });
  });
});
