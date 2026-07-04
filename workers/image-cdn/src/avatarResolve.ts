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
import * as jose from 'jose';
import { createSupabaseJwtVerifier } from '../../_shared/supabase-jwt-jose';

const verifySupabaseJwt = createSupabaseJwtVerifier(jose);

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
    sub = (
      await verifySupabaseJwt(token, {
        supabaseUrl: env.SUPABASE_URL,
        jwtSecret: env.SUPABASE_JWT_SECRET,
        authApiKey: env.SUPABASE_ANON_KEY,
      })
    ).sub;
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
