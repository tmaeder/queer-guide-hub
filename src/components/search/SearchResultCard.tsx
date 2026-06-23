import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  MapPin,
  Calendar,
  Star,
  Navigation,
  Sparkles,
  Building2,
  CalendarDays,
  ShoppingBag,
  Newspaper,
  Globe,
  Users,
  Tag,
  HelpCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatDistance } from '@/lib/formatDistance';
import { formatNewsTag } from '@/lib/newsTags';
import { resolveType } from '@/lib/searchTaxonomy';
import type { SearchResult } from '@/hooks/useSearch';
import { BoostReasonBadge } from './BoostReasonBadge';
import { SearchFeedbackButtons } from './SearchFeedbackButtons';
import { QuietAddToTripButton } from '@/components/trips/QuietAddToTripButton';

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  venue: Building2,
  event: CalendarDays,
  marketplace: ShoppingBag,
  news: Newspaper,
  personality: Users,
  city: Globe,
  country: Globe,
  queer_village: MapPin,
  tag: Tag,
};

function TypeIcon({ type, className }: { type: string; className?: string }) {
  const id = resolveType(type) ?? type;
  const Cmp = TYPE_ICONS[id] ?? HelpCircle;
  return <Cmp className={className} />;
}

function typeLabel(type: string) {
  return (resolveType(type) ?? type).replace(/_/g, ' ');
}

export interface SearchResultCardProps {
  result: SearchResult;
  view: 'list' | 'grid';
  query: string;
  onSelect: (result: SearchResult) => void;
  /** Refine the current search by a tag (chip click). Omit to hide tag chips. */
  onTagClick?: (tag: string) => void;
  /** Tags already applied to the search — rendered as active, click is a no-op. */
  activeTags?: string[];
}

const MAX_CARD_TAGS = 3;

/**
 * One search result — bold monochrome, list + grid variants sharing the
 * popover's visual language (semibold name, muted subtitle, bordered
 * thumbnail, full-bleed hover). The whole card is the click target; the
 * redundant "View" button is gone. Memoized: only re-renders when its own
 * result/view/query change.
 */
function SearchResultCardImpl({
  result,
  view,
  query,
  onSelect,
  onTagClick,
  activeTags,
}: SearchResultCardProps) {
  const { t } = useTranslation();
  if (!result?.objectID) return null;
  const title = result.title || (result as unknown as { name?: string }).name || '';
  if (!title) return null;

  const distance = formatDistance(result._distance_m);
  const dateLabel = result.date ? new Date(result.date).toLocaleDateString() : null;
  const featured = Boolean(result.metadata?.featured);
  const price = result.price ? `$${result.price}` : null;

  // Add-to-trip is only meaningful for venues/events (hotels have their own
  // detail CTA; cities/countries/news aren't itinerary places). Search hits
  // lack city_id/country_id, so "create new trip" inside the dialog is the
  // degraded path — "add to an existing trip" works fine.
  const canonicalType = resolveType(result.type) ?? result.type;
  const tripEntity =
    canonicalType === 'venue' || canonicalType === 'event'
      ? { type: canonicalType as 'venue' | 'event', id: result.objectID, name: title }
      : null;

  // Subtitle: location · (distance | date) · rating — compact, no icon soup.
  const meta = [result.location, distance ?? dateLabel].filter(Boolean).join(' · ');

  const typeChip = (
    <Badge variant="outline" className="gap-1 rounded-badge text-2xs capitalize">
      <TypeIcon type={result.type} className="h-3 w-3" />
      {typeLabel(result.type)}
    </Badge>
  );
  const featuredChip = featured && (
    <Badge variant="secondary" className="gap-1 rounded-badge text-2xs">
      <Sparkles className="h-3 w-3" />
      {t('search.featured', 'Featured')}
    </Badge>
  );
  const ratingEl = result.rating ? (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Star className="h-3 w-3 fill-current" />
      {result.rating}
    </span>
  ) : null;
  const distanceEl = distance ? (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Navigation className="h-3 w-3" />
      {distance}
    </span>
  ) : null;

  // Clickable tag chips — refine the current search by the tag. Subordinate to
  // the card's own click target (stopPropagation), capped so cards stay calm.
  const tagSet = new Set((activeTags ?? []).map((v) => v.toLowerCase()));
  const tagChips =
    onTagClick && Array.isArray(result.tags) && result.tags.length > 0 ? (
      <div className="flex flex-wrap gap-1">
        {result.tags.slice(0, MAX_CARD_TAGS).map((tag) => {
          const active = tagSet.has(tag.toLowerCase());
          return (
            <Badge
              key={tag}
              variant="outline"
              className="cursor-pointer gap-1 rounded-badge text-2xs hover:bg-accent"
              data-active={active || undefined}
              onClick={(e) => {
                e.stopPropagation();
                if (!active) onTagClick(tag);
              }}
            >
              <Tag className="h-2.5 w-2.5" />
              {formatNewsTag(tag)}
            </Badge>
          );
        })}
      </div>
    ) : null;

  if (view === 'grid') {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelect(result)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSelect(result);
        }}
        className="group flex cursor-pointer flex-col overflow-hidden rounded-element border border-border transition-colors hover:bg-accent"
      >
        <div className="relative aspect-[16/9] overflow-hidden bg-muted">
          {result.imageUrl ? (
            <img
              src={result.imageUrl}
              alt=""
              loading="lazy"
              decoding="async"
              sizes="(max-width: 768px) 100vw, (max-width: 1280px) 33vw, 25vw"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <TypeIcon type={result.type} className="h-8 w-8 text-muted-foreground" />
            </div>
          )}
          <div className="absolute left-2 top-2 flex gap-1">{typeChip}</div>
          {featuredChip && <div className="absolute right-2 top-2">{featuredChip}</div>}
        </div>
        <div className="flex flex-1 flex-col gap-1 p-4">
          <h3 className="line-clamp-2 text-15 font-semibold">{title}</h3>
          {meta && <p className="truncate text-xs text-muted-foreground">{meta}</p>}
          {tagChips && <div className="pt-1">{tagChips}</div>}
          <div className="mt-auto flex items-center justify-between pt-2">
            {price ? <span className="text-sm font-semibold">{price}</span> : <span />}
            <div className="flex items-center gap-2">
              {ratingEl}
              {tripEntity && <QuietAddToTripButton variant="inline" entity={tripEntity} />}
              <SearchFeedbackButtons entity={{ type: result.type, id: result.objectID }} query={query} />
            </div>
          </div>
          <BoostReasonBadge reason={result._boostReason} />
        </div>
      </div>
    );
  }

  // list
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(result)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSelect(result);
      }}
      className="group flex cursor-pointer items-center gap-4 rounded-element border border-border p-4 transition-colors hover:bg-accent"
    >
      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-element border border-border bg-muted">
        {result.imageUrl ? (
          <img
            src={result.imageUrl}
            alt=""
            loading="lazy"
            decoding="async"
            width={64}
            height={64}
            className="h-full w-full object-cover"
          />
        ) : (
          <TypeIcon type={result.type} className="h-6 w-6 text-muted-foreground" />
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          {typeChip}
          {featuredChip}
          <BoostReasonBadge reason={result._boostReason} />
        </div>
        <h3 className="truncate text-title font-semibold leading-tight">{title}</h3>
        {result.description && (
          <p className="line-clamp-1 text-sm text-muted-foreground">{result.description}</p>
        )}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {result.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {result.location}
            </span>
          )}
          {distanceEl}
          {!distance && dateLabel && (
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {dateLabel}
            </span>
          )}
          {ratingEl}
        </div>
        {tagChips}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-2">
        {price && <span className="text-base font-semibold">{price}</span>}
        <div className="flex items-center gap-2">
          {tripEntity && <QuietAddToTripButton variant="inline" entity={tripEntity} />}
          <SearchFeedbackButtons entity={{ type: result.type, id: result.objectID }} query={query} />
        </div>
      </div>
    </div>
  );
}

export const SearchResultCard = React.memo(SearchResultCardImpl);
