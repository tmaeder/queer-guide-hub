import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  optimizeImageForCloudflare,
  getCloudflareGeoData,
  initCloudflareOptimizations,
} from '../cloudflareOptimizations';

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
    delete (window as any).CF;
  });

  it('should return CF data when available', () => {
    (window as any).CF = { country: 'CH', city: 'Zurich', timezone: 'Europe/Zurich' };
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
