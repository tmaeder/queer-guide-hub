import { ExternalLink } from 'lucide-react';
import { useSocialProfiles } from '@/hooks/useSocialProfiles';
import { platformLabel, buildProfileUrl, isAdultPlatform, displayHandle, type SocialPlatformKey } from '@/lib/social/registry';
import { platformIcon } from '@/lib/social/icons';
import { resolveImageUrl } from '@/utils/resolveImageUrl';

interface SocialCardsProps {
  /** Entity social_links jsonb (platformKey -> url). */
  links?: unknown;
  className?: string;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(n);
}

/**
 * Privacy-safe social link cards. Rich (avatar + name + follower count) when a
 * resolved social_profiles row exists; a clean monochrome handle card otherwise.
 * All imagery is served from our own CDN — the browser never contacts the source
 * platform. No iframes, no third-party scripts, no motion.
 */
export function SocialCards({ links, className }: SocialCardsProps) {
  const { entries, profiles } = useSocialProfiles(links);
  if (entries.length === 0) return null;

  return (
    <div className={`grid grid-cols-1 gap-2 sm:grid-cols-2 ${className ?? ''}`}>
      {entries.map(({ platform, handle, url }) => {
        const profile = profiles.get(`${platform}:${handle}`);
        const Icon = platformIcon(platform);
        const adult = isAdultPlatform(platform);
        const label = platformLabel(platform);
        const href = url || buildProfileUrl(platform as SocialPlatformKey, handle);
        const shownHandle = displayHandle(platform as SocialPlatformKey, handle);
        const avatar = profile?.avatar_url
          ? resolveImageUrl({ optimizedUrl: profile.avatar_url, imageUrl: profile.avatar_url })
          : null;

        return (
          <a
            key={`${platform}:${handle}`}
            href={href}
            target="_blank"
            rel="noopener nofollow"
            className="no-underline flex items-center gap-2.5 rounded-element border border-foreground/10 p-4 transition-colors hover:bg-muted"
          >
            {avatar ? (
              <img
                src={avatar}
                alt=""
                loading="lazy"
                className="h-10 w-10 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
                <Icon size={20} />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-15 font-semibold">
                <span className="truncate">{profile?.display_name || label}</span>
                {adult && <span className="text-2xs text-muted-foreground">18+</span>}
              </span>
              <span className="block truncate text-13 text-muted-foreground">
                {profile?.follower_count != null
                  ? `${formatCount(profile.follower_count)} followers · ${label}`
                  : shownHandle
                    ? `@${shownHandle} · ${label}`
                    : label}
              </span>
            </span>
            <ExternalLink size={14} className="shrink-0 text-muted-foreground" aria-hidden="true" />
          </a>
        );
      })}
    </div>
  );
}
