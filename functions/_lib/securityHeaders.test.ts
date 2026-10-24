import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CSP_REPORT_GROUP,
  CSP_REPORT_PATH,
  STATIC_SECURITY_HEADERS,
  applySecurityHeaders,
  buildContentSecurityPolicy,
} from './securityHeaders';

const directives = (csp: string) =>
  new Map(
    csp
      .split(';')
      .map((d) => d.trim().split(/\s+/))
      .map(([k, ...v]) => [k, v.join(' ')]),
  );

describe('security headers', () => {
  it('reports CSP violations via report-uri and report-to, backed by Reporting-Endpoints', () => {
    const csp = directives(buildContentSecurityPolicy('abc'));
    expect(csp.get('report-uri')).toBe(CSP_REPORT_PATH);
    expect(csp.get('report-to')).toBe(CSP_REPORT_GROUP);
    expect(STATIC_SECURITY_HEADERS['Reporting-Endpoints']).toBe(
      `${CSP_REPORT_GROUP}="${CSP_REPORT_PATH}"`,
    );
  });

  it('frame-ancestors and X-Frame-Options agree on same-origin (CMS live preview iframes our pages)', () => {
    expect(directives(buildContentSecurityPolicy('abc')).get('frame-ancestors')).toBe("'self'");
    expect(STATIC_SECURITY_HEADERS['X-Frame-Options']).toBe('SAMEORIGIN');
  });

  it('applies the nonce and reporting headers to a response', () => {
    const res = new Response('x');
    applySecurityHeaders(res, 'n0nce');
    expect(res.headers.get('Content-Security-Policy')).toContain("'nonce-n0nce'");
    expect(res.headers.get('Reporting-Endpoints')).toBe(`${CSP_REPORT_GROUP}="${CSP_REPORT_PATH}"`);
  });

  it('static public/_headers fallback carries the same reporting + framing policy', () => {
    const file = readFileSync(resolve(process.cwd(), 'public/_headers'), 'utf8');
    const csp = file.match(/^ {2}Content-Security-Policy: (.+)$/m)?.[1] ?? '';
    const d = directives(csp);
    expect(d.get('report-uri')).toBe(CSP_REPORT_PATH);
    expect(d.get('report-to')).toBe(CSP_REPORT_GROUP);
    expect(d.get('frame-ancestors')).toBe("'self'");
    expect(file).toMatch(/^ {2}X-Frame-Options: SAMEORIGIN$/m);
    expect(file).toContain(`  Reporting-Endpoints: ${CSP_REPORT_GROUP}="${CSP_REPORT_PATH}"`);
  });
});
