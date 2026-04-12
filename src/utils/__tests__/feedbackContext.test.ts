import { describe, it, expect, vi, beforeEach } from 'vitest';
import { captureContext } from '../feedbackContext';

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
