import { describe, it, expect } from 'vitest';
import { ensureProtocol, isValidHttpUrl, normalizeAndValidateUrl } from '../url';

describe('ensureProtocol', () => {
  it('prepends https:// when missing', () => {
    expect(ensureProtocol('example.com')).toBe('https://example.com');
  });
  it('keeps existing protocol', () => {
    expect(ensureProtocol('http://example.com')).toBe('http://example.com');
    expect(ensureProtocol('https://example.com')).toBe('https://example.com');
  });
  it('trims whitespace', () => {
    expect(ensureProtocol('  example.com ')).toBe('https://example.com');
  });
  it('passes through non-strings', () => {
    expect(ensureProtocol(null)).toBe(null);
    expect(ensureProtocol(undefined)).toBe(undefined);
  });
});

describe('isValidHttpUrl', () => {
  it('accepts real http(s) URLs with a TLD', () => {
    expect(isValidHttpUrl('https://example.com')).toBe(true);
    expect(isValidHttpUrl('http://a.co')).toBe(true);
    expect(isValidHttpUrl('https://sub.example.com/path?q=1')).toBe(true);
  });
  it('rejects hosts without a dot', () => {
    expect(isValidHttpUrl('https://foo')).toBe(false);
    expect(isValidHttpUrl('https://localhost')).toBe(false);
  });
  it('rejects non-http schemes', () => {
    expect(isValidHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isValidHttpUrl('data:text/plain,hi')).toBe(false);
    expect(isValidHttpUrl('ftp://example.com')).toBe(false);
  });
  it('rejects whitespace', () => {
    expect(isValidHttpUrl('http:// space.com')).toBe(false);
    expect(isValidHttpUrl('https://example .com')).toBe(false);
  });
  it('rejects numeric TLDs / bare IPs', () => {
    expect(isValidHttpUrl('http://1.2.3.4')).toBe(false);
  });
  it('rejects empty input', () => {
    expect(isValidHttpUrl('')).toBe(false);
  });
});

describe('normalizeAndValidateUrl', () => {
  it('auto-prefixes bare domains and returns normalized url', () => {
    const r = normalizeAndValidateUrl('example.com');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe('https://example.com');
  });
  it('rejects obviously-bad values with a human reason', () => {
    const r = normalizeAndValidateUrl('foo');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/valid/i);
  });
  it('rejects javascript: URLs', () => {
    expect(normalizeAndValidateUrl('javascript:alert(1)').ok).toBe(false);
  });
  it('treats blank as invalid', () => {
    expect(normalizeAndValidateUrl('   ').ok).toBe(false);
    expect(normalizeAndValidateUrl('').ok).toBe(false);
    expect(normalizeAndValidateUrl(undefined).ok).toBe(false);
  });
  it('accepts already-valid URLs unchanged', () => {
    const r = normalizeAndValidateUrl('https://a.co/path');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe('https://a.co/path');
  });
});
