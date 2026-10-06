import { useQuery } from '@tanstack/react-query';
import { untypedFrom } from '@/integrations/supabase/untyped';
import { orderedSocialLinks, normalizeHandle, type SocialPlatformKey } from '@/lib/social/registry';

export interface SocialProfile {
  platform: string;
  handle: string;
  profile_url: string | null;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  follower_count: number | null;
  status: 'resolved' | 'fallback' | 'pending' | 'error';
}

export interface SocialLinkEntry {
  platform: SocialPlatformKey;
  handle: string;
  url: string;
}

/**
 * Derives the {platform, handle, url} list from an entity's social_links jsonb,
 * in SOCIAL_DISPLAY_ORDER so every surface lists platforms the same way.
 */
export function socialLinkEntries(links: unknown): SocialLinkEntry[] {
  const out: SocialLinkEntry[] = [];
  for (const [platform, url] of orderedSocialLinks(links as Record<string, unknown> | null)) {
    const handle = normalizeHandle(platform, url);
    if (handle) out.push({ platform, handle, url });
  }
  return out;
}

/**
 * Reads cached social_profiles for an entity's social links. Returns a Map keyed
 * by `${platform}:${handle}`. Cards render from this cache only — the client
 * never contacts the source platform (privacy invariant). Missing entries simply
 * render as the plain fallback card.
 */
export function useSocialProfiles(links: unknown) {
  const entries = socialLinkEntries(links);
  const platforms = [...new Set(entries.map((e) => e.platform))];
  const handles = [...new Set(entries.map((e) => e.handle))];

  const query = useQuery({
    queryKey: ['social-profiles', platforms.sort(), handles.sort()],
    enabled: entries.length > 0,
    staleTime: 1000 * 60 * 30,
    queryFn: async () => {
      const { data, error } = await untypedFrom('social_profiles')
        .select(
          'platform, handle, profile_url, display_name, bio, avatar_url, follower_count, status',
        )
        .in('platform', platforms)
        .in('handle', handles);
      if (error) throw error;
      const map = new Map<string, SocialProfile>();
      for (const row of (data ?? []) as unknown as SocialProfile[]) {
        map.set(`${row.platform}:${row.handle}`, row);
      }
      return map;
    },
  });

  return {
    entries,
    profiles: query.data ?? new Map<string, SocialProfile>(),
    isLoading: query.isLoading,
  };
}
