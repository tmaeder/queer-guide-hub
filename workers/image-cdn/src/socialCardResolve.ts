/**
 * Privacy-safe social-card resolver.
 *
 * POST /social/resolve  { platform, handle, profile_url }
 *   X-Admin-Secret: <ADMIN_SECRET>   (called server-side by social-card-refresh)
 *
 * Fetches a public social profile's display name / avatar / follower count via
 * clean public endpoints (best-effort; locked-down platforms fall back), mirrors
 * the avatar to R2 so the browser never contacts the source platform, and returns
 * a normalized card payload the edge function persists into social_profiles.
 *
 * No third-party scripts, no iframes, no viewer tracking — the whole point.
 */

export interface SocialEnv {
  IMAGES: R2Bucket;
  ADMIN_SECRET?: string;
}

export interface SocialCard {
  status: 'resolved' | 'fallback';
  platform: string;
  handle: string;
  profile_url: string | null;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  follower_count: number | null;
  last_items: unknown[];
}

// Strip HTML tags robustly: loop until stable (so interleaved/nested tags like
// `<scr<script>ipt>` can't reassemble into a live tag after one pass), then drop
// any stray angle brackets that remain.
function stripHtml(input: string): string {
  let prev: string;
  let out = input;
  do {
    prev = out;
    out = out.replace(/<[^>]*>/g, '');
  } while (out !== prev);
  return out.replace(/[<>]/g, '');
}

const MAX_BYTES = 4 * 1024 * 1024;
const PREFIX = 'social-cards/';
const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Fetch a remote image and mirror it to R2; returns the img.queer.guide URL or null. */
async function mirrorImage(env: SocialEnv, platform: string, src: string): Promise<string | null> {
  let upstream: Response;
  try {
    upstream = await fetch(src, {
      headers: { 'User-Agent': 'QueerGuide-SocialCard/1.0' },
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    return null;
  }
  if (!upstream.ok) return null;
  const ct = (upstream.headers.get('Content-Type') || '').split(';')[0].trim();
  if (!EXT[ct]) return null;
  const bytes = await upstream.arrayBuffer();
  if (bytes.byteLength < 100 || bytes.byteLength > MAX_BYTES) return null;
  const key = `${PREFIX}${platform}/${(await sha256Hex(src)).slice(0, 24)}.${EXT[ct]}`;
  const existing = await env.IMAGES.head(key);
  if (!existing) await env.IMAGES.put(key, bytes, { httpMetadata: { contentType: ct } });
  return `https://img.queer.guide/${key}`;
}

// ---- Per-platform resolvers (return partial card or null for fallback) ----

async function resolveBluesky(handle: string): Promise<Partial<SocialCard> | null> {
  const actor = handle.replace(/^@/, '');
  const res = await fetch(
    `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(actor)}`,
    { signal: AbortSignal.timeout(8000) },
  ).catch(() => null);
  if (!res || !res.ok) return null;
  const p = (await res.json()) as {
    displayName?: string; description?: string; avatar?: string; followersCount?: number;
  };
  return {
    display_name: p.displayName ?? null,
    bio: p.description ?? null,
    avatar_url: p.avatar ?? null,
    follower_count: typeof p.followersCount === 'number' ? p.followersCount : null,
  };
}

async function resolveMastodon(handle: string): Promise<Partial<SocialCard> | null> {
  // handle is "user@host"
  const m = handle.match(/^@?([^@]+)@([a-z0-9.-]+)$/i);
  if (!m) return null;
  const [, user, host] = m;
  const res = await fetch(
    `https://${host}/api/v1/accounts/lookup?acct=${encodeURIComponent(user)}`,
    { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) },
  ).catch(() => null);
  if (!res || !res.ok) return null;
  const a = (await res.json()) as {
    display_name?: string; note?: string; avatar?: string; followers_count?: number;
  };
  return {
    display_name: a.display_name || null,
    bio: a.note ? stripHtml(a.note).trim() : null,
    avatar_url: a.avatar ?? null,
    follower_count: typeof a.followers_count === 'number' ? a.followers_count : null,
  };
}

async function resolveOEmbed(endpoint: string, profileUrl: string): Promise<Partial<SocialCard> | null> {
  const res = await fetch(
    `${endpoint}?url=${encodeURIComponent(profileUrl)}&format=json`,
    { signal: AbortSignal.timeout(8000) },
  ).catch(() => null);
  if (!res || !res.ok) return null;
  const o = (await res.json()) as { title?: string; author_name?: string; thumbnail_url?: string };
  return {
    display_name: o.title || o.author_name || null,
    avatar_url: o.thumbnail_url ?? null,
    bio: null,
    follower_count: null,
  };
}

async function resolveRich(
  platform: string,
  handle: string,
  profileUrl: string | null,
): Promise<Partial<SocialCard> | null> {
  switch (platform) {
    case 'bluesky':
      return resolveBluesky(handle);
    case 'mastodon':
      return resolveMastodon(handle);
    case 'spotify':
      return profileUrl ? resolveOEmbed('https://open.spotify.com/oembed', profileUrl) : null;
    case 'soundcloud':
      return profileUrl ? resolveOEmbed('https://soundcloud.com/oembed', profileUrl) : null;
    default:
      return null; // Instagram / TikTok / X / OnlyFans / … → graceful fallback
  }
}

export async function handleSocialResolve(
  req: Request,
  env: SocialEnv,
  cors: Record<string, string>,
): Promise<Response> {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  const secret = env.ADMIN_SECRET;
  const provided = req.headers.get('X-Admin-Secret') || req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!secret || provided !== secret) return json({ error: 'unauthorized' }, 401);

  let body: { platform?: string; handle?: string; profile_url?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid json' }, 400);
  }
  const platform = (body.platform || '').toLowerCase().trim();
  const handle = (body.handle || '').trim();
  const profileUrl = body.profile_url?.trim() || null;
  if (!platform || !handle) return json({ error: 'platform and handle required' }, 400);

  const rich = await resolveRich(platform, handle, profileUrl);
  let avatarUrl: string | null = null;
  if (rich?.avatar_url) avatarUrl = await mirrorImage(env, platform, rich.avatar_url);

  const card: SocialCard = {
    status: rich ? 'resolved' : 'fallback',
    platform,
    handle,
    profile_url: profileUrl,
    display_name: rich?.display_name ?? null,
    bio: rich?.bio ?? null,
    avatar_url: avatarUrl,
    follower_count: rich?.follower_count ?? null,
    last_items: rich?.last_items ?? [],
  };
  return json(card);
}
