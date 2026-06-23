import { PLATFORM_CONFIGS } from '@/components/profile/social/platformConfigs';

/** Verification tier. `verified` = cryptographic (fediverse/bio-token), `linked`
 *  = best-effort, `unverified` = self-declared. Phase 1 only writes 'unverified'. */
export type VerifiedStatus = 'unverified' | 'linked' | 'verified';

/** Per-account visibility. Phase 1 stores it but the server still gates the whole
 *  array by the profile's single contact_visibility — per-account enforcement is Phase 2. */
export type AccountVisibility = 'public' | 'community' | 'friends' | 'private';

export interface SocialAccount {
  platform: string;
  url: string;
  handle?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  verified?: VerifiedStatus;
  visibility?: AccountVisibility;
  featured?: boolean;
  embed_enabled?: boolean;
}

/** Ensure a URL has a scheme. */
export function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/** Compile a PlatformConfig detection regex the same way the legacy manager did. */
function compileRegex(pattern: string): RegExp | null {
  try {
    const body = pattern.replace(/^\(\?i\)/, '').replace(/\\\\/g, '\\');
    return new RegExp(body, 'i');
  } catch {
    return null;
  }
}

/** Detect platform + handle (first capture group) from a social URL. Falls back
 *  to { platform: 'Website' } for anything that only matches the generic rule. */
export function detectPlatform(rawUrl: string): { platform: string; handle: string | null } {
  const url = normalizeUrl(rawUrl);
  // Skip the trailing generic 'Website' rule on the first pass so specific
  // platforms win even though the website regex matches almost anything.
  for (const config of PLATFORM_CONFIGS) {
    if (config.platform === 'Website') continue;
    const regex = compileRegex(config.urlDetectionRegex);
    const match = regex?.exec(url);
    if (match) {
      return { platform: config.platform, handle: match[1] ?? null };
    }
  }
  return { platform: 'Website', handle: null };
}

/** unavatar.io source slug for a platform, or null if we can't resolve an avatar
 *  for it. Drives the existing /avatar/resolve worker. Keep in sync with the
 *  worker's SOURCES allowlist (workers/image-cdn/src/avatarResolve.ts). */
const UNAVATAR_SOURCE: Record<string, string> = {
  Instagram: 'instagram',
  'X (Twitter)': 'twitter',
  GitHub: 'github',
  Telegram: 'telegram',
  YouTube: 'youtube',
  Twitch: 'twitch',
  TikTok: 'tiktok',
  SoundCloud: 'soundcloud',
  Reddit: 'reddit',
};

export function unavatarSource(platform: string): string | null {
  return UNAVATAR_SOURCE[platform] ?? null;
}

/** Best-effort display handle for a card: stored handle, else the last URL path
 *  segment, else the host. Always returns something printable. */
export function displayHandle(account: SocialAccount): string {
  if (account.handle) return account.handle.replace(/^@/, '');
  try {
    const u = new URL(normalizeUrl(account.url));
    const seg = u.pathname.split('/').filter(Boolean).pop();
    return seg ? seg.replace(/^@/, '') : u.hostname.replace(/^www\./, '');
  } catch {
    return account.url;
  }
}

/** Migrate a legacy social_links map ({platform: url}) to account objects. */
export function fromLegacyLinks(links: Record<string, unknown> | null | undefined): SocialAccount[] {
  if (!links || typeof links !== 'object') return [];
  return Object.entries(links)
    .filter(([, url]) => typeof url === 'string' && url.trim() !== '')
    .map(([platform, url]) => {
      const detected = detectPlatform(url as string);
      return {
        platform: platform || detected.platform,
        url: normalizeUrl(url as string),
        handle: detected.handle,
        verified: 'unverified' as VerifiedStatus,
        visibility: 'public' as AccountVisibility,
        featured: false,
        embed_enabled: false,
      };
    });
}

/** Coerce whatever is in profile.social_accounts (jsonb) into typed accounts,
 *  falling back to the legacy social_links map when the array is empty/absent. */
export function readAccounts(
  socialAccounts: unknown,
  legacyLinks?: Record<string, unknown> | null,
): SocialAccount[] {
  if (Array.isArray(socialAccounts) && socialAccounts.length > 0) {
    return (socialAccounts as SocialAccount[]).filter((a) => a && typeof a.url === 'string' && a.url);
  }
  return fromLegacyLinks(legacyLinks);
}

/** Derive the back-compat social_links map from accounts (last write wins per platform). */
export function toLegacyLinks(accounts: SocialAccount[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of accounts) {
    if (a.url) out[a.platform] = a.url;
  }
  return out;
}
