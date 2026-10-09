import { afterEach, describe, it, expect, vi } from 'vitest';
import { captureContext, captureScreenshot } from '../feedbackContext';

const toJpeg = vi.hoisted(() => vi.fn());

vi.mock('html-to-image', () => ({ toJpeg }));

afterEach(() => {
  vi.unstubAllGlobals();
  toJpeg.mockReset();
});

describe('captureContext', () => {
  it('should return current URL', () => {
    const ctx = captureContext();
    expect(ctx.url).toBe(window.location.href);
  });

  it('should return viewport dimensions', () => {
    const ctx = captureContext();
    expect(ctx.viewport.width).toBe(window.innerWidth);
    expect(ctx.viewport.height).toBe(window.innerHeight);
  });

  it('should return user agent string', () => {
    const ctx = captureContext();
    expect(ctx.user_agent).toBe(navigator.userAgent);
  });

  it('should return color scheme', () => {
    const ctx = captureContext();
    expect(['light', 'dark']).toContain(ctx.color_scheme);
  });

  it('should return ISO timestamp', () => {
    const ctx = captureContext();
    expect(new Date(ctx.timestamp).toISOString()).toBe(ctx.timestamp);
  });

  it('should return errors as array', () => {
    const ctx = captureContext();
    expect(Array.isArray(ctx.errors)).toBe(true);
  });

  it('should return network_failures as array', () => {
    const ctx = captureContext();
    expect(Array.isArray(ctx.network_failures)).toBe(true);
  });
});

describe('captureScreenshot', () => {
  it('retries without remote media when the full page capture fails', async () => {
    const screenshot = new Blob(['screenshot'], { type: 'image/jpeg' });
    toJpeg.mockRejectedValueOnce(new Error('cross-origin image')).mockResolvedValueOnce('data:ok');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ blob: () => Promise.resolve(screenshot) }));

    await expect(captureScreenshot()).resolves.toBe(screenshot);
    expect(toJpeg).toHaveBeenCalledTimes(2);

    const fallback = toJpeg.mock.calls[1]?.[1];
    expect(fallback.imagePlaceholder).toMatch(/^data:image\/gif;base64,/);
    expect(fallback.skipFonts).toBe(true);
    expect(fallback.filter(document.createElement('img'))).toBe(false);
    expect(fallback.filter(document.createElement('div'))).toBe(true);
  });
});
