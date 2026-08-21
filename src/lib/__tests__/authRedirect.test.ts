import { describe, it, expect } from 'vitest';
import { sanitizeRedirect } from '../authRedirect';

describe('sanitizeRedirect', () => {
  it('accepts ordinary same-origin paths', () => {
    expect(sanitizeRedirect('/travel')).toBe('/travel');
    expect(sanitizeRedirect('/city/berlin?tab=venues#top')).toBe('/city/berlin?tab=venues#top');
    expect(sanitizeRedirect('/de/venues')).toBe('/de/venues');
    // Hyphens are legal in a path — an over-eager control-character regex
    // (`/[ -]/`, matching a literal space-to-hyphen range) once rejected these.
    expect(sanitizeRedirect('/queer-villages')).toBe('/queer-villages');
  });

  it('rejects absolute and protocol-relative URLs', () => {
    expect(sanitizeRedirect('https://evil.com')).toBeNull();
    expect(sanitizeRedirect('http://evil.com')).toBeNull();
    // Protocol-relative: the browser treats this as cross-origin.
    expect(sanitizeRedirect('//evil.com')).toBeNull();
    expect(sanitizeRedirect('///evil.com')).toBeNull();
  });

  it('rejects backslash-smuggled hosts', () => {
    // Some parsers normalise these to "//".
    expect(sanitizeRedirect('/\\evil.com')).toBeNull();
    expect(sanitizeRedirect('/\\/evil.com')).toBeNull();
  });

  it('rejects embedded schemes', () => {
    expect(sanitizeRedirect('/redirect?to=javascript:alert(1)')).toBeNull();
    expect(sanitizeRedirect('javascript:alert(1)')).toBeNull();
    expect(sanitizeRedirect('/x?u=data:text/html,x')).toBeNull();
  });

  it('rejects embedded control characters (header/response splitting)', () => {
    expect(sanitizeRedirect('/travel\nSet-Cookie: x')).toBeNull();
    expect(sanitizeRedirect('/travel\r\nLocation: /elsewhere')).toBeNull();
    expect(sanitizeRedirect('/tra\tvel')).toBeNull();
  });

  it('trims surrounding whitespace rather than rejecting it', () => {
    // Whitespace is stripped before validation, so these are ordinary paths.
    // Only control characters INSIDE the value are a splitting risk.
    expect(sanitizeRedirect('  /travel  ')).toBe('/travel');
    expect(sanitizeRedirect('/travel\r\n')).toBe('/travel');
  });

  it('treats empty and missing values as no redirect', () => {
    expect(sanitizeRedirect(null)).toBeNull();
    expect(sanitizeRedirect(undefined)).toBeNull();
    expect(sanitizeRedirect('')).toBeNull();
    expect(sanitizeRedirect('   ')).toBeNull();
  });

  it('rejects bare relative paths that are not rooted', () => {
    expect(sanitizeRedirect('travel')).toBeNull();
    expect(sanitizeRedirect('../admin')).toBeNull();
  });
});
