import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { proxySecretOk } from './track-proxy-secret.ts';

/**
 * The DIRECTION of this gate is the whole risk, so both directions are pinned.
 * Inert while unconfigured (otherwise the two-system rollout window 403s every
 * real visitor and reads on the dashboards as a traffic collapse), strict once
 * configured (otherwise the secret buys nothing).
 */

function req(headers: Record<string, string> = {}) {
  return new Request('https://example.test/', { method: 'POST', headers });
}

function withSecret(value: string, fn: () => void) {
  const previous = Deno.env.get('TRACK_PROXY_SECRET');
  Deno.env.set('TRACK_PROXY_SECRET', value);
  try {
    fn();
  } finally {
    // Deno runs every test file in one process and env leaks across them.
    if (previous === undefined) Deno.env.delete('TRACK_PROXY_SECRET');
    else Deno.env.set('TRACK_PROXY_SECRET', previous);
  }
}

Deno.test('accepts everything while the secret is unconfigured', () => {
  Deno.env.delete('TRACK_PROXY_SECRET');
  assertEquals(proxySecretOk(req()), true);
  assertEquals(proxySecretOk(req({ 'x-qg-track-key': 'anything' })), true);
});

Deno.test('accepts only the matching key once the secret is configured', () => {
  withSecret('s3cret', () => {
    assertEquals(proxySecretOk(req({ 'x-qg-track-key': 's3cret' })), true);
    assertEquals(proxySecretOk(req({ 'x-qg-track-key': 'wrong' })), false);
    assertEquals(proxySecretOk(req()), false);
  });
});

Deno.test('an empty-string secret is unconfigured, not a key to match', () => {
  withSecret('', () => {
    assertEquals(proxySecretOk(req()), true);
  });
});
