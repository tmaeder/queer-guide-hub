import { describe, it, expect } from 'vitest';
import {
  detectPlatform,
  normalizeHandle,
  buildProfileUrl,
  extractSocialUrlsFromText,
  normalizeSocialLinks,
  canonicalizeUrl,
  isAdultPlatform,
  displayHandle,
  isShareOrWidgetUrl,
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
    ['https://ko-fi.com/artist', 'kofi'],
    ['https://onlyfans.com/creator', 'onlyfans'],
    ['https://fansly.com/creator', 'fansly'],
    ['https://fetlife.com/users/12345', 'fetlife'],
    ['https://www.joyclub.de/profile/abc', 'joyclub'],
    ['https://www.romeo.com/someguy', 'romeo'],
    ['https://www.planetromeo.com/someguy', 'romeo'],
    ['https://www.grindr.com/profile/abc', 'grindr'],
    ['https://www.pornhub.com/model/somebody', 'pornhub'],
    ['https://xhamster.com/creators/somebody', 'xhamster'],
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

describe('share-intent / widget / post-permalink exclusion', () => {
  const bad = [
    'https://www.facebook.com/sharer/sharer.php?u=https://example.com',
    'https://facebook.com/sharer.php?u=x',
    'http://www.facebook.com/share.php',
    'https://t.me/share/url?url=https://example.com',
    'https://twitter.com/intent/tweet?text=hi',
    'https://x.com/intent/follow?screen_name=x',
    'https://www.facebook.com/dialog/share?href=x',
    'https://www.instagram.com/reels/ABC123/',
    'https://instagram.com/reel/ABC123',
    'https://www.instagram.com/p/ABC123/',
    'https://www.facebook.com/watch/?v=123',
    'https://www.facebook.com/hashtag/pride',
    'https://www.instagram.com/explore/tags/pride/',
    'https://www.instagram.com/stories/someone/123/',
    'https://instagram.com/reels',
    'https://facebook.com/sharer',
    'https://t.me/share',
  ];

  it.each(bad)('isShareOrWidgetUrl(%s) is true', (url) => {
    expect(isShareOrWidgetUrl(url)).toBe(true);
  });

  it.each(bad)('detectPlatform(%s) is null', (url) => {
    expect(detectPlatform(url)).toBeNull();
  });

  it('does not flag real profile links', () => {
    for (const url of [
      'https://instagram.com/queer.guide',
      'https://facebook.com/StonewallUK',
      'https://x.com/handle',
      'https://t.me/channelname',
      'https://www.instagram.com/sharemyplate', // "share..." handle, not /share/
    ]) {
      expect(isShareOrWidgetUrl(url)).toBe(false);
    }
  });

  it('normalizeHandle rejects reserved first-path segments', () => {
    expect(normalizeHandle('instagram', 'https://instagram.com/reels/ABC123/')).toBeNull();
    expect(normalizeHandle('instagram', 'https://instagram.com/p/ABC123/')).toBeNull();
    expect(normalizeHandle('facebook', 'https://facebook.com/watch/?v=1')).toBeNull();
    expect(normalizeHandle('instagram', 'reels')).toBeNull();
    expect(normalizeHandle('instagram', '@p')).toBeNull();
  });

  it('extractSocialUrlsFromText ignores share/widget URLs', () => {
    const text = `Share: https://www.facebook.com/sharer/sharer.php?u=x
      Tweet: https://twitter.com/intent/tweet?text=hi
      Reel: https://instagram.com/reels/ABC123/
      Real: https://instagram.com/queer.guide`;
    const out = extractSocialUrlsFromText(text);
    expect(out.facebook).toBeUndefined();
    expect(out.twitter).toBeUndefined();
    expect(out.instagram).toBe('https://instagram.com/queer.guide');
  });

  it('normalizeSocialLinks strips junk stored under a known key', () => {
    const out = normalizeSocialLinks({
      instagram: 'https://instagram.com/reels',
      facebook: 'https://facebook.com/sharer/sharer.php?u=x',
      telegram: 'https://t.me/share',
      twitter: 'https://x.com/realhandle',
    });
    expect(out.instagram).toBeUndefined();
    expect(out.facebook).toBeUndefined();
    expect(out.telegram).toBeUndefined();
    expect(out.twitter).toBe('https://x.com/realhandle');
  });
});

describe('displayHandle', () => {
  it('returns clean handles and strips path prefixes', () => {
    expect(displayHandle('instagram', 'ilgaeurope')).toBe('ilgaeurope');
    expect(displayHandle('instagram', '@ilgaeurope')).toBe('ilgaeurope');
    expect(displayHandle('linkedin', 'company/ilga-europe')).toBe('ilga-europe');
    expect(displayHandle('linkedin', 'in/some-person')).toBe('some-person');
    expect(displayHandle('reddit', 'user/spez')).toBe('spez');
    expect(displayHandle('youtube', 'c/SomeName')).toBe('SomeName');
  });
  it('returns null for opaque YouTube channel ids', () => {
    expect(displayHandle('youtube', 'channel/UC-3gHlKwV6HsK9-3ZRF4hPg')).toBeNull();
    expect(displayHandle('youtube', 'UC-3gHlKwV6HsK9-3ZRF4hPg')).toBeNull();
  });
  it('returns null for empty / still-path-shaped', () => {
    expect(displayHandle('instagram', '')).toBeNull();
    expect(displayHandle('youtube', 'a/b/c')).toBeNull();
  });
});

describe('isAdultPlatform', () => {
  it('flags 18+ platforms and not SFW ones', () => {
    for (const k of ['onlyfans', 'fansly', 'fetlife', 'joyclub', 'romeo', 'grindr', 'scruff', 'recon', 'pornhub', 'xhamster', 'xtube']) {
      expect(isAdultPlatform(k)).toBe(true);
    }
    for (const k of ['instagram', 'youtube', 'bluesky', 'kofi', 'patreon', 'website']) {
      expect(isAdultPlatform(k)).toBe(false);
    }
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
