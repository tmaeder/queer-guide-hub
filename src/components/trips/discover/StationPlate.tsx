import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { StationRing } from '@/components/transit/StationRing';
import { TransitIcon } from '@/components/transit/TransitIcon';
import { getLegalityBadge } from '@/lib/lgbtLegality';
import type { Station } from '@/lib/lines/generateLine';
import { stationHasEventIn, type SeasonWindow } from '@/lib/lines/seasons';

/**
 * One stop on the generated line.
 *
 * NO IMAGE, deliberately. Every station plate in this system — IntentMap,
 * EraLineNav — is type only. A picture inside a plate parked on a curve blows
 * the lane-height budget the geometry depends on (`ROUTE_V.row` is the plate's
 * min-height plus its gap, and nothing measures it at runtime), and it would
 * put three to five LCP candidates behind an arrival animation.
 *
 * Structure notes that are load-bearing rather than stylistic:
 *
 *  * The plate is a `<div>` with the link as an absolutely-positioned LAST
 *    CHILD, not an `<a>` wrapping the content. It carries a swap button, and a
 *    `<button>` inside an `<a>` is axe `nested-interactive` (serious, WCAG
 *    4.1.2) — guarded by `e2e/nested-interactive.spec.ts`.
 *  * `no-underline` on that link is load-bearing: the unlayered
 *    `li a:not(.no-underline)` rule in index.css sets `display: inline`, which
 *    collapses the plate and kills every `lg:` position on it.
 *  * The ring is a SIBLING of the plate, never a child. `card-lift` translates
 *    the plate, and a ring inside would slide off the track with it.
 *  * `card-lift` alone — no `hover:bg-foreground` on the same surface. A card
 *    fills ink or it lifts, never both.
 *  * `line-clamp-2` on the prose is not typography, it is geometry: it is the
 *    only thing holding the plate at the height `ROUTE_V.row` assumes.
 *
 * Safety is INK. Track colours never encode risk, and `--destructive` is
 * rationed to danger *to the reader* — a legal-status line on a discovery card
 * is not a payment failure.
 */

interface StationPlateProps {
  station: Station;
  index: number;
  /** Horizontal position, as a percentage of the stage. */
  sx: string;
  sy: string;
  lane: 'above' | 'below';
  /** False only while the arrival animation has not reached this stop yet. */
  revealed: boolean;
  animate: boolean;
  window: SeasonWindow | null;
  onSwap?: (stationId: string) => void;
}

export function StationPlate({
  station,
  index,
  sx,
  sy,
  lane,
  revealed,
  animate,
  window: seasonWindow,
  onSwap,
}: StationPlateProps) {
  const { t } = useTranslation();
  const badge = getLegalityBadge({
    equality_score: station.equalityScore,
    lgbti_criminalization: station.criminalization,
  });
  const showEvent = stationHasEventIn(station, seasonWindow) && station.nextEventTitle;

  // `editorial_hook` is filled on 17% of the pool, so `description` is the
  // workhorse here, not the fallback. Both are per-city prose; safety_notes is
  // NOT used as a fact line — 99% of them are the same templated sentence about
  // country law, which reads as local knowledge and is not.
  const hook = station.editorialHook ?? station.description;

  return (
    <li
      style={{ '--sx': sx, '--sy': sy } as CSSProperties}
      className={cn(
        'group relative flex items-start gap-2',
        'lg:absolute lg:left-[var(--sx)] lg:top-[var(--sy)] lg:block lg:h-0 lg:w-0 lg:gap-0',
      )}
    >
      {/* The ring column's height IS ROUTE_V.row and its width IS
          ROUTE_V.gutter, so the ring lands exactly on the point the vertical
          SVG drew. Both come from the same custom property as the plate box —
          when those two numbers were allowed to disagree, every ring below the
          first drifted further off the line than the last. */}
      <span
        aria-hidden
        className={cn(
          'pointer-events-none flex h-[var(--route-plate-h)] w-10 shrink-0 items-center justify-center',
          'lg:absolute lg:left-0 lg:top-0 lg:h-auto lg:w-auto lg:-translate-x-1/2 lg:-translate-y-1/2',
          animate && (revealed ? 'station-pop' : 'opacity-0'),
        )}
      >
        <StationRing state="typed" track="blue" className="lg:h-6 lg:w-6 lg:border-[4px]" />
      </span>

      <div
        className={cn(
          // A FIXED box, not a min-height, at every breakpoint: both the band
          // height (desktop) and the rail row (mobile) are derived from this
          // number, so content has to clip into it rather than push past it.
          'card-lift relative h-[var(--route-plate-h)] min-w-0 flex-1 overflow-hidden border-[3px] border-foreground bg-background p-4',
          'lg:absolute lg:left-1/2 lg:w-48 lg:flex-none lg:-translate-x-1/2 xl:w-56',
          lane === 'above' ? 'lg:bottom-14' : 'lg:top-14',
          animate && (revealed ? 'station-arrive' : 'opacity-0'),
        )}
      >
        {/* Ordinal and swap share one row. The swap control started life as a
            labelled button below the content and was clipped by the plate's
            fixed height — and the plate height cannot grow, because the band
            height is derived from it. Up here it costs no vertical space at
            all; `aria-label` carries the full name that the visible text no
            longer does. */}
        <div className="flex items-start justify-between gap-2">
          <span className="text-2xs font-bold uppercase tracking-label tabular-nums text-muted-foreground">
            {String(index + 1).padStart(2, '0')}
          </span>
          {onSwap && (
            // z-10 lifts it above the overlay link. Without it the link
            // swallows the click and the button is decorative.
            <button
              type="button"
              onClick={() => onSwap(station.id)}
              aria-label={t('trips.discover.route.swapStopAria', 'Swap stop {{n}}, {{city}}', {
                n: index + 1,
                city: station.name,
              })}
              className={cn(
                'relative z-10 -mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center',
                'border-2 border-foreground transition-colors duration-fast',
                'hover:bg-foreground hover:text-background',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                'focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              )}
            >
              <TransitIcon name="tune" size={14} />
            </button>
          )}
        </div>
        <p className="mt-0.5 text-title font-bold leading-tight">{station.name}</p>
        <p className="text-13 text-muted-foreground">{station.countryName}</p>

        {hook && (
          <p className="mt-2 line-clamp-2 text-13 leading-relaxed text-muted-foreground">{hook}</p>
        )}

        <p className="mt-2 flex flex-wrap gap-x-4 text-xs2 font-bold tabular-nums">
          <span>
            {t('trips.discover.station.venues', '{{count}} places', { count: station.venueCount })}
          </span>
          {station.villageCount > 0 && station.villageName && (
            <span className="truncate font-medium text-muted-foreground">
              {station.villageName}
            </span>
          )}
        </p>

        {badge && (
          <p className="mt-1 flex items-center gap-1 text-xs2 text-muted-foreground">
            <TransitIcon name={badge.level === 'protected' ? 'info-point' : 'alerts'} size={12} />
            <span>{badge.label}</span>
          </p>
        )}

        {showEvent && (
          <p className="mt-2 truncate text-13" title={station.nextEventTitle ?? undefined}>
            {station.nextEventTitle}
          </p>
        )}

        <LocalizedLink
          to={`/city/${station.slug}`}
          className="absolute inset-0 no-underline"
          aria-label={t('trips.discover.route.stopAria', 'Stop {{n}}: {{city}}, {{country}}', {
            n: index + 1,
            city: station.name,
            country: station.countryName,
          })}
        />
      </div>
    </li>
  );
}
