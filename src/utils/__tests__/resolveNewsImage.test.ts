import { describe, expect, it } from 'vitest';
import { resolveNewsImage } from '../resolveNewsImage';

describe('news image privacy boundary', () => {
  it('never hotlinks an original while mirrors are pending or absent', () => {
    expect(resolveNewsImage({ imageUrl: 'https://images.pexels.com/photo.jpg' })).toBeNull();
    expect(resolveNewsImage({ imageUrl: 'https://publisher.example/photo.jpg' })).toBeNull();
  });
  it('uses the uploaded mirror and honors the thumbnail preference', () => {
    const opts = {
      imageUrl: 'https://publisher.example/a.jpg',
      optimizedUrl: 'https://img.queer.guide/images/a.jpg',
      thumbnailUrl: 'https://img.queer.guide/thumb/images/a.jpg',
    };
    expect(resolveNewsImage(opts)).toBe(opts.optimizedUrl);
    expect(resolveNewsImage({ ...opts, preferThumb: true })).toBe(opts.thumbnailUrl);
  });
  it('accepts our local images but rejects lookalike hosts and insecure URLs', () => {
    expect(resolveNewsImage({ imageUrl: '/images/news.webp' })).toBe('/images/news.webp');
    for (const imageUrl of [
      '//publisher.example/a.jpg',
      '/\n/publisher.example/a.jpg',
      '/\t/publisher.example/a.jpg',
      '/\\publisher.example/a.jpg',
      'https://img.queer.guide.evil.test/a.jpg',
      'http://img.queer.guide/a.jpg',
      'data:image/png;base64,foo',
      'https://user@img.queer.guide/a.jpg',
    ]) {
      expect(resolveNewsImage({ imageUrl })).toBeNull();
    }
  });
});
