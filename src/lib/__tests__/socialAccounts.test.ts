import { describe, it, expect } from 'vitest';
import {
  detectPlatform,
  displayHandle,
  fromLegacyLinks,
  normalizeUrl,
  readAccounts,
  toLegacyLinks,
  unavatarSource,
} from '../socialAccounts';

describe('normalizeUrl', () => {
  it('adds https when missing', () => {
    expect(normalizeUrl('instagram.com/x')).toBe('https://instagram.com/x');
  });
  it('leaves existing scheme', () => {
    expect(normalizeUrl('http://x.com/y')).toBe('http://x.com/y');
  });
});

describe('detectPlatform', () => {
  it('detects instagram + handle', () => {
    expect(detectPlatform('https://instagram.com/queer.guide')).toEqual({
      platform: 'Instagram',
      handle: 'queer.guide',
    });
  });
  it('detects bluesky over the generic website rule', () => {
    expect(detectPlatform('https://bsky.app/profile/me.bsky.social').platform).toBe('Bluesky');
  });
  it('detects x/twitter', () => {
    expect(detectPlatform('https://x.com/jack').platform).toBe('X (Twitter)');
  });
  it('falls back to Website for unknown', () => {
    expect(detectPlatform('https://example.org/blog')).toEqual({ platform: 'Website', handle: null });
  });
});

describe('unavatarSource', () => {
  it('maps known platforms', () => {
    expect(unavatarSource('Instagram')).toBe('instagram');
    expect(unavatarSource('X (Twitter)')).toBe('twitter');
  });
  it('returns null for unsupported', () => {
    expect(unavatarSource('Bluesky')).toBeNull();
  });
});

describe('displayHandle', () => {
  it('prefers stored handle, strips @', () => {
    expect(displayHandle({ platform: 'X (Twitter)', url: 'https://x.com/jack', handle: '@jack' })).toBe('jack');
  });
  it('derives from url path when no handle', () => {
    expect(displayHandle({ platform: 'Website', url: 'https://foo.com/@me' })).toBe('me');
  });
});

describe('legacy <-> accounts', () => {
  it('migrates a legacy map', () => {
    const accounts = fromLegacyLinks({ Instagram: 'https://instagram.com/x', Website: '' });
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({ platform: 'Instagram', verified: 'unverified' });
  });
  it('round-trips to a links map', () => {
    expect(toLegacyLinks([{ platform: 'Instagram', url: 'https://instagram.com/x' }])).toEqual({
      Instagram: 'https://instagram.com/x',
    });
  });
});

describe('readAccounts', () => {
  it('prefers the accounts array', () => {
    const accounts = readAccounts([{ platform: 'Bluesky', url: 'https://bsky.app/profile/a' }], { Instagram: 'https://instagram.com/x' });
    expect(accounts).toHaveLength(1);
    expect(accounts[0].platform).toBe('Bluesky');
  });
  it('falls back to legacy links when array empty', () => {
    const accounts = readAccounts([], { Instagram: 'https://instagram.com/x' });
    expect(accounts[0].platform).toBe('Instagram');
  });
  it('drops malformed entries', () => {
    const accounts = readAccounts([{ platform: 'X', url: '' }, { platform: 'Y', url: 'https://y.com' }]);
    expect(accounts).toHaveLength(1);
  });
});
