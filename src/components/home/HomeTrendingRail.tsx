import { useEffect, useState } from 'react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { SkeletonCrossfade } from '@/components/effects';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { HomeSection } from './HomeSection';
import { fetchTrending } from '@/lib/searchClient';
import { useTrackClick } from '@/hooks/useSearchActions';
import { getFallbackImage, type FallbackTheme } from '@/utils/fallbackImages';
import { isValidImageUrl } from '@/lib/images/resolveEntityImage';

const TYPE_PATH: Record<string, string> = {
  venue: '/venues',
  event: '/events',
  city: '/city',
  country: '/country',
  personality: '/personalities',
  queer_village: '/villages',
  hotel: '/hotels',
  marketplace: '/marketplace',
};

function fallbackTheme(type: string): FallbackTheme {
  switch (type) {
    case 'venue':
      return 'venue';
    case 'event':
      return 'event';
    case 'hotel':
      return 'hotel';
    case 'marketplace':
      return 'marketplace';
    case 'personality':
      return 'person';
    default:
      return 'place';
  }
}

// The /trending worker returns rows with entity_type/entity_id/slug — same
// shape TrendingStrip consumes. Typed loosely; field access mirrors it.
interface TrendRow {
  entity_type?: string;
  type?: string;
  entity_id?: string;
  id?: string;
  title?: string;
  slug?: string;
  image_url?: string;
  city?: string;
  country?: string;
  score?: number;
  end_date?: string;
  start_date?: string;
}

interface HomeTrendingRailProps {
  type: 'venue' | 'city';
  city?: string;
  limit?: number;
  eyebrow: string;
  title: string;
  description?: string;
  seeAllHref: string;
  seeAllLabel: string;
}

/**
 * Live "trending" rail for the homepage. Reuses the /trending feed but renders
 * through HomeSection so it shares the page's rhythm — and self-hides (whole
 * section, header included) on error or empty so a cold/failed feed never
 * leaves a dangling title.
 */
export function HomeTrendingRail({
  type,
  city,
  limit = 12,
  eyebrow,
  title,
  description,
  seeAllHref,
  seeAllLabel,
}: HomeTrendingRailProps) {
  const [items, setItems] = useState<TrendRow[] | null>(null);
  const [error, setError] = useState(false);
  const trackClick = useTrackClick();

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with an external feed (mirrors TrendingStrip); React Compiler can't infer the sync direction.
    setItems(null);
    setError(false);
    fetchTrending([type], city, limit)
      .then((res) => {
        if (!cancelled) setItems(res as TrendRow[]);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [type, city, limit]);

  // Hide the entire section (title included) when there's nothing to show.
  if (error || items?.length === 0) return null;

  return (
    <HomeSection
      eyebrow={eyebrow}
      title={title}
      description={description}
      seeAllHref={seeAllHref}
      seeAllLabel={seeAllLabel}
    >
      <SkeletonCrossfade
        loading={!items}
        skeleton={
          <div className="flex gap-4 pb-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-40 w-56 shrink-0 rounded-element" />
            ))}
          </div>
        }
      >
        <ScrollArea className="w-full whitespace-nowrap">
          <div className="flex gap-4 pb-4">
            {items
              ?.map((it) => {
                const entityType = it.entity_type || it.type || type;
                const entityId = it.entity_id || it.id || '';
                const slug = it.slug || entityId;
                const base = TYPE_PATH[entityType];
                if (!base || !slug || !it.title) return null;
                return (
                  <LocalizedLink
                    key={`${entityType}:${entityId}`}
                    to={`${base}/${slug}`}
                    className="shrink-0 w-56 no-underline"
                    onClick={() =>
                      trackClick({ type: entityType, id: entityId }, 'trending', {
                        score: it.score,
                        city,
                      })
                    }
                  >
                    <Card className="h-40 overflow-hidden transition">
                      <img
                        src={
                          isValidImageUrl(it.image_url)
                            ? (it.image_url as string)
                            : getFallbackImage(fallbackTheme(entityType), entityId)
                        }
                        alt=""
                        role="presentation"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="h-24 w-full object-cover"
                        onError={(e) => {
                          const fb = getFallbackImage(fallbackTheme(entityType), entityId);
                          if (e.currentTarget.src !== fb) e.currentTarget.src = fb;
                        }}
                      />
                      <CardContent className="p-2">
                        <div className="text-sm font-medium truncate">{it.title}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {[it.city, it.country].filter(Boolean).join(', ')}
                        </div>
                      </CardContent>
                    </Card>
                  </LocalizedLink>
                );
              })
              .filter(Boolean)}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </SkeletonCrossfade>
    </HomeSection>
  );
}
