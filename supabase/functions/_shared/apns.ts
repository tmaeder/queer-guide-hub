/**
 * APNs sender for the native iOS app (tokens in user_push_tokens, platform='ios').
 *
 * Secrets (Edge Functions → Secrets):
 *   APNS_KEY_P8   contents of the AuthKey_XXXX.p8 file (PEM, PKCS#8)
 *   APNS_KEY_ID   the 10-char key id
 *   APNS_TEAM_ID  the 10-char Apple team id
 *   APNS_TOPIC    bundle id, default guide.queer.app
 *   APNS_HOST     default api.push.apple.com (TestFlight + App Store);
 *                 api.sandbox.push.apple.com for Xcode dev builds
 * Unset key = configured() is false and the caller skips native delivery.
 */

export interface ApnsConfig {
  keyP8: string;
  keyId: string;
  teamId: string;
  topic: string;
  host: string;
}

export function apnsConfigFromEnv(get: (k: string) => string | undefined): ApnsConfig | null {
  const keyP8 = get('APNS_KEY_P8'),
    keyId = get('APNS_KEY_ID'),
    teamId = get('APNS_TEAM_ID');
  if (!keyP8 || !keyId || !teamId) return null;
  return {
    keyP8,
    keyId,
    teamId,
    topic: get('APNS_TOPIC') || 'guide.queer.app',
    host: get('APNS_HOST') || 'api.push.apple.com',
  };
}

const b64url = (bytes: Uint8Array | string) =>
  btoa(typeof bytes === 'string' ? bytes : String.fromCharCode(...bytes))
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

function pemToDer(pem: string): Uint8Array<ArrayBuffer> {
  const body = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  return Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
}

/** ES256 provider token. WebCrypto already returns the raw r||s form JWT wants. */
export async function apnsJwt(cfg: ApnsConfig, nowSec = Math.floor(Date.now() / 1000)) {
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(cfg.keyP8),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const input =
    b64url(JSON.stringify({ alg: 'ES256', kid: cfg.keyId })) +
    '.' +
    b64url(JSON.stringify({ iss: cfg.teamId, iat: nowSec }));
  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(input)),
  );
  return input + '.' + b64url(sig);
}

// Apple accepts a token for up to an hour and throttles fresh ones; reuse for 50 min.
// ponytail: per-isolate cache; fine at this volume.
let cached: { jwt: string; at: number } | null = null;
async function providerToken(cfg: ApnsConfig) {
  const now = Math.floor(Date.now() / 1000);
  if (!cached || now - cached.at > 3000) cached = { jwt: await apnsJwt(cfg, now), at: now };
  return cached.jwt;
}

export type ApnsResult = 'sent' | 'dead' | 'failed';

/** dead = the token will never deliver again; the caller deletes the row. */
export async function sendApns(
  cfg: ApnsConfig,
  deviceToken: string,
  alert: { title: string; body: string },
  data: Record<string, string>,
  fetcher: typeof fetch = fetch,
): Promise<ApnsResult> {
  if (!/^[0-9a-f]{64,200}$/i.test(deviceToken)) return 'dead';
  const res = await fetcher(`https://${cfg.host}/3/device/${deviceToken}`, {
    method: 'POST',
    headers: {
      authorization: 'bearer ' + (await providerToken(cfg)),
      'apns-topic': cfg.topic,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'content-type': 'application/json',
    },
    // expo-notifications reads a remote notification's data from `body`.
    body: JSON.stringify({ aps: { alert, sound: 'default' }, body: data }),
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 200) {
    await res.body?.cancel();
    return 'sent';
  }
  const reason = ((await res.json().catch(() => ({}))) as { reason?: string }).reason;
  if (res.status === 410 || reason === 'BadDeviceToken' || reason === 'DeviceTokenNotForTopic')
    return 'dead';
  console.error('apns failed', res.status, reason);
  return 'failed';
}
