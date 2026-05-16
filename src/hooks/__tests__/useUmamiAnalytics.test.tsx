/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: invokeMock } },
}));

import { useUmamiAnalytics } from '../useUmamiAnalytics';

let originalUA: PropertyDescriptor | undefined;

function stubUA(ua: string) {
  originalUA = Object.getOwnPropertyDescriptor(navigator, 'userAgent');
  Object.defineProperty(navigator, 'userAgent', {
    configurable: true,
    get: () => ua,
  });
}

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockResolvedValue({ data: null, error: null });
});

afterEach(() => {
  if (originalUA) {
    Object.defineProperty(navigator, 'userAgent', originalUA);
    originalUA = undefined;
  }
});

describe('useUmamiAnalytics — trackEvent', () => {
  it('invokes umami-analytics edge with full payload', async () => {
    stubUA('Mozilla/5.0 (X11; Linux x86_64) Chrome/120');

    const { result } = renderHook(() => useUmamiAnalytics());
    await result.current.trackEvent({
      name: 'click_signup',
      data: { source: 'hero' },
      url: '/home',
      title: 'Home',
    });

    expect(invokeMock).toHaveBeenCalledWith(
      'umami-analytics',
      expect.objectContaining({
        body: expect.objectContaining({
          name: 'click_signup',
          data: { source: 'hero' },
          url: '/home',
          title: 'Home',
          browser: 'Chrome',
          os: 'Linux',
          device: 'desktop',
        }),
      }),
    );
  });

  it('detects mobile device + iOS from user agent', async () => {
    stubUA(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile Safari',
    );

    const { result } = renderHook(() => useUmamiAnalytics());
    await result.current.trackEvent({ name: 'tap' });

    const [, opts] = invokeMock.mock.calls[0];
    expect(opts.body.device).toBe('mobile');
    expect(opts.body.browser).toBe('Safari');
  });

  it('defaults url + title to window/document when not provided', async () => {
    stubUA('Mozilla/5.0 Firefox/120 Windows');
    document.title = 'Custom Title';

    const { result } = renderHook(() => useUmamiAnalytics());
    await result.current.trackEvent({ name: 'view' });

    const [, opts] = invokeMock.mock.calls[0];
    // jsdom default location pathname is '/', search ''.
    expect(typeof opts.body.url).toBe('string');
    expect(opts.body.title).toBe('Custom Title');
    expect(opts.body.browser).toBe('Firefox');
    expect(opts.body.os).toBe('Windows');
  });

  it('swallows edge errors silently', async () => {
    invokeMock.mockResolvedValueOnce({ data: null, error: { message: 'down' } });
    stubUA('Chrome');

    const { result } = renderHook(() => useUmamiAnalytics());
    await expect(result.current.trackEvent({ name: 'x' })).resolves.toBeUndefined();
  });

  it('swallows thrown errors silently', async () => {
    invokeMock.mockRejectedValueOnce(new Error('network'));
    stubUA('Chrome');

    const { result } = renderHook(() => useUmamiAnalytics());
    await expect(result.current.trackEvent({ name: 'x' })).resolves.toBeUndefined();
  });
});

describe('useUmamiAnalytics — trackPageView', () => {
  it('invokes umami-analytics with the same browser context payload (no name field)', async () => {
    stubUA('Mozilla/5.0 Edge/120 Mac');

    const { result } = renderHook(() => useUmamiAnalytics());
    await result.current.trackPageView('/about', 'About');

    const [, opts] = invokeMock.mock.calls[0];
    expect(opts.body.name).toBeUndefined();
    expect(opts.body.url).toBe('/about');
    expect(opts.body.title).toBe('About');
    expect(opts.body.browser).toBe('Edge');
    expect(opts.body.os).toBe('macOS');
  });
});
