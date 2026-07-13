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
  | 'kofi'
  // Creator / adult / hookup platforms — relevant to an LGBTQ+ audience
  // (creators, adult performers, community/dating). Flagged `adult` so the UI
  // can gate or badge them; never auto-displayed louder than the rest.
  | 'onlyfans'
  | 'fansly'
  | 'fetlife'
  | 'joyclub'
  | 'romeo'
  | 'grindr'
  | 'scruff'
  | 'recon'
  | 'pornhub'
  | 'xhamster'
  | 'xtube'
  | 'shop'
  | 'website';

export interface PlatformDef {
  key: SocialPlatformKey;
  label: string;
  /** Detects the platform from a full URL; capture group 1 is the handle when present. */
  detect: RegExp;
  /** Builds a canonical profile URL from a bare handle (no leading @). */
  build: (handle: string) => string;
  /** 18+ / NSFW platform — the UI may gate or badge these. */
  adult?: boolean;
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
    key: 'kofi',
    label: 'Ko-fi',
    detect: /^https?:\/\/(?:www\.)?ko-fi\.com\/([a-z0-9_-]{3,30})\/?/i,
    build: (h) => `https://ko-fi.com/${h}`,
  },
  // ---- Creator / adult / hookup platforms (18+) ----
  {
    key: 'onlyfans',
    label: 'OnlyFans',
    detect: /^https?:\/\/(?:www\.)?onlyfans\.com\/([a-z0-9._-]{3,50})\/?/i,
    build: (h) => `https://onlyfans.com/${h.replace(/^@/, '')}`,
    adult: true,
  },
  {
    key: 'fansly',
    label: 'Fansly',
    detect: /^https?:\/\/(?:www\.)?fansly\.com\/([a-z0-9._-]{2,50})\/?/i,
    build: (h) => `https://fansly.com/${h.replace(/^@/, '')}`,
    adult: true,
  },
  {
    key: 'fetlife',
    label: 'FetLife',
    detect: /^https?:\/\/(?:www\.)?fetlife\.com\/(users\/\d+|[a-z0-9._-]{2,40})\/?/i,
    build: (h) => `https://fetlife.com/${h.replace(/^@/, '')}`,
    adult: true,
  },
  {
    key: 'joyclub',
    label: 'JoyClub',
    detect: /^https?:\/\/(?:www\.)?joyclub\.(?:de|com)\//i,
    build: (h) => (/^https?:\/\//i.test(h) ? h : `https://www.joyclub.de/${h}`),
    adult: true,
  },
  {
    key: 'romeo',
    label: 'ROMEO',
    detect: /^https?:\/\/(?:www\.)?(?:romeo|planetromeo|gayromeo)\.com\/([a-z0-9._-]{2,40})\/?/i,
    build: (h) => `https://www.romeo.com/${h.replace(/^@/, '')}`,
    adult: true,
  },
  {
    key: 'grindr',
    label: 'Grindr',
    detect: /^https?:\/\/(?:www\.)?grindr\.com\/(?:profile\/)?([a-z0-9._-]{3,40})\/?/i,
    build: (h) => `https://www.grindr.com/profile/${h.replace(/^@/, '')}`,
    adult: true,
  },
  {
    key: 'scruff',
    label: 'SCRUFF',
    detect: /^https?:\/\/(?:www\.)?scruff\.com\/([a-z0-9._-]{2,40})\/?/i,
    build: (h) => `https://www.scruff.com/${h.replace(/^@/, '')}`,
    adult: true,
  },
  {
    key: 'recon',
    label: 'Recon',
    detect: /^https?:\/\/(?:www\.)?recon\.com\/([a-z0-9._-]{2,40})\/?/i,
    build: (h) => `https://www.recon.com/${h.replace(/^@/, '')}`,
    adult: true,
  },
  {
    key: 'pornhub',
    label: 'Pornhub',
    detect: /^https?:\/\/(?:[a-z]+\.)?pornhub\.com\/(?:model|pornstar|users)\/([a-z0-9._-]{2,50})\/?/i,
    build: (h) => `https://www.pornhub.com/model/${h.replace(/^@/, '')}`,
    adult: true,
  },
  {
    key: 'xhamster',
    label: 'xHamster',
    detect: /^https?:\/\/(?:[a-z]+\.)?xhamster\.com\/(?:creators|users)\/([a-z0-9._-]{2,50})\/?/i,
    build: (h) => `https://xhamster.com/creators/${h.replace(/^@/, '')}`,
    adult: true,
  },
  {
    key: 'xtube',
    label: 'xTube',
    detect: /^https?:\/\/(?:www\.)?xtube\.com\/([a-z0-9._-]{2,50})\/?/i,
    build: (h) => `https://www.xtube.com/${h.replace(/^@/, '')}`,
    adult: true,
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
    // Merch/shop link (e.g. an artist's store). No URL shape identifies a
    // shop, so it is never auto-detected — admins add it explicitly.
    key: 'shop',
    label: 'Shop',
    detect: /^$/,
    build: (h) => (/^https?:\/\//i.test(h) ? h : `https://${h}`),
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
  /(instagram|tiktok|youtube|facebook|twitter|x|threads|bsky|linkedin|t\.me|telegram|github|reddit|twitch|spotify|soundcloud|pinterest|snapchat|discord|medium|patreon|ko-fi|onlyfans|fansly|fetlife|joyclub|romeo|planetromeo|gayromeo|grindr|scruff|recon|pornhub|xhamster|xtube)\./i;

/**
 * Share-button / widget / post-permalink paths that are NOT profile links.
 * Harvesting pages picks these up off share widgets and embedded posts
 * (facebook.com/sharer/sharer.php, t.me/share/url, twitter.com/intent/tweet,
 * instagram.com/reels/<id>/, facebook.com/watch/, …); they must never be
 * stored or treated as a social profile.
 */
const SHARE_WIDGET_RE =
  /\/(?:sharer?\.php|sharer|share\/url|share|intent|dialog|reels?|p|watch|hashtag|explore|stories)(?:[/?#]|$)/i;

/** First path segments that are platform features/permalinks, never handles. */
const RESERVED_HANDLES = new Set([
  'reels', 'reel', 'p', 'share', 'intent', 'sharer', 'watch',
  'hashtag', 'explore', 'stories', 'dialog',
]);

function isReservedHandle(handle: string): boolean {
  return RESERVED_HANDLES.has(handle.trim().toLowerCase().replace(/^@/, ''));
}

/** True for share-button / widget / post-permalink URLs that aren't profiles. */
export function isShareOrWidgetUrl(rawUrl: string): boolean {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  const url = ensureHttp(rawUrl.trim());
  if (SHARE_WIDGET_RE.test(url)) return true;
  try {
    const seg = new URL(url).pathname.split('/').filter(Boolean)[0];
    return seg ? isReservedHandle(seg) : false;
  } catch {
    return false;
  }
}

/** True for 18+/NSFW platforms (OnlyFans, Fansly, FetLife, ROMEO, Pornhub, …). */
export function isAdultPlatform(key: string): boolean {
  return BY_KEY.get(key as SocialPlatformKey)?.adult === true;
}

function ensureHttp(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

/** Returns the platform key for a URL, or null. `website` is returned for any other http(s) URL. */
export function detectPlatform(rawUrl: string): SocialPlatformKey | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const url = ensureHttp(rawUrl.trim());
  if (isShareOrWidgetUrl(url)) return null;
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
    const bare = value.replace(/^@/, '');
    if (!bare || isReservedHandle(bare)) return null;
    return bare;
  }
  if (isShareOrWidgetUrl(value)) return null;
  const m = ensureHttp(value).match(def.detect);
  if (!m) return null;
  // Mastodon captures host in g1 and user in g2; rebuild as user@host.
  if (platform === 'mastodon' && m[2]) return `${m[2]}@${m[1]}`;
  const handle = (m[2] ?? m[1] ?? '').replace(/^@/, '');
  if (!handle || isReservedHandle(handle)) return null;
  return handle;
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
 * A human-friendly handle for display (e.g. "@name"), or null when the
 * identifier is opaque and shouldn't be shown — a YouTube channel id
 * (`channel/UC…`) or any residual path. Strips readable path prefixes like
 * `in/`, `company/`, `c/`, `user/`, `profile/` so cards don't show
 * "@company/acme" or "@channel/UC-3gHl…".
 */
export function displayHandle(platform: SocialPlatformKey, handle: string): string | null {
  if (!handle) return null;
  let h = handle.replace(/^@/, '');
  const m = h.match(/^(?:channel|c|user|company|in|profile)\/(.+)$/i);
  if (m) h = m[1];
  // Opaque YouTube channel id — no readable handle.
  if (/^UC[\w-]{20,}$/.test(h)) return null;
  // Anything still path-shaped is too complex to show cleanly.
  if (h.includes('/')) return null;
  return h || null;
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

/** Returns canonical social profile URLs as a schema.org `sameAs` array. */
export function socialSameAs(input: Record<string, unknown> | null | undefined): string[] {
  return Object.values(normalizeSocialLinks(input));
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
    // Drop share-widget/post-permalink junk even when stored under a known key.
    if (isShareOrWidgetUrl(url)) continue;
    const known = BY_KEY.has(k as SocialPlatformKey) ? (k as SocialPlatformKey) : null;
    const key = known ?? detectPlatform(url);
    if (!key) continue;
    if (!out[key]) out[key] = canonicalizeUrl(key, url);
  }
  return out;
}
