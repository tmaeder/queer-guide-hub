import { Star, Clock, Radio, MapPin, TrendingUp, Users, Heart } from '@/components/icons';
import { TransitIcon } from '@/components/transit/TransitIcon';
import type { TransitIconName } from '@/components/transit/transitIconPaths';
import { Image } from '@/components/ui/Image';
import type { FallbackTheme } from '@/utils/fallbackImages';
import { Badge } from '@/components/ui/badge';
import { formatDistance } from '@/lib/formatDistance';
import { timeUntil } from '@/utils/relativeTime';
import { iconForMarker, categoryLabel } from './mapIcons';
import type { MapStation } from './mapDomain';
import { QuietAddToTripButton } from '@/components/trips/QuietAddToTripButton';

type CardVariant = 'popup' | 'rail' | 'hover';

export interface MapEntityCardProps {
  point: MapStation;
  variant?: CardVariant;
  onNavigate?: (href: string) => void;
  onShare?: (point: MapStation) => void;
  className?: string;
}

const FALLBACK_THEME: Record<string, FallbackTheme> = {
  venues: 'venue',
  events: 'event',
  hotels: 'hotel',
  restrooms: 'place',
  neighbourhoods: 'place',
  cities: 'place',
  countries: 'place',
};

function priceLabel(range?: number | null): string | null {
  if (!range || range < 1) return null;
  return '€'.repeat(Math.min(range, 4));
}

/**
 * Renders a dynamically-selected marker icon. `iconForMarker` now returns a
 * TransitIconName rather than a component, so there is no static-components
 * rule to work around — this stays as a named wrapper only because three call
 * sites want the same default sizing behaviour.
 */
function MarkerGlyph({ icon, size = 20 }: { icon: TransitIconName; size?: number }) {
  return <TransitIcon name={icon} size={size} />;
}

/** Small signal pills shared across variants. */
function Signals({ point, compact }: { point: MapStation; compact?: boolean }) {
  const price = priceLabel(point.priceRange);
  const dist = point.distanceKm != null ? formatDistance(point.distanceKm * 1000) : null;
  const countdown = point.type === 'events' && !point.live ? timeUntil(point.startDate) : null;
  // "Trending" = editorially featured AND high trust. Honest proxy until a
  // real engagement/check-in signal exists; otherwise just "Featured".
  const trending = point.featured && (point.trustScore ?? 0) >= 80;

  // Compact (rail): one fixed, non-wrapping line so every card is the same
  // height. Slot 1 = the single most important status; slot 2 = distance
  // (the most useful at-a-glance fact), else price.
  if (compact) {
    const status =
      point.type === 'venues' && point.openNow === true ? (
        <Badge variant="soft" className="gap-1">
          <Clock className="h-3 w-3" aria-hidden />
          Open now
        </Badge>
      ) : point.type === 'events' && point.live ? (
        <Badge variant="soft" className="gap-1">
          <Radio className="h-3 w-3" aria-hidden />
          On now
        </Badge>
      ) : countdown ? (
        <Badge variant="soft" className="gap-1">
          <Clock className="h-3 w-3" aria-hidden />
          {countdown}
        </Badge>
      ) : trending ? (
        <Badge variant="soft" className="gap-1">
          <TrendingUp className="h-3 w-3" aria-hidden />
          Trending
        </Badge>
      ) : point.featured ? (
        <Badge variant="soft" className="gap-1">
          <Star className="h-3 w-3" aria-hidden />
          Featured
        </Badge>
      ) : point.favorited ? (
        <Badge variant="soft" className="gap-1">
          <Heart className="h-3 w-3 fill-current" aria-hidden />
          Saved
        </Badge>
      ) : null;
    const secondary = dist ? (
      <Badge variant="outline" className="gap-1">
        <MapPin className="h-3 w-3" aria-hidden />
        {dist}
      </Badge>
    ) : price ? (
      <Badge variant="outline">{price}</Badge>
    ) : null;
    if (!status && !secondary) return null;
    return (
      <div className="flex items-center gap-1 overflow-hidden">
        {status}
        {secondary}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {point.favorited && (
        <Badge variant="soft" className="gap-1">
          <Heart className="h-3 w-3 fill-current" aria-hidden />
          Saved
        </Badge>
      )}
      {trending ? (
        <Badge variant="soft" className="gap-1">
          <TrendingUp className="h-3 w-3" aria-hidden />
          Trending
        </Badge>
      ) : (
        point.featured && (
          <Badge variant="soft" className="gap-1">
            <Star className="h-3 w-3" aria-hidden />
            Featured
          </Badge>
        )
      )}
      {point.type === 'venues' && point.openNow === true && (
        <Badge variant="soft" className="gap-1">
          <Clock className="h-3 w-3" aria-hidden />
          Open now
        </Badge>
      )}
      {point.type === 'events' && point.live && (
        <Badge variant="soft" className="gap-1">
          <Radio className="h-3 w-3" aria-hidden />
          On now
        </Badge>
      )}
      {countdown && (
        <Badge variant="outline" className="gap-1">
          <Clock className="h-3 w-3" aria-hidden />
          {countdown}
        </Badge>
      )}
      {point.type === 'events' && (point.attendeeCount ?? 0) > 0 && (
        <Badge variant="outline" className="gap-1">
          <Users className="h-3 w-3" aria-hidden />
          {point.attendeeCount} going
        </Badge>
      )}
      {price && <Badge variant="outline">{price}</Badge>}
      {dist && (
        <Badge variant="outline" className="gap-1">
          <MapPin className="h-3 w-3" aria-hidden />
          {dist}
        </Badge>
      )}
    </div>
  );
}

/**
 * Rich, React-rendered card for a single map point. Replaces the old
 * inline-HTML popup string and also backs the spotlight rail + hover preview.
 * Monochrome + semantic tokens; lives under src/components/map (ESLint-exempt).
 */
export function MapEntityCard({
  point,
  variant = 'popup',
  onNavigate,
  onShare,
  className,
}: MapEntityCardProps) {
  const icon = iconForMarker(point.type, point.category);
  const fallbackTheme = FALLBACK_THEME[point.type] ?? 'default';
  // "other" is a non-informative catch-all category — drop it from the label.
  const cat = point.category && point.category.toLowerCase() !== 'other' ? point.category : '';
  const metaLine =
    point.type === 'venues'
      ? [categoryLabel(cat), point.city].filter(Boolean).join(' · ')
      : point.type === 'events'
        ? [point.subtitle, point.venueName || point.city].filter(Boolean).join(' · ')
        : point.subtitle;
  const hasImage = Boolean(point.image || point.optimizedImage || point.thumbImage);

  if (variant === 'hover') {
    return (
      <div className={`flex items-center gap-2 ${className ?? ''}`}>
        {hasImage && (
          <div className="h-9 w-9 shrink-0 overflow-hidden rounded-element">
            <Image
              imageUrl={point.image}
              optimizedUrl={point.optimizedImage}
              thumbnailUrl={point.thumbImage}
              fit={point.isLogo ? 'contain' : 'cover'}
              alt=""
              aspect="square"
              imageRole="thumb"
              fallbackEntityType={fallbackTheme}
              fallbackKey={point.id}
            />
          </div>
        )}
        <div className="min-w-0">
          <div className="truncate text-13 font-semibold text-foreground">{point.name}</div>
          {metaLine && <div className="truncate text-2xs text-muted-foreground">{metaLine}</div>}
        </div>
      </div>
    );
  }

  // Rail: a compact horizontal row — a small leading tile (photo thumbnail when
  // present, else one category glyph) beside the text. Roughly half the height
  // of a media-on-top card, and the icon is sized sensibly instead of floating
  // in a tall empty band (most venues have no photo).
  if (variant === 'rail') {
    return (
      <div className="flex w-full items-center gap-2 overflow-hidden rounded-container bg-surface-container p-2">
        {hasImage ? (
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-element">
            <Image
              imageUrl={point.image}
              optimizedUrl={point.optimizedImage}
              thumbnailUrl={point.thumbImage}
              fit={point.isLogo ? 'contain' : 'cover'}
              alt=""
              aspect="square"
              imageRole="thumb"
              fallbackEntityType={fallbackTheme}
              fallbackKey={point.id}
            />
          </div>
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-element bg-muted">
            <MarkerGlyph icon={icon} size={20} />
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="truncate text-15 font-semibold leading-tight text-foreground">
            {point.name}
          </div>
          {metaLine && <div className="truncate text-13 text-muted-foreground">{metaLine}</div>}
          <Signals point={point} compact />
        </div>
      </div>
    );
  }

  // Popup (the only remaining variant): media-on-top card with inline actions.
  const body = (
    <>
      {hasImage ? (
        <div className="relative h-32 w-full">
          <Image
            imageUrl={point.image}
            optimizedUrl={point.optimizedImage}
            thumbnailUrl={point.thumbImage}
            fit={point.isLogo ? 'contain' : 'cover'}
            alt={point.name}
            aspect="card"
            heightPx={128}
            imageRole="cover"
            fallbackEntityType={fallbackTheme}
            fallbackKey={point.id}
            rounded="none"
          />
          <span className="absolute left-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-card text-foreground shadow-soft">
            <MarkerGlyph icon={icon} size={16} />
          </span>
        </div>
      ) : (
        <div className="flex h-20 w-full items-center justify-center bg-muted">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-card text-foreground shadow-soft">
            <MarkerGlyph icon={icon} size={24} />
          </span>
        </div>
      )}

      <div className="flex flex-col gap-1 p-4">
        {point.linkTo && onNavigate ? (
          <button
            type="button"
            onClick={() => onNavigate(point.linkTo!)}
            className="line-clamp-2 text-left text-title font-bold leading-tight text-foreground hover:underline"
          >
            {point.name}
          </button>
        ) : (
          <div className="line-clamp-2 text-title font-bold leading-tight text-foreground">
            {point.name}
          </div>
        )}
        {metaLine && <div className="truncate text-13 text-muted-foreground">{metaLine}</div>}
        <div className="mt-1">
          <Signals point={point} />
        </div>

        <div className="mt-4 flex items-center gap-2">
          {point.linkTo && onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate(point.linkTo!)}
              className="inline-flex h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-element bg-foreground px-4 text-13 font-bold text-background hover:opacity-90"
            >
              View details
            </button>
          )}
          {/* Every pin, detail page or not, can be walked to. */}
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${point.lat},${point.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Directions"
            title="Directions"
            className={`no-underline inline-flex h-11 items-center justify-center gap-1.5 rounded-element bg-muted text-13 font-bold text-foreground hover:bg-foreground hover:text-background ${
              point.linkTo && onNavigate ? 'w-11 shrink-0' : 'flex-1 px-4'
            }`}
          >
            <TransitIcon name="locate" size={18} aria-hidden />
            {!(point.linkTo && onNavigate) && 'Directions'}
          </a>
          {point.linkTo && onShare && (
            <button
              type="button"
              onClick={() => onShare(point)}
              aria-label="Share"
              title="Share"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-element bg-muted text-foreground hover:bg-foreground hover:text-background"
            >
              <TransitIcon name="share" size={18} aria-hidden />
            </button>
          )}
          {(point.type === 'venues' || point.type === 'events') && (
            <QuietAddToTripButton
              variant="inline"
              className="h-11 w-11 shrink-0 border-0 bg-muted"
              entity={{
                type: point.type === 'venues' ? 'venue' : 'event',
                id: point.id,
                name: point.name,
                latitude: point.lat,
                longitude: point.lng,
                category: point.category ?? null,
              }}
            />
          )}
        </div>
      </div>
    </>
  );

  return <div className={`flex w-full flex-col overflow-hidden ${className ?? ''}`}>{body}</div>;
}

export default MapEntityCard;
