import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useFollowedTags } from '@/hooks/useFollowedTags';
import { TagChip } from '@/components/tags/TagChip';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { hrefForEntity } from '@/lib/searchRoutes';
import { resolveImageUrl } from '@/utils/resolveImageUrl';
import { getFallbackImage, type FallbackTheme } from '@/utils/fallbackImages';
import { isValidImageUrl } from '@/lib/images/resolveEntityImage';

function fallbackTheme(type: string): FallbackTheme {
  switch (type) {
    case 'venue': return 'venue';
    case 'event': return 'event';
    case 'hotel': return 'hotel';
    case 'news': return 'news';
    case 'marketplace': return 'marketplace';
    case 'personality': return 'person';
    default: return 'place';
  }
}

interface FeedItem {
  type: string;
  id: string;
  title: string;
  slug: string | null;
  city: string | null;
  country: string | null;
  image_url: string | null;
}

async function fetchFeed(): Promise<FeedItem[]> {
  const { data, error } = await supabase.rpc('get_followed_tags_feed', { p_limit: 12 });
  if (error || !data) return [];
  return data as unknown as FeedItem[];
}

/**
 * "Tags you follow" — the signed-in user's followed-tag chips plus a recency
 * rail of content across every type matching those tags. Renders nothing for
 * anonymous users or users following no tags.
 */
export function FollowedTagsFeed({ className }: { className?: string }) {
  const { user } = useAuth();
  const { followedTags } = useFollowedTags();

  const { data: feed = [] } = useQuery({
    queryKey: ['followed-tags-feed', user?.id],
    queryFn: fetchFeed,
    enabled: !!user && followedTags.length > 0,
    staleTime: 60 * 1000,
  });

  if (!user || followedTags.length === 0) return null;

  return (
    <section className={className}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="mr-2 text-title font-display">Tags you follow</h2>
        {followedTags.slice(0, 12).map((tg) => (
          <TagChip key={tg.tagId} tag={tg.slug || tg.name} name={tg.name} size="sm" />
        ))}
      </div>

      {feed.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {feed.map((item) => {
            const href = hrefForEntity({ type: item.type, slug: item.slug, title: item.title });
            const fallback = getFallbackImage(fallbackTheme(item.type), item.id);
            const resolved = isValidImageUrl(item.image_url)
              ? resolveImageUrl({ imageUrl: item.image_url })
              : null;
            const img = resolved ?? fallback;
            const location = [item.city, item.country].filter(Boolean).join(', ');
            return (
              <LocalizedLink
                key={`${item.type}:${item.id}`}
                to={href}
                className="group flex flex-col overflow-hidden rounded-element border border-border bg-background no-underline text-inherit transition-colors hover:border-foreground/40"
              >
                <div className="relative aspect-[4/3] w-full bg-muted">
                  <img
                    src={img}
                    alt=""
                    role="presentation"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="absolute inset-0 h-full w-full object-cover"
                    onError={(e) => {
                      if (e.currentTarget.src !== fallback) e.currentTarget.src = fallback;
                    }}
                  />
                </div>
                <div className="flex flex-col gap-1.5 p-4">
                  <span className="line-clamp-2 text-15 font-medium leading-snug">{item.title}</span>
                  {location && (
                    <span className="truncate text-2xs text-muted-foreground">{location}</span>
                  )}
                </div>
              </LocalizedLink>
            );
          })}
        </div>
      )}
    </section>
  );
}
