import { MapPin } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Badge } from '@/components/ui/badge';
import { useRelatedByTags } from '@/hooks/useRelatedByTags';
import { hrefForEntity } from '@/lib/searchRoutes';
import { resolveImageUrl } from '@/utils/resolveImageUrl';
import { getRandomFallbackImage } from '@/utils/fallbackImages';

const TYPE_LABEL: Record<string, string> = {
  venue: 'Venue',
  event: 'Event',
  news: 'News',
  marketplace: 'Shop',
  personality: 'Person',
  queer_village: 'Village',
  city: 'City',
  country: 'Country',
  group: 'Group',
};

export interface MoreLikeThisByTagProps {
  entityType: string;
  entityId: string;
  /** Minimum results before the section renders (hidden below this). */
  minItems?: number;
  limit?: number;
  className?: string;
  /** Heading text; defaults to "More like this". */
  title?: string;
}

/**
 * Cross-entity discovery rail: content of any type that shares the most tags
 * with the current entity. Backed by {@link useRelatedByTags}. Renders nothing
 * until there are at least `minItems` results.
 */
export function MoreLikeThisByTag({
  entityType,
  entityId,
  minItems = 3,
  limit = 8,
  className,
  title = 'More like this',
}: MoreLikeThisByTagProps) {
  const { data, isLoading } = useRelatedByTags(entityType, entityId, limit);

  if (isLoading || !data || data.length < minItems) return null;

  return (
    <section className={className}>
      <h2 className="mb-4 text-title font-display">{title}</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {data.map((item) => {
          const href = hrefForEntity({ type: item.type, slug: item.slug, title: item.title });
          const img =
            resolveImageUrl({ imageUrl: item.image_url }) ?? getRandomFallbackImage();
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
                    (e.target as HTMLImageElement).style.visibility = 'hidden';
                  }}
                />
                <Badge variant="soft" className="absolute left-2 top-2 text-2xs">
                  {TYPE_LABEL[item.type] ?? item.type}
                </Badge>
              </div>
              <div className="flex flex-col gap-1.5 p-4">
                <span className="line-clamp-2 text-15 font-medium leading-snug">
                  {item.title}
                </span>
                {location && (
                  <span className="inline-flex items-center gap-1.5 truncate text-2xs text-muted-foreground">
                    <MapPin size={11} className="shrink-0" />
                    {location}
                  </span>
                )}
              </div>
            </LocalizedLink>
          );
        })}
      </div>
    </section>
  );
}
