/**
 * Shared social-platform registry — single source of truth for platform
 * detection, handle normalization, and profile-URL building.
 *
 * Pure data + functions only (NO React imports) so the Deno twin at
 * supabase/functions/_shared/social.ts can mirror it verbatim. Icons are
 * mapped separately in src/lib/social/icons.tsx.
 *
 * Storage convention (matches personalities/profiles): social_links is a
 * jsonb map of platformKey -> full profile URL.
 */

export type SocialPlatformKey =
  | 'instagram'
  | 'facebook'
  | 'twitter'
  | 'tiktok'
  | 'youtube'
  | 'linkedin'
  | 'threads'
  | 'bluesky'
  | 'mastodon'
  | 'telegram'
  | 'github'
  | 'reddit'
  | 'twitch'
  | 'spotify'
  | 'soundcloud'
  | 'pinterest'
  | 'snapchat'
  | 'discord'
  | 'medium'
  | 'patreon'
  | 'website';

export interface PlatformDef {
  key: SocialPlatformKey;
  label: string;
  /** Detects the platform from a full URL; capture group 1 is the handle when present. */
  detect: RegExp;
  /** Builds a canonical profile URL from a bare handle (no leading @). */
  build: (handle: string) => string;
}

/**
 * Ordered most-specific first; `website` is the catch-all and MUST stay last.
 * Mastodon is intentionally placed late — its host is dynamic, so it only
 * matches the `https://host/@user` shape after every fixed-host platform.
 */
export const PLATFORMS: PlatformDef[] = [
  {
    key: 'instagram',
    label: 'Instagram',
    detect: /^https?:\/\/(?:www\.)?instagram\.com\/([a-z0-9._]{1,30})\/?/i,
    build: (h) => `https://instagram.com/${h}`,
  },
  {
    key: 'tiktok',
    label: 'TikTok',
    detect: /^https?:\/\/(?:www\.)?tiktok\.com\/@([a-z0-9._]{2,24})\/?/i,
    build: (h) => `https://tiktok.com/@${h.replace(/^@/, '')}`,
  },
  {
    key: 'youtube',
    label: 'YouTube',
    detect: /^https?:\/\/(?:www\.)?youtube\.com\/(@[a-z0-9._-]{3,30}|channel\/[a-z0-9_-]+|c\/[a-z0-9._-]+|user\/[a-z0-9._-]+)\/?/i,
    build: (h) => `https://youtube.com/${h.startsWith('@') || h.includes('/') ? h : '@' + h}`,
  },
  {
    key: 'facebook',
    label: 'Facebook',
    detect: /^https?:\/\/(?:www\.|m\.|web\.)?facebook\.com\/([a-z0-9.]{2,})\/?/i,
    build: (h) => `https://facebook.com/${h}`,
  },
  {
    key: 'twitter',
    label: 'X',
    detect: /^https?:\/\/(?:www\.)?(?:twitter|x)\.com\/([a-z0-9_]{1,15})\/?/i,
    build: (h) => `https://x.com/${h.replace(/^@/, '')}`,
  },
  {
    key: 'threads',
    label: 'Threads',
    detect: /^https?:\/\/(?:www\.)?threads\.(?:net|com)\/@?([a-z0-9._]{1,30})\/?/i,
    build: (h) => `https://threads.net/@${h.replace(/^@/, '')}`,
  },
  {
    key: 'bluesky',
    label: 'Bluesky',
    detect: /^https?:\/\/(?:www\.)?bsky\.app\/profile\/([a-z0-9.:-]+)\/?/i,
    build: (h) => `https://bsky.app/profile/${h.replace(/^@/, '')}`,
  },
  {
    key: 'linkedin',
    label: 'LinkedIn',
    detect: /^https?:\/\/(?:www\.)?linkedin\.com\/(in\/[a-z0-9-]{3,100}|company\/[a-z0-9-]{2,100})\/?/i,
    build: (h) => `https://linkedin.com/${h.includes('/') ? h : 'in/' + h}`,
  },
  {
    key: 'telegram',
    label: 'Telegram',
    detect: /^https?:\/\/(?:t\.me|telegram\.me)\/([a-z0-9_]{4,32})\/?/i,
    build: (h) => `https://t.me/${h.replace(/^@/, '')}`,
  },
  {
    key: 'github',
    label: 'GitHub',
    detect: /^https?:\/\/(?:www\.)?github\.com\/([a-z0-9](?:-?[a-z0-9]){0,38})\/?$/i,
    build: (h) => `https://github.com/${h}`,
  },
  {
    key: 'reddit',
    label: 'Reddit',
    detect: /^https?:\/\/(?:www\.)?reddit\.com\/(?:u|user)\/([a-z0-9_-]{3,20})\/?/i,
    build: (h) => `https://reddit.com/user/${h.replace(/^\/?(u|user)\//, '')}`,
  },
  {
    key: 'twitch',
    label: 'Twitch',
    detect: /^https?:\/\/(?:www\.)?twitch\.tv\/([a-z0-9_]{3,25})\/?/i,
    build: (h) => `https://twitch.tv/${h}`,
  },
  {
    key: 'spotify',
    label: 'Spotify',
    detect: /^https?:\/\/open\.spotify\.com\/(artist|user|show)\/([0-9a-z._-]{3,40})\/?/i,
    build: (h) => `https://open.spotify.com/artist/${h}`,
  },
  {
    key: 'soundcloud',
    label: 'SoundCloud',
    detect: /^https?:\/\/(?:www\.)?soundcloud\.com\/([a-z0-9_-]{3,40})\/?/i,
    build: (h) => `https://soundcloud.com/${h}`,
  },
  {
    key: 'pinterest',
    label: 'Pinterest',
    detect: /^https?:\/\/(?:www\.)?pinterest\.(?:com|[a-z.]{2,6})\/([a-z0-9_-]{3,30})\/?/i,
    build: (h) => `https://pinterest.com/${h}`,
  },
  {
    key: 'snapchat',
    label: 'Snapchat',
    detect: /^https?:\/\/(?:www\.)?snapchat\.com\/(?:add|@)\/([a-z0-9_.-]{3,15})\/?/i,
    build: (h) => `https://snapchat.com/add/${h}`,
  },
  {
    key: 'discord',
    label: 'Discord',
    detect: /^https?:\/\/(?:discord\.(?:gg|com\/invite)|discord\.com\/users)\/([a-z0-9-]+)\/?/i,
    build: (h) => (/^\d{16,20}$/.test(h) ? `https://discord.com/users/${h}` : `https://discord.gg/${h}`),
  },
  {
    key: 'medium',
    label: 'Medium',
    detect: /^https?:\/\/(?:www\.)?medium\.com\/@([a-z0-9_.]{1,30})\/?/i,
    build: (h) => `https://medium.com/@${h.replace(/^@/, '')}`,
  },
  {
    key: 'patreon',
    label: 'Patreon',
    detect: /^https?:\/\/(?:www\.)?patreon\.com\/([a-z0-9_-]{3,100})\/?/i,
    build: (h) => `https://patreon.com/${h}`,
  },
  {
    key: 'mastodon',
    label: 'Mastodon',
    // Dynamic host; only matches the /@user shape on a non-known host.
    detect: /^https?:\/\/([a-z0-9.-]+\.[a-z]{2,})\/@([a-z0-9_.]{1,30})\/?$/i,
    build: (h) => {
      // Accept "user@host" or a full URL fragment.
      const m = h.match(/^@?([a-z0-9_.]+)@([a-z0-9.-]+)$/i);
      return m ? `https://${m[2]}/@${m[1]}` : `https://${h}`;
    },
  },
  {
    key: 'website',
    label: 'Website',
    detect: /^https?:\/\/[a-z0-9.-]+\.[a-z]{2,}/i,
    build: (h) => (/^https?:\/\//i.test(h) ? h : `https://${h}`),
  },
];

const BY_KEY = new Map(PLATFORMS.map((p) => [p.key, p]));

/** Hosts that should NOT be misread as a generic mastodon `/@user` profile. */
const KNOWN_HOSTS =
  /(instagram|tiktok|youtube|facebook|twitter|x|threads|bsky|linkedin|t\.me|telegram|github|reddit|twitch|spotify|soundcloud|pinterest|snapchat|discord|medium|patreon)\./i;

function ensureHttp(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

/** Returns the platform key for a URL, or null. `website` is returned for any other http(s) URL. */
export function detectPlatform(rawUrl: string): SocialPlatformKey | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const url = ensureHttp(rawUrl.trim());
  for (const p of PLATFORMS) {
    if (p.key === 'website') continue;
    if (p.key === 'mastodon' && KNOWN_HOSTS.test(url)) continue;
    if (p.detect.test(url)) return p.key;
  }
  return BY_KEY.get('website')!.detect.test(url) ? 'website' : null;
}

/** Extracts the bare handle (no leading @) from a platform URL, or null. */
export function normalizeHandle(platform: SocialPlatformKey, urlOrHandle: string): string | null {
  if (!urlOrHandle) return null;
  const def = BY_KEY.get(platform);
  if (!def) return null;
  const value = urlOrHandle.trim();
  // Already a bare handle (no protocol, no dots-as-host) — strip a leading @.
  if (!/^https?:\/\//i.test(value) && !value.includes('/')) {
    return value.replace(/^@/, '') || null;
  }
  const m = ensureHttp(value).match(def.detect);
  if (!m) return null;
  // Mastodon captures host in g1 and user in g2; rebuild as user@host.
  if (platform === 'mastodon' && m[2]) return `${m[2]}@${m[1]}`;
  const handle = (m[2] ?? m[1] ?? '').replace(/^@/, '');
  return handle || null;
}

/** Builds a canonical profile URL from a platform + handle (or passes a full URL through). */
export function buildProfileUrl(platform: SocialPlatformKey, handle: string): string {
  const def = BY_KEY.get(platform) ?? BY_KEY.get('website')!;
  if (/^https?:\/\//i.test(handle)) return handle;
  return def.build(handle.replace(/^@/, ''));
}

export function platformLabel(platform: string): string {
  return BY_KEY.get(platform as SocialPlatformKey)?.label ?? platform;
}

/**
 * Scans free text / HTML for social profile URLs and returns a
 * platformKey -> url map (first URL wins per platform). Used by the
 * ingestion pipeline and backfill. `website` matches are ignored here to
 * avoid capturing every link on a page.
 */
export function extractSocialUrlsFromText(text: string): Partial<Record<SocialPlatformKey, string>> {
  const out: Partial<Record<SocialPlatformKey, string>> = {};
  if (!text) return out;
  const urls = text.match(/https?:\/\/[^\s"'<>)\]]+/gi) ?? [];
  for (const raw of urls) {
    const url = raw.replace(/[.,);]+$/, '');
    const key = detectPlatform(url);
    if (!key || key === 'website') continue;
    if (!out[key]) out[key] = canonicalizeUrl(key, url);
  }
  return out;
}

/** Normalizes a detected URL to its canonical handle-based form. */
export function canonicalizeUrl(platform: SocialPlatformKey, url: string): string {
  const handle = normalizeHandle(platform, url);
  return handle ? buildProfileUrl(platform, handle) : ensureHttp(url);
}

/**
 * Normalizes a whole social_links object: drops empties, detects platform
 * keys from values when the key is unknown, and canonicalizes URLs.
 */
export function normalizeSocialLinks(
  input: Record<string, unknown> | null | undefined,
): Partial<Record<SocialPlatformKey, string>> {
  const out: Partial<Record<SocialPlatformKey, string>> = {};
  if (!input || typeof input !== 'object') return out;
  for (const [k, v] of Object.entries(input)) {
    if (!v || typeof v !== 'string') continue;
    const url = ensureHttp(v.trim());
    const known = BY_KEY.has(k as SocialPlatformKey) ? (k as SocialPlatformKey) : null;
    const key = known ?? detectPlatform(url);
    if (!key) continue;
    if (!out[key]) out[key] = canonicalizeUrl(key, url);
  }
  return out;
}
