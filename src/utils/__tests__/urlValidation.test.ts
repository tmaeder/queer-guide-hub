import { describe, it, expect } from 'vitest';
import { normalizeAndValidateUrl, isValidHttpUrl, ensureProtocol } from '../url';

const INVALID_MSG = 'Please enter a full valid URL like https://example.com';

describe('normalizeAndValidateUrl', () => {
  const valid = [
    'https://example.com',
    'https://example.com/event',
    'https://www.eventbrite.com/e/test',
    'https://sub.domain.co.uk/path',
    'example.com',
    'www.example.org/event',
    'https://example.com:8080/path?x=1',
  ];

  const invalid = [
    'just-some-text',
    'https://just-some-text',
    'localhost',
    'http://localhost:3000',
    'https://internal',
    'not a url',
    'https://127.0.0.1',
    'https://192.168.1.1',
    'https://10.0.0.1',
    'ftp://example.com',
    'https://foo.1',
    '',
    '   ',
    'https://.com',
    'https://example.',
  ];

  valid.forEach((v) => {
    it(`accepts: ${v}`, () => {
      const r = normalizeAndValidateUrl(v);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toMatch(/^https?:\/\//);
    });
  });

  invalid.forEach((v) => {
    it(`rejects: ${JSON.stringify(v)}`, () => {
      const r = normalizeAndValidateUrl(v);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe(INVALID_MSG);
    });
  });

  it('isValidHttpUrl reflects validator rules after ensureProtocol', () => {
    expect(isValidHttpUrl(ensureProtocol('example.com') as string)).toBe(true);
    expect(isValidHttpUrl(ensureProtocol('just-some-text') as string)).toBe(false);
    expect(isValidHttpUrl('http://localhost')).toBe(false);
  });
});
