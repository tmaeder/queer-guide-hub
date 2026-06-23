import React from 'react';
import {
  ExternalLink,
  Share2,
  Star,
  Clock,
  Radio,
  MapPin,
  TrendingUp,
  Users,
  Heart,
  type LucideIcon,
} from 'lucide-react';
import { Image } from '@/components/ui/Image';
import type { FallbackTheme } from '@/utils/fallbackImages';
import { Badge } from '@/components/ui/badge';
import { formatDistance } from '@/lib/formatDistance';
import { timeUntil } from '@/utils/relativeTime';
import { iconForMarker, categoryLabel } from './mapIcons';
import type { MapPointSummary } from './mapPoint';

type CardVariant = 'popup' | 'rail' | 'hover';

export interface MapEntityCardProps {
  point: MapPointSummary;
  variant?: CardVariant;
  onNavigate?: (href: string) => void;
  onShare?: (point: MapPointSummary) => void;
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
 * Renders a dynamically-selected marker icon. Receiving the icon as a prop (vs.
 * rendering `iconForMarker(...)`'s return value as JSX inline) keeps the
 * component reference stable per React's static-components rule.
 */
function MarkerGlyph({
  icon: Icon,
  className,
  style,
}: {
  icon: LucideIcon;
  className?: string;
  style?: React.CSSProperties;
}) {
  return <Icon className={className} style={style} aria-hidden />;
}

/** Small signal pills shared across variants. */
function Signals({ point, compact }: { point: MapPointSummary; compact?: boolean }) {
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
  const Icon = iconForMarker(point.type, point.category);
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
              alt=""
              aspect="square"
              imageRole="thumb"
              fallbackEntityType={fallbackTheme}
              fallbackKey={point.id}
              fallbackIcon={Icon}
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

  const isRail = variant === 'rail';
  const clickable = isRail && point.linkTo && onNavigate;

  const wrapperClass = `flex w-full flex-col overflow-hidden ${
    isRail ? 'rounded-container border border-border bg-background' : ''
  } ${clickable ? 'cursor-pointer text-left' : ''} ${className ?? ''}`;

  const body = (
    <>
      {hasImage ? (
        <div className={`relative w-full ${isRail ? 'h-20' : 'h-28'}`}>
          <Image
            imageUrl={point.image}
            optimizedUrl={point.optimizedImage}
            thumbnailUrl={point.thumbImage}
            alt={point.name}
            aspect={isRail ? 'auto' : 'card'}
            heightPx={isRail ? 80 : 112}
            imageRole="cover"
            fallbackEntityType={fallbackTheme}
            fallbackKey={point.id}
            fallbackIcon={Icon}
            rounded="none"
          />
          <div className="absolute left-2 top-2">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-badge bg-background/90 text-foreground">
              <MarkerGlyph icon={Icon} className="h-3.5 w-3.5" />
            </span>
          </div>
        </div>
      ) : (
        // No photo (most venues): a muted ground with one category glyph in the
        // entity's accent color. Kept the SAME height as the image band so every
        // rail card lines up — uneven heights were the main "unpolished" tell.
        <div
          className={`flex w-full items-center justify-center bg-muted ${isRail ? 'h-20' : 'h-16'}`}
        >
          <MarkerGlyph icon={Icon} className="h-6 w-6" style={{ color: point.color }} />
        </div>
      )}

      <div className={`flex flex-col p-2 ${isRail ? 'gap-1' : 'gap-1.5'}`}>
        <div
          className={`truncate font-semibold leading-tight text-foreground ${
            isRail ? 'text-15' : 'text-body-lg'
          }`}
        >
          {point.name}
        </div>
        {metaLine && <div className="truncate text-13 text-muted-foreground">{metaLine}</div>}
        <Signals point={point} compact={isRail} />

        {variant === 'popup' && (
          <div className="mt-1 flex items-center gap-4">
            {point.linkTo && onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate(point.linkTo!)}
                className="inline-flex items-center gap-1 text-13 font-medium text-foreground underline"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                View details
              </button>
            )}
            {point.linkTo && onShare && (
              <button
                type="button"
                onClick={() => onShare(point)}
                className="inline-flex items-center gap-1 text-13 text-muted-foreground underline"
              >
                <Share2 className="h-3.5 w-3.5" aria-hidden />
                Share
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );

  // A native <button> gives the clickable rail card real keyboard + role
  // semantics (the popup block with nested buttons never renders when clickable).
  if (clickable) {
    return (
      <button type="button" className={wrapperClass} onClick={() => onNavigate!(point.linkTo!)}>
        {body}
      </button>
    );
  }

  return <div className={wrapperClass}>{body}</div>;
}

export default MapEntityCard;
