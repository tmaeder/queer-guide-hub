/**
 * Minimal JWT implementation using Web Crypto API (available in Workers).
 * Replaces Supabase Auth JWT handling.
 */

export interface JwtPayload {
  /** User ID */
  sub: string;
  /** Email */
  email: string;
  /** Issued at (seconds) */
  iat: number;
  /** Expires at (seconds) */
  exp: number;
}

const encoder = new TextEncoder();

async function getKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

function base64UrlEncode(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(s: string): Uint8Array {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function signToken(payload: JwtPayload, secret: string): Promise<string> {
  const header = base64UrlEncode(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const data = `${header}.${body}`;

  const key = await getKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data));

  return `${data}.${base64UrlEncode(sig)}`;
}

export async function verifyToken(token: string, secret: string): Promise<JwtPayload | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [header, body, sig] = parts;
  const data = `${header}.${body}`;

  try {
    const key = await getKey(secret);
    const sigBytes = base64UrlDecode(sig);
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(data));
    if (!valid) return null;

    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(body))) as JwtPayload;

    // Check expiry
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

/** Create access + refresh token pair */
export async function createTokenPair(
  userId: string,
  email: string,
  secret: string,
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = 3600; // 1 hour

  const accessToken = await signToken(
    { sub: userId, email, iat: now, exp: now + expiresIn },
    secret,
  );

  // Refresh token lasts 30 days
  const refreshToken = await signToken(
    { sub: userId, email, iat: now, exp: now + 30 * 24 * 3600 },
    secret,
  );

  return { accessToken, refreshToken, expiresIn };
}
