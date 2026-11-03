import { MapPin } from '@/components/icons';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Badge } from '@/components/ui/badge';
import { useRelatedByTags } from '@/hooks/useRelatedByTags';
import { hrefForEntity } from '@/lib/searchRoutes';
import { resolveImageUrl } from '@/utils/resolveImageUrl';
import { getFallbackImage, type FallbackTheme } from '@/utils/fallbackImages';
import { isValidImageUrl } from '@/lib/images/resolveEntityImage';

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
      return 'person';
    default:
      return 'place';
  }
}

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
  /** `type:id` keys already shown on the page (e.g. by the semantic rail
   *  above), so the two rails do not list the same people twice. */
  excludeKeys?: readonly string[];
}

/** Initials for a person with no photo. */
function personInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
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
  excludeKeys,
}: MoreLikeThisByTagProps) {
  // Over-fetch by the number of excluded keys so the rail still fills to
  // `limit` after the people shown elsewhere are dropped.
  const { data, isLoading } = useRelatedByTags(
    entityType,
    entityId,
    limit + (excludeKeys?.length ?? 0),
  );
  const excluded = new Set(excludeKeys ?? []);
  const items = (data ?? [])
    .filter((item) => !excluded.has(`${item.type}:${item.id}`))
    .slice(0, limit);

  if (isLoading || items.length < minItems) return null;

  return (
    <section className={className}>
      <h2 className="mb-4 text-title font-bold">{title}</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((item) => {
          const href = hrefForEntity({ type: item.type, slug: item.slug, title: item.title });
          // A person with no photo gets their initials, never stock art: an
          // abstract painting under a name reads as that person's portrait
          // (Wendy Carlos, Michail Kusmin on /personalities/pyotr-ilyich-tchaikovsky).
          const isPerson = item.type === 'personality';
          const fallback = isPerson ? null : getFallbackImage(fallbackTheme(item.type), item.id);
          const img =
            (isValidImageUrl(item.image_url)
              ? resolveImageUrl({ imageUrl: item.image_url })
              : null) ?? fallback;
          const location = [item.city, item.country].filter(Boolean).join(', ');
          return (
            <LocalizedLink
              key={`${item.type}:${item.id}`}
              to={href}
              className="group flex flex-col overflow-hidden rounded-element bg-surface-container no-underline text-inherit transition-colors"
            >
              <div className="relative aspect-[4/3] w-full bg-muted">
                {isPerson && (
                  <span
                    aria-hidden="true"
                    data-testid="person-monogram"
                    className="absolute inset-0 flex items-center justify-center font-display text-display text-muted-foreground"
                  >
                    {personInitials(item.title ?? '')}
                  </span>
                )}
                {img && (
                  <img
                    src={img}
                    alt=""
                    role="presentation"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="absolute inset-0 h-full w-full object-cover"
                    onError={(e) => {
                      if (fallback && e.currentTarget.src !== fallback) {
                        e.currentTarget.src = fallback;
                      } else if (!fallback) {
                        // A broken photo of a person: show the initials beneath.
                        e.currentTarget.style.display = 'none';
                      }
                    }}
                  />
                )}
                <Badge variant="soft" className="absolute left-2 top-2 text-2xs">
                  {TYPE_LABEL[item.type] ?? item.type}
                </Badge>
              </div>
              <div className="flex flex-col gap-1.5 p-4">
                <span className="line-clamp-2 text-15 font-medium leading-snug">{item.title}</span>
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
