import { describe, it, expect } from 'vitest';
import {
  detectPlatform,
  normalizeHandle,
  buildProfileUrl,
  extractSocialUrlsFromText,
  normalizeSocialLinks,
  canonicalizeUrl,
} from './registry';

describe('detectPlatform', () => {
  const cases: Array<[string, string | null]> = [
    ['https://instagram.com/queer.guide', 'instagram'],
    ['https://www.instagram.com/queer.guide/', 'instagram'],
    ['https://tiktok.com/@someone', 'tiktok'],
    ['https://www.youtube.com/@channelname', 'youtube'],
    ['https://youtube.com/channel/UC123abc', 'youtube'],
    ['https://facebook.com/StonewallUK', 'facebook'],
    ['https://x.com/handle', 'twitter'],
    ['https://twitter.com/handle', 'twitter'],
    ['https://threads.net/@user', 'threads'],
    ['https://bsky.app/profile/user.bsky.social', 'bluesky'],
    ['https://linkedin.com/in/some-person', 'linkedin'],
    ['https://linkedin.com/company/acme', 'linkedin'],
    ['https://t.me/channelname', 'telegram'],
    ['https://github.com/octocat', 'github'],
    ['https://reddit.com/user/spez', 'reddit'],
    ['https://twitch.tv/streamer', 'twitch'],
    ['https://open.spotify.com/artist/3abc123def', 'spotify'],
    ['https://soundcloud.com/artistname', 'soundcloud'],
    ['https://patreon.com/creator', 'patreon'],
    ['https://medium.com/@writer', 'medium'],
    ['https://tech.lgbt/@activist', 'mastodon'],
    ['https://example.org/about', 'website'],
    ['instagram.com/noproto', 'instagram'],
    ['not a url', null],
    ['', null],
  ];
  it.each(cases)('%s -> %s', (url, expected) => {
    expect(detectPlatform(url)).toBe(expected);
  });

  it('does not misclassify known hosts as mastodon', () => {
    expect(detectPlatform('https://instagram.com/@weird')).not.toBe('mastodon');
    expect(detectPlatform('https://medium.com/@writer')).toBe('medium');
  });
});

describe('normalizeHandle', () => {
  it('extracts handles from URLs', () => {
    expect(normalizeHandle('instagram', 'https://instagram.com/queer.guide/')).toBe('queer.guide');
    expect(normalizeHandle('tiktok', 'https://tiktok.com/@dragrace')).toBe('dragrace');
    expect(normalizeHandle('twitter', 'https://x.com/handle')).toBe('handle');
    expect(normalizeHandle('telegram', 'https://t.me/channelname')).toBe('channelname');
  });
  it('strips a leading @ from bare handles', () => {
    expect(normalizeHandle('instagram', '@queer.guide')).toBe('queer.guide');
    expect(normalizeHandle('instagram', 'queer.guide')).toBe('queer.guide');
  });
  it('rebuilds mastodon user@host', () => {
    expect(normalizeHandle('mastodon', 'https://tech.lgbt/@activist')).toBe('activist@tech.lgbt');
  });
});

describe('buildProfileUrl', () => {
  it('builds canonical URLs from bare handles', () => {
    expect(buildProfileUrl('instagram', 'queer.guide')).toBe('https://instagram.com/queer.guide');
    expect(buildProfileUrl('tiktok', '@dragrace')).toBe('https://tiktok.com/@dragrace');
    expect(buildProfileUrl('twitter', 'handle')).toBe('https://x.com/handle');
    expect(buildProfileUrl('mastodon', 'activist@tech.lgbt')).toBe('https://tech.lgbt/@activist');
  });
  it('passes full URLs through', () => {
    expect(buildProfileUrl('instagram', 'https://instagram.com/x')).toBe('https://instagram.com/x');
  });
});

describe('canonicalizeUrl', () => {
  it('normalizes tracking/trailing junk to canonical', () => {
    expect(canonicalizeUrl('instagram', 'https://www.instagram.com/queer.guide/')).toBe(
      'https://instagram.com/queer.guide',
    );
  });
});

describe('extractSocialUrlsFromText', () => {
  it('finds social URLs in free text and ignores plain websites', () => {
    const text = `Follow us! https://instagram.com/venue and https://x.com/venue or visit https://venue.com`;
    const out = extractSocialUrlsFromText(text);
    expect(out.instagram).toBe('https://instagram.com/venue');
    expect(out.twitter).toBe('https://x.com/venue');
    expect(out.website).toBeUndefined();
  });
  it('keeps the first URL per platform', () => {
    const out = extractSocialUrlsFromText('https://instagram.com/first https://instagram.com/second');
    expect(out.instagram).toBe('https://instagram.com/first');
  });
});

describe('normalizeSocialLinks', () => {
  it('canonicalizes known keys and detects unknown keys from values', () => {
    const out = normalizeSocialLinks({
      instagram: 'https://www.instagram.com/venue/',
      ig: 'https://instagram.com/other',
      custom: 'https://x.com/venue',
      empty: '',
      bogus: 123 as unknown as string,
    });
    expect(out.instagram).toBe('https://instagram.com/venue');
    expect(out.twitter).toBe('https://x.com/venue');
  });
});
