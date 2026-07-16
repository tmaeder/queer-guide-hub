import { describe, it, expect, afterEach } from 'vitest';
import {
  optimizeImageForCloudflare,
  buildCfImageUrl,
  buildCfSrcSet,
  getCloudflareGeoData,
  initCloudflareOptimizations,
} from '../cloudflareOptimizations';

const SUPA_OBJECT =
  'https://xqeacpakadqfxjxjcewc.supabase.co/storage/v1/object/public/marketplace-images/9f/img.png';

describe('buildCfImageUrl', () => {
  it('wraps img.queer.guide assets through CF resizing', () => {
    const out = buildCfImageUrl('https://img.queer.guide/abc.jpg', { width: 600 });
    expect(out).toContain('img.queer.guide/cdn-cgi/image/');
    expect(out).toContain('width=600');
    expect(out).toContain('/https://img.queer.guide/abc.jpg');
  });

  it('routes Supabase Storage objects through img.queer.guide CF resizing', () => {
    const out = buildCfImageUrl(SUPA_OBJECT, { width: 800 });
    expect(out).toContain('img.queer.guide/cdn-cgi/image/width=800');
    expect(out).toContain(`/${SUPA_OBJECT}`);
  });

  it('leaves merchant-CDN images unchanged (CF cannot safely fetch them)', () => {
    const src = 'https://cdn.shopify.com/s/files/1/img.jpg';
    expect(buildCfImageUrl(src, { width: 800 })).toBe(src);
  });

  it('does not double-wrap an already-resized URL', () => {
    const already = 'https://img.queer.guide/cdn-cgi/image/width=400/https://img.queer.guide/x.jpg';
    expect(buildCfImageUrl(already, { width: 800 })).toBe(already);
  });
});

describe('buildCfSrcSet', () => {
  it('emits a multi-width srcset for Supabase Storage objects', () => {
    const set = buildCfSrcSet(SUPA_OBJECT, [400, 800]);
    expect(set).toBeDefined();
    expect(set).toContain('400w');
    expect(set).toContain('800w');
    expect(set).toContain('img.queer.guide/cdn-cgi/image/');
  });

  it('returns undefined for merchant CDNs', () => {
    expect(buildCfSrcSet('https://cdn.shopify.com/s/files/1/img.jpg')).toBeUndefined();
  });
});

describe('optimizeImageForCloudflare', () => {
  it('should add params to imagedelivery.net URLs', () => {
    const url = optimizeImageForCloudflare('https://imagedelivery.net/abc/img.jpg', 300, 200);
    expect(url).toContain('w=300');
    expect(url).toContain('h=200');
    expect(url).toContain('f=auto');
    expect(url).toContain('q=85');
  });

  it('should add params to cf-images.com URLs', () => {
    const url = optimizeImageForCloudflare('https://cf-images.com/img.jpg', 100);
    expect(url).toContain('w=100');
    expect(url).not.toContain('h=');
  });

  it('should use & separator when URL already has query params', () => {
    const url = optimizeImageForCloudflare('https://imagedelivery.net/img.jpg?v=1', 100);
    expect(url).toContain('?v=1&w=100');
  });

  it('should return non-CF URLs unchanged', () => {
    const src = 'https://example.com/img.jpg';
    expect(optimizeImageForCloudflare(src)).toBe(src);
  });

  it('should respect custom format and quality', () => {
    const url = optimizeImageForCloudflare('https://imagedelivery.net/img.jpg', 100, undefined, 'webp', 50);
    expect(url).toContain('f=webp');
    expect(url).toContain('q=50');
  });
});

describe('getCloudflareGeoData', () => {
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).CF;
  });

  it('should return CF data when available', () => {
    (window as unknown as Record<string, unknown>).CF = { country: 'CH', city: 'Zurich', timezone: 'Europe/Zurich' };
    const data = getCloudflareGeoData();
    expect(data.country).toBe('CH');
    expect(data.city).toBe('Zurich');
  });

  it('should return fallback defaults when CF not available', () => {
    const data = getCloudflareGeoData();
    expect(data.country).toBe('US');
    expect(data.city).toBe('San Francisco');
  });
});

describe('initCloudflareOptimizations', () => {
  it('should add dns-prefetch link to document head', () => {
    initCloudflareOptimizations();
    const link = document.querySelector('link[rel="dns-prefetch"][href="https://supabase.co"]');
    expect(link).not.toBeNull();
  });

  it('should not add duplicate links', () => {
    initCloudflareOptimizations();
    initCloudflareOptimizations();
    const links = document.querySelectorAll('link[rel="dns-prefetch"][href="https://supabase.co"]');
    expect(links).toHaveLength(1);
  });
});
