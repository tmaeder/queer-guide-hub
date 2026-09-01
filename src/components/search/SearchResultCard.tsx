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
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { formatDistance } from '@/lib/formatDistance';
import { formatNewsTag } from '@/lib/newsTags';
import { hrefForSearchResult } from '@/lib/searchRoutes';
import { resolveType } from '@/lib/searchTaxonomy';
import type { SearchResult } from '@/hooks/useSearch';
import { BoostReasonBadge } from './BoostReasonBadge';
import { SearchFeedbackButtons } from './SearchFeedbackButtons';
import { QuietAddToTripButton } from '@/components/trips/QuietAddToTripButton';
import { CityNetwork } from '@/components/home/subway/CityNetwork';
import { hasCityNetwork } from '@/components/home/subway/cityNetworkGeometry';

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
  /**
   * Fired when the card's link is activated. ANALYTICS ONLY — the card
   * navigates itself via a real anchor, so a handler that also calls
   * `navigate()` would push a duplicate history entry and cost the reader two
   * back presses.
   */
  onActivate?: (result: SearchResult) => void;
  /** Refine the current search by a tag (chip click). Omit to hide tag chips. */
  onTagClick?: (tag: string) => void;
  /** Tags already applied to the search — rendered as active, click is a no-op. */
  activeTags?: string[];
}

const MAX_CARD_TAGS = 3;

/**
 * One search result — bold monochrome, list + grid variants sharing the
 * popover's visual language (semibold name, muted subtitle, bordered
 * thumbnail, full-bleed hover). Memoized: only re-renders when its own
 * result/view/query change.
 *
 * The whole card is the click target, and it is a real `<a href>` — an
 * absolutely-positioned `LocalizedLink` rendered as the LAST child of the
 * card, a SIBLING of its content rather than a wrapper. Until 2026-08-29 this
 * was a `<div role="button">` with an onClick, which meant no result on
 * /search could be middle-clicked, cmd-clicked or opened in a new tab, screen
 * readers announced "button" instead of "link", and a crawler found no path
 * out of /search at all (measured on prod: 20 rows, 0 anchors among them).
 *
 * It must stay a sibling: every row carries 2-3 real `<button>`s (feedback
 * thumbs, add-to-trip), so wrapping the card in the anchor would nest them
 * inside it — axe `nested-interactive`, serious, WCAG 4.1.2. Those buttons and
 * the tag chips therefore need `relative z-10` to sit ABOVE the overlay, and
 * the overlay needs `no-underline` (the unlayered `li a:not(.no-underline)`
 * rule in index.css would otherwise force `position: relative` and collapse
 * it) plus an `aria-label` (it has no text of its own).
 */
function SearchResultCardImpl({
  result,
  view,
  query,
  onActivate,
  onTagClick,
  activeTags,
}: SearchResultCardProps) {
  const { t } = useTranslation();
  if (!result?.objectID) return null;

  // A city with no image falls back to a generic Globe glyph. Its own network
  // identifies the place; the glyph identifies only the entity type.
  const showNetwork = !result.imageUrl && result.type === 'city' && hasCityNetwork(result.slug);
  const title = result.title || (result as unknown as { name?: string }).name || '';
  if (!title) return null;

  const href = hrefForSearchResult(result, title);
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

  // The card-wide click target. Overlay SIBLING, never a wrapper — see the
  // component doc above.
  const overlayLink = (
    <LocalizedLink
      to={href}
      aria-label={title}
      onClick={() => onActivate?.(result)}
      className="absolute inset-0 rounded-element no-underline"
    />
  );

  // Clickable tag chips — refine the current search by the tag rather than
  // navigating, so they sit above the overlay (`relative z-10`) and are capped
  // so cards stay calm.
  const tagSet = new Set((activeTags ?? []).map((v) => v.toLowerCase()));
  const tagChips =
    onTagClick && Array.isArray(result.tags) && result.tags.length > 0 ? (
      <div className="relative z-10 flex flex-wrap gap-1">
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
      <div className="group relative flex cursor-pointer flex-col overflow-hidden rounded-element transition-colors hover:bg-accent">
        <div className="relative aspect-[16/9] overflow-hidden bg-muted">
          {showNetwork ? (
            <div className="flex h-full w-full items-center justify-center bg-background p-2">
              <CityNetwork slug={result.slug} variant="thumb" className="h-full" />
            </div>
          ) : result.imageUrl ? (
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
            <div className="relative z-10 flex items-center gap-2">
              {ratingEl}
              {tripEntity && <QuietAddToTripButton variant="inline" entity={tripEntity} />}
              <SearchFeedbackButtons
                entity={{ type: result.type, id: result.objectID }}
                query={query}
              />
            </div>
          </div>
          <BoostReasonBadge reason={result._boostReason} />
        </div>
        {overlayLink}
      </div>
    );
  }

  // list
  return (
    <div className="group relative flex cursor-pointer items-center gap-4 rounded-element p-4 transition-colors hover:bg-accent">
      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-element bg-muted">
        {showNetwork ? (
          <CityNetwork slug={result.slug} variant="thumb" className="p-1.5" />
        ) : result.imageUrl ? (
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
        <div className="relative z-10 flex items-center gap-2">
          {tripEntity && <QuietAddToTripButton variant="inline" entity={tripEntity} />}
          <SearchFeedbackButtons
            entity={{ type: result.type, id: result.objectID }}
            query={query}
          />
        </div>
      </div>
      {overlayLink}
    </div>
  );
}

export const SearchResultCard = React.memo(SearchResultCardImpl);
