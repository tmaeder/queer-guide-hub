import { describe, it, expect } from 'vitest';
import { resolveEntityImage, isValidImageUrl } from '../resolveEntityImage';

describe('isValidImageUrl', () => {
  it('accepts https URLs', () => {
    expect(isValidImageUrl('https://example.com/a.jpg')).toBe(true);
  });
  it('rejects http, data URIs, empty values', () => {
    expect(isValidImageUrl('http://example.com/a.jpg')).toBe(false);
    expect(isValidImageUrl('data:image/svg+xml;base64,...')).toBe(false);
    expect(isValidImageUrl('')).toBe(false);
    expect(isValidImageUrl(null)).toBe(false);
    expect(isValidImageUrl(undefined)).toBe(false);
  });
});

describe('resolveEntityImage — city/country', () => {
  it('prefers curated_image_url over image_url', () => {
    const r = resolveEntityImage('city', {
      image_url: 'https://ex.com/bad.jpg',
      curated_image_url: 'https://ex.com/good.jpg',
    });
    expect(r).toEqual({ url: 'https://ex.com/good.jpg', source: 'curated', metadata: undefined });
  });

  it('returns persisted when not flagged', () => {
    const r = resolveEntityImage('country', {
      image_url: 'https://ex.com/ok.jpg',
      image_flagged: false,
    });
    expect(r.url).toBe('https://ex.com/ok.jpg');
    expect(r.source).toBe('persisted');
  });

  it('skips flagged image_url', () => {
    const r = resolveEntityImage('city', {
      image_url: 'https://ex.com/wrong.jpg',
      image_flagged: true,
    });
    expect(r).toEqual({ url: null, source: 'none' });
  });

  it('skips invalid URLs', () => {
    const r = resolveEntityImage('city', { image_url: 'not-a-url' });
    expect(r.url).toBeNull();
  });
});

describe('resolveEntityImage — event', () => {
  it('picks first VALID entry in images, not just [0]', () => {
    const r = resolveEntityImage('event', {
      images: [null, 'not-a-url', 'https://ex.com/ok.jpg', 'https://ex.com/also.jpg'],
    });
    expect(r.url).toBe('https://ex.com/ok.jpg');
    expect(r.source).toBe('event-images');
  });

  it('falls through to image_url when images[] has none valid', () => {
    const r = resolveEntityImage('event', {
      images: [null, ''],
      image_url: 'https://ex.com/fallback.jpg',
    });
    expect(r.url).toBe('https://ex.com/fallback.jpg');
    expect(r.source).toBe('persisted');
  });

  it('returns none when nothing valid', () => {
    const r = resolveEntityImage('event', { images: [], image_url: null });
    expect(r).toEqual({ url: null, source: 'none' });
  });

  it('handles null record', () => {
    expect(resolveEntityImage('event', null)).toEqual({ url: null, source: 'none' });
  });
});
