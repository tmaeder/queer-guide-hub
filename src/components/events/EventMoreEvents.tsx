/**
 * One merged "More events" rail for the event detail page. Blends three
 * discovery signals — same-city trending, semantic neighbors (pgvector), and
 * shared-tag matches — into a single deduped grid, each card tagged with the
 * reason it surfaced. Replaces the three separate rails the page used to stack.
 */

import { useQuery } from '@tanstack/react-query';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Badge } from '@/components/ui/badge';
import { Image } from '@/components/ui/Image';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchSimilar, fetchTrending, type SearchHit } from '@/lib/searchClient';
import { fetchRelatedByTagsClient } from '@/hooks/useRelatedByTags';
import { isValidImageUrl } from '@/lib/images/resolveEntityImage';
import { useTrackClick } from '@/hooks/useSearchActions';

type Reason = 'Same city' | 'Similar vibe' | 'Shared tags';

interface MergedCard {
  id: string;
  slug: string;
  title: string;
  city?: string | null;
  country?: string | null;
  imageUrl?: string | null;
  optimizedUrl?: string | null;
  thumbnailUrl?: string | null;
  reason: Reason;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v : undefined;
}

/** Blend the three sources; first reason to claim an event id wins. */
async function fetchMergedEvents(
  eventId: string,
  city: string | null | undefined,
  limit: number,
): Promise<MergedCard[]> {
  const [trending, similar, tagged] = await Promise.all([
    city
      ? fetchTrending(['event'], city, limit + 4).catch(() => [] as SearchHit[])
      : Promise.resolve([] as SearchHit[]),
    fetchSimilar({ type: 'event', id: eventId }, limit + 4, ['event']).catch(
      () => [] as SearchHit[],
    ),
    fetchRelatedByTagsClient('event', eventId, limit + 4).catch(() => []),
  ]);

  const out: MergedCard[] = [];
  const seen = new Set<string>([eventId]);
  const push = (c: MergedCard | null) => {
    if (!c || seen.has(c.id) || !c.title) return;
    seen.add(c.id);
    out.push(c);
  };

  // 1) Same-city trending (strongest local signal)
  for (const it of trending) {
    const id = str(it.entity_id) ?? it.id;
    if (!id) continue;
    push({
      id,
      slug: str(it.slug) ?? id,
      title: it.title ?? '',
      city: str(it.city),
      country: str(it.country),
      imageUrl: it.image_url,
      optimizedUrl: it.optimized_url,
      thumbnailUrl: it.thumbnail_url,
      reason: 'Same city',
    });
  }
  // 2) Semantic neighbors
  for (const it of similar) {
    const meta = (it.metadata ?? {}) as Record<string, unknown>;
    const id = str(it.content_id) ?? it.id;
    if (!id) continue;
    push({
      id,
      slug: str(meta.slug) ?? id,
      title: str(meta.title) ?? '',
      city: str(meta.city),
      country: str(meta.country),
      imageUrl: str(meta.image_url),
      optimizedUrl: str(meta.optimized_url),
      thumbnailUrl: str(meta.thumbnail_url),
      reason: 'Similar vibe',
    });
  }
  // 3) Shared tags
  for (const it of tagged) {
    if (it.type !== 'event') continue;
    push({
      id: it.id,
      slug: it.slug ?? it.id,
      title: it.title,
      city: it.city,
      country: it.country,
      imageUrl: it.image_url,
      reason: 'Shared tags',
    });
  }

  return out.slice(0, limit);
}

interface Props {
  eventId: string;
  city?: string | null;
  limit?: number;
  className?: string;
}

export function EventMoreEvents({ eventId, city, limit = 8, className }: Props) {
  const trackClick = useTrackClick();
  const { data, isLoading } = useQuery({
    queryKey: ['event-more-events', eventId, city ?? null, limit],
    queryFn: () => fetchMergedEvents(eventId, city, limit),
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <section className={className} aria-label="More events">
        <h2 className="mb-4 text-title font-display">More events</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: limit }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-element" />
          ))}
        </div>
      </section>
    );
  }

  if (!data || data.length === 0) return null;

  return (
    <section className={className} aria-label="More events">
      <h2 className="mb-4 text-title font-display">More events</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {data.map((c) => {
          const location = [c.city, c.country].filter(Boolean).join(', ');
          return (
            <LocalizedLink
              key={c.id}
              to={`/events/${c.slug}`}
              onClick={() =>
                trackClick({ type: 'event', id: c.id }, 'similar', { reason: c.reason })
              }
              className="group flex flex-col overflow-hidden rounded-element border border-border bg-background no-underline text-inherit transition-colors hover:border-foreground/40"
            >
              <div className="relative aspect-[4/3] w-full bg-muted">
                <Image
                  imageUrl={isValidImageUrl(c.imageUrl) ? c.imageUrl : null}
                  optimizedUrl={c.optimizedUrl}
                  thumbnailUrl={c.thumbnailUrl}
                  preferThumb
                  alt=""
                  heightPx={140}
                  imageRole="thumb"
                  rounded="none"
                  fallbackEntityType="event"
                  fallbackKey={c.id}
                />
                <Badge variant="soft" className="absolute left-2 top-2 text-2xs">
                  {c.reason}
                </Badge>
              </div>
              <div className="flex flex-col gap-1.5 p-4">
                <span className="line-clamp-2 text-15 font-medium leading-snug">{c.title}</span>
                {location && (
                  <span className="truncate text-2xs text-muted-foreground">{location}</span>
                )}
              </div>
            </LocalizedLink>
          );
        })}
      </div>
    </section>
  );
}
