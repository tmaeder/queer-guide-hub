#!/usr/bin/env node
// Check the public response, including Cloudflare zone overrides. Source-only
// checks cannot detect a zone replacing our two-year HSTS with six months.
import { pathToFileURL } from 'node:url';

export function inspectSecurityHeaders(headers) {
  const failures = [];
  const csp = new Map(
    (headers.get('content-security-policy') ?? '').split(';').map((part) => {
      const [name, ...values] = part.trim().split(/\s+/);
      return [name, values];
    }),
  );
  const has = (directive, source) => csp.get(directive)?.includes(source);
  if (csp.get('default-src')?.join(' ') !== "'none'")
    failures.push("CSP default-src must be 'none'");
  if (!has('manifest-src', "'self'")) failures.push('CSP must explicitly allow the PWA manifest');
  for (const directive of ['script-src', 'style-src']) {
    if (!csp.has(directive)) failures.push(`CSP ${directive} is missing`);
    if (has(directive, "'unsafe-inline'") || has(directive, "'unsafe-eval'")) {
      failures.push(`CSP ${directive} permits unsafe inline blocks or eval`);
    }
  }
  if (!has('object-src', "'none'")) failures.push("CSP object-src must be 'none'");
  if (!csp.has('frame-ancestors')) failures.push('CSP clickjacking protection is missing');
  const hsts = headers.get('strict-transport-security') ?? '';
  const maxAge = Number(hsts.match(/(?:^|;)\s*max-age=(\d+)(?:;|$)/i)?.[1] ?? 0);
  if (maxAge < 31536000)
    failures.push(`HSTS max-age=${maxAge}; preload requires at least 31536000`);
  if (!/(?:^|;)\s*includeSubDomains\s*(?:;|$)/i.test(hsts))
    failures.push('HSTS includeSubDomains is missing');
  if (!/(?:^|;)\s*preload\s*(?:;|$)/i.test(hsts))
    failures.push('HSTS preload directive is missing');
  if (headers.get('x-content-type-options')?.toLowerCase() !== 'nosniff') {
    failures.push('X-Content-Type-Options must be nosniff');
  }
  return {
    failures,
    // An explicit, documented compatibility exception, not a fixed finding.
    inlineStyleAttributesAllowed:
      has('style-src-attr', "'unsafe-inline'") || has('style-src', "'unsafe-inline'"),
    hsts,
  };
}

async function main() {
  const origin = new URL(process.argv[2] ?? 'https://queer.guide').origin;
  let failed = false;
  for (const path of ['/', '/docs', '/security-audit-missing-page', '/build-id.txt']) {
    const url = new URL(path, origin);
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
    const result = inspectSecurityHeaders(response.headers);
    const expectedStatus = path === '/security-audit-missing-page' ? 404 : 200;
    if (response.status !== expectedStatus)
      result.failures.push(`Expected HTTP ${expectedStatus}, got ${response.status}`);
    await response.body?.cancel();
    failed ||= result.failures.length > 0;
    console.log(JSON.stringify({ url: url.href, status: response.status, ...result }));
  }
  if (origin.startsWith('https://')) {
    const url = new URL(origin);
    url.protocol = 'http:';
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
    const location = response.headers.get('location');
    const valid = [301, 302, 307, 308].includes(response.status) && location === `${origin}/`;
    await response.body?.cancel();
    console.log(
      JSON.stringify({ url: url.href, status: response.status, location, httpsRedirect: valid }),
    );
    failed ||= !valid;
  }
  process.exitCode = failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
