import { TransitIcon } from '@/components/transit/TransitIcon';
import type { TransitIconName } from '@/components/transit/transitIconPaths';
import type { FallbackTheme } from '@/utils/fallbackImages';

/**
 * The image-less card art: one station on a stretch of line, the entity's
 * own icon inside the station disc — the marketplace department tile's
 * language, applied to every card that has no photo.
 *
 * It replaced a random stock texture (paint splashes, bokeh), which said
 * nothing about the item and read as a photo that had failed to load.
 */
const THEME_ICON: Record<FallbackTheme, TransitIconName> = {
  venue: 'nightlife',
  event: 'events',
  hotel: 'housing',
  place: 'pin',
  person: 'profile',
  news: 'news',
  marketplace: 'shop',
  default: 'pin',
};

/** Line crest varies per item so a grid of plates does not repeat one shape. */
function lift(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return (Math.abs(h) % 5) * 6 - 12;
}

export function StationPlate({
  theme = 'default',
  fallbackKey = '',
  icon,
  className,
}: {
  theme?: FallbackTheme;
  fallbackKey?: string;
  /** Overrides the theme's icon — a card that has its own glyph (a glossary term). */
  icon?: TransitIconName;
  className?: string;
}) {
  const d = lift(`${theme}:${fallbackKey}`);
  return (
    <svg
      viewBox="0 0 400 250"
      preserveAspectRatio="xMidYMid slice"
      className={className ?? 'block h-full w-full'}
      aria-hidden="true"
      focusable="false"
      data-fallback="station"
    >
      <rect width="400" height="250" className="fill-surface-container-low" />
      <path
        d={`M -10 ${110 + d} C 90 ${100 + d} 140 ${145 - d} 200 125 C 260 ${105 + d} 310 ${150 - d} 410 ${140 - d}`}
        fill="none"
        strokeWidth={12}
        strokeLinecap="round"
        className="stroke-track-yellow"
      />
      <circle cx="200" cy="125" r="56" strokeWidth={5} className="fill-background stroke-foreground" />
      <g transform="translate(170 95) scale(0.6)">
        <TransitIcon name={icon ?? THEME_ICON[theme]} size={100} ticks={false} />
      </g>
    </svg>
  );
}
