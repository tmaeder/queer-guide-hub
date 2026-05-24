// Tests for `functions/_lib/securityHeaders.ts`. Lives under src/ so
// it is picked up by the project's vitest include glob — see vite.config.ts.
import { describe, it, expect } from 'vitest';
import {
  applySecurityHeaders,
  buildContentSecurityPolicy,
  generateCspNonce,
  STATIC_SECURITY_HEADERS,
} from '../../../functions/_lib/securityHeaders';

describe('generateCspNonce', () => {
  it('returns a non-empty base64url string', () => {
    const n = generateCspNonce();
    expect(n).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(n.length).toBeGreaterThanOrEqual(16);
  });

  it('produces a different value on each call', () => {
    const a = generateCspNonce();
    const b = generateCspNonce();
    expect(a).not.toBe(b);
  });
});

describe('buildContentSecurityPolicy', () => {
  it('embeds the supplied nonce in script-src', () => {
    const csp = buildContentSecurityPolicy('abc123');
    expect(csp).toContain("'nonce-abc123'");
    expect(csp).toContain('script-src');
  });

  it('does NOT allow unsafe-inline on script-src', () => {
    const csp = buildContentSecurityPolicy('x');
    const scriptDirective = csp.split(';').find((d) => d.trim().startsWith('script-src'));
    expect(scriptDirective).toBeDefined();
    expect(scriptDirective).not.toContain("'unsafe-inline'");
  });

  it('does not allow-list the removed third-party trackers', () => {
    const csp = buildContentSecurityPolicy('x');
    expect(csp).not.toMatch(/clarity\.ms/);
    expect(csp).not.toMatch(/googletagmanager\.com/);
    expect(csp).not.toMatch(/google-analytics\.com/);
    expect(csp).not.toMatch(/ipapi\.co/);
  });

  it('keeps the required first-party / payment / map allow-list', () => {
    const csp = buildContentSecurityPolicy('x');
    expect(csp).toContain('https://*.supabase.co');
    expect(csp).toContain('https://js.stripe.com');
    expect(csp).toContain('https://maps.googleapis.com');
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).toContain("object-src 'none'");
  });

  it("allow-lists Cloudflare's bot-management inline-script hashes", () => {
    const csp = buildContentSecurityPolicy('x');
    expect(csp).toContain("'sha256-xN+1I4nJkqNT1TN3imzsKuRrdUJwqycndmk/7+tjN0w='");
    expect(csp).toContain("'sha256-gpv3+1ui2RRNM14g5v6XIjymGrMZxrbVxUzdTeKXUlE='");
  });
});

describe('applySecurityHeaders', () => {
  it('sets every static header plus CSP on the response', () => {
    const res = new Response('ok', { status: 404 });
    applySecurityHeaders(res, 'noncetest');

    for (const [k, v] of Object.entries(STATIC_SECURITY_HEADERS)) {
      expect(res.headers.get(k)).toBe(v);
    }
    expect(res.headers.get('Content-Security-Policy')).toContain("'nonce-noncetest'");
  });

  it('does NOT add the deprecated X-XSS-Protection header', () => {
    const res = new Response('ok');
    applySecurityHeaders(res, 'n');
    expect(res.headers.get('X-XSS-Protection')).toBeNull();
  });

  it('HSTS max-age is at least one year (preload-list minimum)', () => {
    const res = new Response('ok');
    applySecurityHeaders(res, 'n');
    const hsts = res.headers.get('Strict-Transport-Security') ?? '';
    const m = hsts.match(/max-age=(\d+)/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(31536000);
  });
});
