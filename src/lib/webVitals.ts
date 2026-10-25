/**
 * Real-user Core Web Vitals (field data). Lighthouse CI is lab-only; this is
 * the source of truth for LCP / INP / CLS / TTFB.
 *
 * Sent as one `web_vital` event per metric through `trackConsentedEvent`, the
 * existing consent-gated first-party path — no second tracker. Without
 * analytics consent (or with DNT / automation) nothing is sent.
 *
 * `route` is the template of the page the document LOADED on. LCP and TTFB
 * belong to that load, and CLS / INP accumulate over the document's life, so
 * attributing all four to the landing route keeps one consistent key.
 */
import { onCLS, onINP, onLCP, onTTFB, type Metric } from 'web-vitals';
import { trackConsentedEvent } from '@/utils/consentedAnalytics';
import { routeTemplate } from '@/utils/autoFileError';

export function deviceClass(width: number): 'mobile' | 'tablet' | 'desktop' {
  if (width < 768) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
}

export function vitalPayload(
  metric: Metric,
  route: string,
  device: string,
): Record<string, string> {
  // CLS is unitless (keep 3 decimals); the rest are milliseconds.
  const value = metric.name === 'CLS' ? metric.value.toFixed(3) : String(Math.round(metric.value));
  return {
    metric: metric.name,
    value,
    rating: metric.rating,
    route,
    device,
    nav: metric.navigationType,
  };
}

let installed = false;

export function installWebVitals(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const route = routeTemplate(window.location.pathname);
  const device = deviceClass(window.innerWidth);
  const report = (metric: Metric) =>
    trackConsentedEvent('web_vital', vitalPayload(metric, route, device));
  onLCP(report);
  onINP(report);
  onCLS(report);
  onTTFB(report);
}
