import { describe, it, expect } from 'vitest';
import { isTrustedSrc, isMerchantSrc, imageReferrerPolicy } from '../imageHost';

describe('isTrustedSrc', () => {
  it('treats internal + supabase hosts as trusted', () => {
    expect(isTrustedSrc('https://img.queer.guide/x.jpg')).toBe(true);
    expect(isTrustedSrc('https://www.queer.guide/x.jpg')).toBe(true);
    expect(isTrustedSrc('https://abc.supabase.co/storage/x.jpg')).toBe(true);
  });

  it('treats external hosts as untrusted', () => {
    expect(isTrustedSrc('https://supergayunderwear.com/x.jpg')).toBe(false);
    expect(isTrustedSrc('https://i.guim.co.uk/x.jpg')).toBe(false);
  });

  it('defaults to trusted for unparseable/relative src', () => {
    expect(isTrustedSrc('/local/x.jpg')).toBe(true);
  });
});

describe('isMerchantSrc', () => {
  it('matches merchant hosts and their subdomains', () => {
    expect(isMerchantSrc('https://supergayunderwear.com/cdn/x.jpg')).toBe(true);
    expect(isMerchantSrc('https://www.misterb.com/x.jpg')).toBe(true);
    expect(isMerchantSrc('https://cdn.shopify.com/s/files/x.jpg')).toBe(true);
  });

  it('does not match non-merchant hosts', () => {
    expect(isMerchantSrc('https://i.guim.co.uk/x.jpg')).toBe(false);
    expect(isMerchantSrc('https://img.queer.guide/x.jpg')).toBe(false);
  });

  it('does not match a host that merely contains a merchant string', () => {
    expect(isMerchantSrc('https://notmisterb.com.evil.test/x.jpg')).toBe(false);
  });
});

describe('imageReferrerPolicy', () => {
  it('returns undefined (browser default) for trusted hosts', () => {
    expect(imageReferrerPolicy('https://img.queer.guide/x.jpg')).toBeUndefined();
  });

  it('sends the origin for hotlink-protected merchant hosts', () => {
    expect(imageReferrerPolicy('https://supergayunderwear.com/x.jpg')).toBe(
      'strict-origin-when-cross-origin',
    );
    expect(imageReferrerPolicy('https://misterb.com/x.jpg')).toBe(
      'strict-origin-when-cross-origin',
    );
  });

  it('strips the referer for publisher CDNs that 401 on a referer', () => {
    expect(imageReferrerPolicy('https://i.guim.co.uk/x.jpg')).toBe('no-referrer');
  });
});
