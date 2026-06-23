/**
 * Privacy-preserving unavatar.io proxy.
 *
 * POST /avatar/resolve  { source, identifier }
 *   Authorization: Bearer <supabase user JWT>
 *
 * The identifier the user typed goes browser → this worker → unavatar.io.
 * The client never talks to unavatar directly, the stored avatar never
 * hot-links externally (served from R2 at img.queer.guide), and resolution
 * is one-shot — no background refresh, re-import to update.
 */
import { createRemoteJWKSet, jwtVerify } from 'jose';

export interface AvatarEnv {
  IMAGES: R2Bucket;
  SUPABASE_URL?: string;
  /** Public anon key — used for the /auth/v1/user fallback check. */
  SUPABASE_ANON_KEY?: string;
  SUPABASE_JWT_SECRET?: string;
}

// Handle-based sources by default; gravatar (email) is allowed but the
// frontend gates it behind an explicit extra confirm.
const SOURCES = new Set([
  'github',
  'x',
  'twitter',
  'instagram',
  'telegram',
  'gravatar',
  'youtube',
  'twitch',
  'tiktok',
  'soundcloud',
  'reddit',
]);
const MAX_BYTES = 5 * 1024 * 1024;
const PREFIX = 'avatars/unavatar/';

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

async function verifyJwt(token: string, env: AvatarEnv): Promise<string> {
  // 1. JWKS (asymmetric signing) — free, no secrets in the worker.
  if (env.SUPABASE_URL) {
    try {
      jwks ??= createRemoteJWKSet(
        new URL(`${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/.well-known/jwks.json`),
      );
      const { payload } = await jwtVerify(token, jwks, { algorithms: ['ES256', 'RS256'] });
      if (typeof payload.sub === 'string') return payload.sub;
    } catch {
      // fall through — project may still be on HS256
    }
  }

  // 2. HS256 secret, if configured.
  if (env.SUPABASE_JWT_SECRET) {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(env.SUPABASE_JWT_SECRET),
      { algorithms: ['HS256'] },
    );
    if (typeof payload.sub !== 'string') throw new Error('token missing sub');
    return payload.sub;
  }

  // 3. Ask Supabase auth directly (public anon key, no signing secret needed).
  //    Resolves are rare one-shot actions, so the extra round-trip is fine.
  if (env.SUPABASE_URL && env.SUPABASE_ANON_KEY) {
    const res = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/user`, {
      headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const user = (await res.json()) as { id?: string };
      if (typeof user.id === 'string') return user.id;
    }
    throw new Error('invalid token');
  }

  throw new Error('verifier not configured');
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

export async function handleAvatarResolve(
  req: Request,
  env: AvatarEnv,
  cors: Record<string, string>,
): Promise<Response> {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });

  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'unauthorized' }, 401);
  let sub: string;
  try {
    sub = await verifyJwt(token, env);
  } catch {
    return json({ error: 'unauthorized' }, 401);
  }

  let body: { source?: string; identifier?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid json' }, 400);
  }

  const source = (body.source || '').toLowerCase().trim();
  const identifier = (body.identifier || '').trim();
  if (!SOURCES.has(source)) return json({ error: 'unsupported source' }, 400);
  if (!identifier || identifier.length > 320 || /[\s/\\?#]/.test(identifier)) {
    return json({ error: 'invalid identifier' }, 400);
  }

  const key = `${PREFIX}${await sha256Hex(`${sub}|${source}|${identifier}`)}`;

  // Already resolved for this user+identifier → serve cache, skip upstream.
  const cached = await env.IMAGES.head(key);
  if (cached) {
    return json({ url: `https://img.queer.guide/${key}`, cached: true });
  }

  let upstream: Response;
  try {
    upstream = await fetch(
      `https://unavatar.io/${source}/${encodeURIComponent(identifier)}?fallback=false`,
      {
        headers: { 'User-Agent': 'QueerGuide-AvatarProxy/1.0' },
        signal: AbortSignal.timeout(10000),
      },
    );
  } catch {
    return json({ error: 'upstream timeout' }, 504);
  }

  if (upstream.status === 404) return json({ error: 'not found' }, 404);
  if (!upstream.ok) return json({ error: 'upstream error', upstream_status: upstream.status }, 502);

  const ct = (upstream.headers.get('Content-Type') || '').split(';')[0].trim();
  if (!EXT[ct]) return json({ error: 'not an image' }, 422);

  const bytes = await upstream.arrayBuffer();
  if (bytes.byteLength < 100) return json({ error: 'not found' }, 404);
  if (bytes.byteLength > MAX_BYTES) return json({ error: 'image too large' }, 422);

  await env.IMAGES.put(key, bytes, { httpMetadata: { contentType: ct } });

  return json({ url: `https://img.queer.guide/${key}`, cached: false });
}
