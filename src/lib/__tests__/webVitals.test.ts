import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Metric } from 'web-vitals';

const handlers: Record<string, (m: Metric) => void> = {};
vi.mock('web-vitals', () => ({
  onLCP: (cb: (m: Metric) => void) => (handlers.LCP = cb),
  onINP: (cb: (m: Metric) => void) => (handlers.INP = cb),
  onCLS: (cb: (m: Metric) => void) => (handlers.CLS = cb),
  onTTFB: (cb: (m: Metric) => void) => (handlers.TTFB = cb),
}));
const track = vi.fn();
vi.mock('@/utils/consentedAnalytics', () => ({ trackConsentedEvent: track }));
vi.mock('@/utils/autoFileError', () => ({
  routeTemplate: (p: string) => (p === '/de/venues/tramp-s' ? '/:locale/venues/:slug' : p),
}));

const metric = (name: Metric['name'], value: number): Metric =>
  ({
    name,
    value,
    rating: 'good',
    navigationType: 'navigate',
    delta: value,
    id: 'x',
    entries: [],
  }) as unknown as Metric;

describe('webVitals', () => {
  beforeEach(() => track.mockReset());

  it('classifies devices by viewport width', async () => {
    const { deviceClass } = await import('../webVitals');
    expect(deviceClass(390)).toBe('mobile');
    expect(deviceClass(800)).toBe('tablet');
    expect(deviceClass(1440)).toBe('desktop');
  });

  it('reports all four metrics through the consent-gated tracker with route template + device', async () => {
    window.history.pushState({}, '', '/de/venues/tramp-s');
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
    const { installWebVitals } = await import('../webVitals');
    installWebVitals();
    expect(Object.keys(handlers).sort()).toEqual(['CLS', 'INP', 'LCP', 'TTFB']);

    handlers.LCP(metric('LCP', 2412.7));
    handlers.CLS(metric('CLS', 0.04567));
    expect(track).toHaveBeenNthCalledWith(1, 'web_vital', {
      metric: 'LCP',
      value: '2413',
      rating: 'good',
      route: '/:locale/venues/:slug',
      device: 'mobile',
      nav: 'navigate',
    });
    expect(track.mock.calls[1][1]).toMatchObject({ metric: 'CLS', value: '0.046' });
  });
});
