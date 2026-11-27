import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { apnsConfigFromEnv, apnsJwt, sendApns, type ApnsConfig } from './apns.ts';

async function testConfig(): Promise<{ cfg: ApnsConfig; publicKey: CryptoKey }> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]);
  const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...der))}\n-----END PRIVATE KEY-----`;
  return {
    cfg: { keyP8: pem, keyId: 'KEY1234567', teamId: 'TEAM123456', topic: 'guide.queer.app', host: 'apns.test' },
    publicKey: pair.publicKey,
  };
}

const unb64 = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

Deno.test('jwt verifies with the key and carries kid / iss', async () => {
  const { cfg, publicKey } = await testConfig();
  const [h, p, s] = (await apnsJwt(cfg, 1000)).split('.');
  const ok = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    publicKey,
    unb64(s),
    new TextEncoder().encode(h + '.' + p),
  );
  assertEquals(ok, true);
  assertEquals(JSON.parse(new TextDecoder().decode(unb64(h))), { alg: 'ES256', kid: 'KEY1234567' });
  assertEquals(JSON.parse(new TextDecoder().decode(unb64(p))), { iss: 'TEAM123456', iat: 1000 });
});

Deno.test('config is null until key, key id and team id are all set', () => {
  assertEquals(apnsConfigFromEnv(() => undefined), null);
  const env: Record<string, string> = { APNS_KEY_P8: 'x', APNS_KEY_ID: 'k' };
  assertEquals(apnsConfigFromEnv((k) => env[k]), null);
  env.APNS_TEAM_ID = 't';
  assertEquals(apnsConfigFromEnv((k) => env[k])?.host, 'api.push.apple.com');
});

Deno.test('status mapping: 200 sent, 410 / BadDeviceToken dead, 5xx failed, junk token dead', async () => {
  const { cfg } = await testConfig();
  const token = 'ab'.repeat(32);
  const reply = (status: number, reason?: string) => () =>
    Promise.resolve(new Response(reason ? JSON.stringify({ reason }) : null, { status }));
  const alert = { title: 't', body: 'b' };
  assertEquals(await sendApns(cfg, token, alert, {}, reply(200)), 'sent');
  assertEquals(await sendApns(cfg, token, alert, {}, reply(410, 'Unregistered')), 'dead');
  assertEquals(await sendApns(cfg, token, alert, {}, reply(400, 'BadDeviceToken')), 'dead');
  assertEquals(await sendApns(cfg, token, alert, {}, reply(503, 'ServiceUnavailable')), 'failed');
  let called = false;
  const spy = () => ((called = true), Promise.resolve(new Response(null, { status: 200 })));
  assertEquals(await sendApns(cfg, '{"not":"hex"}', alert, {}, spy), 'dead');
  assertEquals(called, false);
});

Deno.test('custom data rides in `body`, where expo-notifications reads it', async () => {
  const { cfg } = await testConfig();
  let sent: Record<string, unknown> = {};
  const capture = (_u: string | URL | Request, init?: RequestInit) => {
    sent = JSON.parse(String(init?.body));
    return Promise.resolve(new Response(null, { status: 200 }));
  };
  await sendApns(cfg, 'ab'.repeat(32), { title: 't', body: 'b' }, { url: '/help' }, capture);
  assertEquals(sent, { aps: { alert: { title: 't', body: 'b' }, sound: 'default' }, body: { url: '/help' } });
});
