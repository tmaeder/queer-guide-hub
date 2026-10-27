import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectSecurityHeaders } from './check-security-headers.mjs';

const headers = () =>
  new Headers({
    'Content-Security-Policy':
      "default-src 'none'; manifest-src 'self'; script-src 'self' 'nonce-test'; style-src 'self' 'nonce-test'; style-src-attr 'unsafe-inline'; object-src 'none'; frame-ancestors 'self'",
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
    'X-Content-Type-Options': 'nosniff',
  });

test('accepts the intended deployed policy and discloses the attribute exception', () => {
  assert.deepEqual(inspectSecurityHeaders(headers()).failures, []);
  assert.equal(inspectSecurityHeaders(headers()).inlineStyleAttributesAllowed, true);
});
test('detects the measured Cloudflare six-month override despite correct source settings', () => {
  const h = headers();
  h.set('Strict-Transport-Security', 'max-age=15552000; includeSubDomains; preload');
  assert.match(inspectSecurityHeaders(h).failures.join('\n'), /preload requires/);
});
test('detects a broad default and unsafe stylesheet blocks', () => {
  const h = headers();
  h.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'",
  );
  assert.ok(inspectSecurityHeaders(h).failures.length >= 4);
});
test('fails closed when security headers disappear', () => {
  assert.ok(inspectSecurityHeaders(new Headers()).failures.length >= 8);
});
