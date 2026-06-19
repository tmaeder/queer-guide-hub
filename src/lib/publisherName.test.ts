import { describe, it, expect } from 'vitest';
import { resolvePublisherName } from './publisherName';

describe('resolvePublisherName', () => {
  it('returns a real publisher_name as-is', () => {
    expect(resolvePublisherName({ publisherName: 'Pink News' })).toBe('Pink News');
  });

  it('never returns the generic rss-news label', () => {
    expect(resolvePublisherName({ publisherName: 'rss-news' })).toBe('');
    expect(resolvePublisherName({ publisherName: 'RSS_NEWS' })).toBe('');
    expect(resolvePublisherName({ publisherName: 'rss' })).toBe('');
  });

  it('derives the outlet from the article URL host when publisher is generic', () => {
    expect(
      resolvePublisherName({ publisherName: 'rss-news', url: 'https://www.theguardian.com/x' }),
    ).toBe('Theguardian');
    expect(
      resolvePublisherName({ publisherName: null, url: 'https://dallasvoice.com/story' }),
    ).toBe('Dallasvoice');
  });

  it('skips aggregator/redirect hosts and falls back to the source name', () => {
    expect(
      resolvePublisherName({
        publisherName: 'rss-news',
        url: 'https://news.google.com/rss/articles/abc',
        sourceName: 'Google News LGBT Rights',
      }),
    ).toBe('Google News LGBT Rights');
    expect(
      resolvePublisherName({
        publisherName: null,
        url: 'https://us.headtopics.com/news/x',
        sourceName: 'NewsData.io',
      }),
    ).toBe('NewsData.io');
  });

  it('returns empty string when nothing resolvable', () => {
    expect(resolvePublisherName({ publisherName: 'rss-news' })).toBe('');
    expect(resolvePublisherName({ publisherName: '', url: 'not a url' })).toBe('');
  });

  it('does not return a generic source name fallback', () => {
    expect(resolvePublisherName({ publisherName: 'rss', sourceName: 'rss-news' })).toBe('');
  });
});
