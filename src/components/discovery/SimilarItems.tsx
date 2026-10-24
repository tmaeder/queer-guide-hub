/**
 * "More like this" — semantic neighbors of a given entity from pgvector ANN.
 * Drop into any detail page bottom.
 */

import { useTranslation } from 'react-i18next';
import { Waypoints } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { detailHref } from '@/lib/searchRoutes';
import { useTrackClick, type Entity } from '@/hooks/useSearchActions';
import { useSimilarQuery } from '@/hooks/useDiscoveryQueries';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { ScrollReveal } from '@/components/animation/ScrollReveal';
import { SkeletonCrossfade } from '@/components/effects';
import { Image } from '@/components/ui/Image';
import { type FallbackTheme } from '@/utils/fallbackImages';
import { isValidImageUrl } from '@/lib/images/resolveEntityImage';
import { CityNetwork } from '@/components/home/subway/CityNetwork';
import { hasCityNetwork } from '@/components/home/subway/cityNetworkGeometry';

interface Props {
  entity: Entity;
  limit?: number;
  title?: string;
  /** Display name of the source entity — labels the center node in /explore/connections. */
  entityTitle?: string;
  className?: string;
  /**
   * Restrict results to specific content types. Default behavior keeps the
   * cross-type semantic neighbors (matches legacy callers). Pass a single-
   * element array (e.g. `['personality']`) on detail pages where mixing in
   * scraped articles or other entity kinds would be misleading.
   */
  contentTypes?: string[];
}

function fallbackTheme(type: string): FallbackTheme {
  switch (type) {
    case 'venue':
      return 'venue';
    case 'event':
      return 'event';
    case 'hotel':
      return 'hotel';
    case 'news':
      return 'news';
    case 'marketplace':
      return 'marketplace';
    case 'personality':
    case 'person':
      return 'person';
    default:
      return 'place';
  }
}

interface SimItem {
  content_type: string;
  content_id: string;
  score: number;
  metadata: {
    title?: string;
    city?: string;
    country?: string;
    category?: string;
    slug?: string;
    image_url?: string;
    optimized_url?: string | null;
    thumbnail_url?: string | null;
    tags?: string[];
  };
}

export function SimilarItems({
  entity,
  limit = 6,
  title = 'More like this',
  entityTitle,
  className,
  contentTypes,
}: Props) {
  const { t } = useTranslation();
  const trackClick = useTrackClick();
  const { data, isError: error } = useSimilarQuery(entity, limit, contentTypes, (hits, types) => {
    let next = hits as unknown as SimItem[];
    // Defensive: trim any off-type leakage when restricting types.
    if (types) next = next.filter((r) => types.includes(r.content_type));
    // D2: never include the current entity in "More like this".
    next = next.filter((r) => !(r.content_type === entity.type && r.content_id === entity.id));
    // Drop duplicate (content_type, content_id) hits.
    const seen = new Set<string>();
    next = next.filter((r) => {
      const k = `${r.content_type}:${r.content_id}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    return next.slice(0, limit);
  });
  const items = data ?? null;

  if (error) return null;
  if (items?.length === 0) return null;

  return (
    <ScrollReveal direction="up">
      <section className={className} aria-label={title}>
        <div className="flex items-baseline justify-between gap-4 mb-4">
          <h2 className="text-title font-semibold">{title}</h2>
          <LocalizedLink
            to={`/explore/connections?type=${encodeURIComponent(entity.type)}&id=${encodeURIComponent(entity.id)}${entityTitle ? `&title=${encodeURIComponent(entityTitle)}` : ''}`}
            className="text-13 text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1 shrink-0"
          >
            <Waypoints className="h-3.5 w-3.5" aria-hidden="true" />
            {t('connections.explore')}
          </LocalizedLink>
        </div>
        <ScrollArea className="w-full whitespace-nowrap">
          <SkeletonCrossfade
            loading={!items}
            skeleton={
              <div className="flex gap-4 pb-4">
                {Array.from({ length: limit }).map((_, i) => (
                  <Skeleton key={i} className="h-40 w-56 shrink-0 rounded-element" />
                ))}
              </div>
            }
          >
            <div className="flex gap-4 pb-4">
              {items
                ?.map((it) => {
                  // Strict: only link items with a canonical slug — a slug-less
                  // (UUID-only) neighbor is dropped, never linked to a
                  // /type/<uuid> URL that 404s.
                  const to = detailHref({
                    type: it.content_type,
                    slug: it.metadata?.slug,
                    id: it.content_id,
                    title: it.metadata?.title,
                  });
                  if (!to) return null;
                  return (
                    <LocalizedLink
                      key={`${it.content_type}:${it.content_id}`}
                      to={to}
                      className="shrink-0 w-56"
                      onClick={() =>
                        trackClick({ type: it.content_type, id: it.content_id }, 'similar', {
                          score: it.score,
                          source_entity: entity,
                        })
                      }
                    >
                      <Card className="h-40 overflow-hidden transition">
                        {!isValidImageUrl(it.metadata?.image_url) &&
                        it.content_type === 'city' &&
                        hasCityNetwork(it.metadata?.slug as string | undefined) ? (
                          <div className="flex h-24 items-center justify-center bg-background p-2">
                            <CityNetwork
                              slug={it.metadata?.slug as string}
                              variant="thumb"
                              className="h-full"
                            />
                          </div>
                        ) : (
                          <Image
                            imageUrl={
                              isValidImageUrl(it.metadata?.image_url)
                                ? (it.metadata!.image_url as string)
                                : null
                            }
                            optimizedUrl={it.metadata?.optimized_url}
                            thumbnailUrl={it.metadata?.thumbnail_url}
                            preferThumb
                            alt=""
                            heightPx={96}
                            imageRole="thumb"
                            rounded="none"
                            fallbackEntityType={fallbackTheme(it.content_type)}
                            fallbackKey={it.content_id}
                          />
                        )}
                        <CardContent className="p-2">
                          <div className="text-sm font-medium truncate">
                            {it.metadata?.title || it.metadata?.slug?.replace(/-/g, ' ')}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {[it.metadata?.city, it.metadata?.country].filter(Boolean).join(', ') ||
                              it.metadata?.category}
                          </div>
                        </CardContent>
                      </Card>
                    </LocalizedLink>
                  );
                })
                .filter(Boolean)}
            </div>
          </SkeletonCrossfade>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </section>
    </ScrollReveal>
  );
}
