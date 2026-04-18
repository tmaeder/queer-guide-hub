import { describe, it, expect } from 'vitest';
import { ensureProtocol } from '../ensureProtocol';

describe('ensureProtocol', () => {
  it('prepends https:// when no protocol present', () => {
    expect(ensureProtocol('example.com')).toBe('https://example.com');
    expect(ensureProtocol('www.foo.de/event')).toBe('https://www.foo.de/event');
  });

  it('preserves existing http(s) protocol', () => {
    expect(ensureProtocol('https://example.com')).toBe('https://example.com');
    expect(ensureProtocol('http://example.com')).toBe('http://example.com');
    expect(ensureProtocol('HTTPS://EXAMPLE.COM')).toBe('HTTPS://EXAMPLE.COM');
  });

  it('trims whitespace before checking', () => {
    expect(ensureProtocol('  example.com  ')).toBe('https://example.com');
  });

  it('returns empty string for blank input', () => {
    expect(ensureProtocol('')).toBe('');
    expect(ensureProtocol('   ')).toBe('');
  });

  it('passes non-string values through unchanged', () => {
    expect(ensureProtocol(undefined)).toBe(undefined);
    expect(ensureProtocol(null)).toBe(null);
    expect(ensureProtocol(42)).toBe(42);
  });
});
