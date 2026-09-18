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

  it('does NOT hash-allow-list the GTM bootstrap stubs', () => {
    // Earlier these hashes were added thinking they came from CF's bot
    // management. They are actually the inline stubs that load Google
    // Tag Manager + Microsoft Clarity. Allowing them re-enables the
    // analytics chain the project intentionally turned off (see comment
    // at top of securityHeaders.ts). Keep them blocked.
    const csp = buildContentSecurityPolicy('x');
    expect(csp).not.toContain('sha256-xN+1I4nJkqNT1TN3imzsKuRrdUJwqycndmk');
    expect(csp).not.toContain('sha256-gpv3+1ui2RRNM14g5v6XIjymGrMZxrbVxUzdTeKXUlE');
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

describe('media-src — podcast audio', () => {
  // WHY THIS EXISTS. Without a media-src directive the browser falls back to
  // `default-src 'self'` and refuses EVERY podcast episode, because episodes
  // are hosted on each show's own CDN and never on ours. Measured on prod:
  // `MEDIA_ELEMENT_ERROR: Media load rejected by URL safety check`, element
  // stuck at readyState 0 / networkState 3, while the player UI rendered
  // correctly and curl fetched the same URL happily — the server was never
  // the thing under test.
  const csp = buildContentSecurityPolicy('n0nce');

  function directive(name: string): string {
    const found = csp
      .split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith(`${name} `));
    if (!found) throw new Error(`no ${name} directive in CSP`);
    return found;
  }

  it('is present at all — absence silently inherits default-src', () => {
    expect(csp).toMatch(/(^|;\s*)media-src\s/);
  });

  it('allows any https host, because a podcast prefix redirects across domains', () => {
    // CSP re-checks media at EVERY hop. One measured episode spanned five
    // hosts (podtrac → pdst.fm → mgln.ai → pscrb.fm → traffic.megaphone.fm),
    // so a host allowlist kills episodes whenever a prefix changes.
    expect(directive('media-src')).toContain('https:');
  });

  it('does NOT allow plain http — upgrade-insecure-requests covers those rows', () => {
    const media = directive('media-src');
    expect(media).not.toMatch(/(^|\s)http:(\s|$)/);
    expect(csp).toContain('upgrade-insecure-requests');
  });

  it('keeps the static _headers fallback in step with the generated CSP', async () => {
    // public/_headers serves when Functions are quota-dead or unrouted. If the
    // two disagree, podcast audio works only while Functions are executing —
    // a failure mode that appears to be intermittent rather than structural.
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const headers = readFileSync(join(__dirname, '../../../public/_headers'), 'utf8');
    expect(headers).toMatch(/media-src[^;]*https:/);
  });
});
