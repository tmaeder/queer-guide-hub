import { useEffect, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { isRtlLocale } from '@/lib/locale';
import {
  ROUTE_BAND_H,
  ROUTE_H,
  ROUTE_PLATE_H,
  ROUTE_V,
  horizontalLine,
  pct,
  verticalLine,
} from '@/components/transit/lineGeometry';
import type { Station } from '@/lib/lines/generateLine';
import type { SeasonWindow } from '@/lib/lines/seasons';
import { StationPlate } from './StationPlate';
import { useRouteReveal } from './useRouteReveal';

/**
 * The generated line: a bending track with the stops parked on it.
 *
 * GEOMETRY CONTRACT — this follows EraLineNav / NetworkDiagram, NOT IntentMap.
 *
 * IntentMap uses a uniform viewBox, so its band height is DERIVED from its
 * width: a 1440x360 box is 256px tall at 1024px and 480px at 1920px. The plates
 * on it are a fixed size, so that design is only ever correctly proportioned at
 * one viewport width. Here the band height is fixed and the SVG stretches
 * (`preserveAspectRatio="none"` + `vector-effect="non-scaling-stroke"`), which
 * makes the bend amplitude in device pixels width-invariant — about 130px of
 * swing at every width from 1024 to 1920.
 *
 * The price of that choice is that a `<circle>` inside a non-uniformly scaled
 * viewBox renders as an ELLIPSE, so every ring must be HTML positioned by
 * percentage. That is not a workaround here, it is what the plates need anyway.
 *
 * Below `lg` the line goes vertical, on a fixed 40px gutter where user units
 * equal CSS px. Nothing stretches, so nothing deforms — which is why THIS
 * vertical line can bend where IntentMap's rail had to fall back to a straight
 * bar.
 *
 * RTL mirrors the GEOMETRY, not the element: a transform on the `<g>` plus
 * `w - x` on the plate positions. An `rtl:-scale-x-100` would double-flip each
 * ring's own centring translate and land every station off its line. `rtl`
 * comes from `isRtlLocale(i18n.language)` — never `i18n.dir()`, which reads
 * `resolvedLanguage` and disagrees with `<html dir>` when a bundle fails to
 * load.
 *
 * Both SVGs are `aria-hidden`. Every fact is in the plates; the line is the
 * picture of the relationship between them, and a screen reader gets that
 * relationship from the `<ol>`.
 */

interface RouteLineStageProps {
  /** Three or more. Fewer is not a line — see the note below. */
  stations: Station[];
  /** Bumped on every generate/reroll. Drives the arrival animation. */
  generation: number;
  window: SeasonWindow | null;
  onSwap?: (stationId: string) => void;
  /** True while a new line is being computed — dims without blanking. */
  pending?: boolean;
  /** Fired once the last plate has landed, so the caller can announce it. */
  onSettled?: () => void;
  className?: string;
}

export function RouteLineStage({
  stations,
  generation,
  window: seasonWindow,
  onSwap,
  pending,
  onSettled,
  className,
}: RouteLineStageProps) {
  const { i18n, t } = useTranslation();
  const rtl = isRtlLocale(i18n.language);
  const n = stations.length;
  const { animate, revealed, settled } = useRouteReveal(n, generation);

  useEffect(() => {
    if (settled) onSettled?.();
  }, [settled, generation, onSettled]);

  const h = horizontalLine(Math.max(n, 3), ROUTE_H);
  const v = verticalLine(Math.max(n, 3), ROUTE_V);

  // Two stops make a single crest, which renders as a rule with dots on it —
  // hard rule #1 broken, not a short line. The caller owns that case and shows
  // plain cards with no track at all; this component simply refuses to draw a
  // line that would not be one.
  if (n < 3) return null;

  return (
    <div
      // Band height and plate height are one equation (see lineGeometry). They
      // travel as CSS custom properties because the relationship must hold at
      // lg and up only, and an inline `height` cannot be made responsive.
      style={
        {
          '--route-band-h': `${ROUTE_BAND_H}px`,
          '--route-plate-h': `${ROUTE_PLATE_H}px`,
        } as CSSProperties
      }
      className={cn(
        'relative transition-opacity duration-normal lg:h-[var(--route-band-h)]',
        pending && 'opacity-60',
        className,
      )}
    >
      <>
          <svg
            viewBox={h.viewBox}
            preserveAspectRatio="none"
            className={cn(
              'pointer-events-none absolute inset-0 hidden h-full w-full lg:block',
              animate && 'route-draw',
            )}
            aria-hidden
          >
            <g
              fill="none"
              strokeWidth={9}
              strokeLinecap="butt"
              transform={rtl ? `translate(${h.w},0) scale(-1,1)` : undefined}
            >
              {h.segments.map((d, i) => (
                <path
                  key={stations[i].id}
                  d={d}
                  // trip = T / blue in routeBulletMap. One accent per context:
                  // the picker lines are pink, the route is blue, and the hue
                  // never varies with the user's picks — that would make colour
                  // encode content state.
                  stroke="hsl(var(--track-blue))"
                  pathLength={100}
                  style={{ '--leg': i } as CSSProperties}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </g>
          </svg>

          <svg
            width={v.w}
            height={v.h}
            viewBox={v.viewBox}
            className={cn(
              'pointer-events-none absolute inset-y-0 start-0 lg:hidden',
              animate && 'route-draw',
            )}
            aria-hidden
          >
            <g fill="none" strokeWidth={4} strokeLinecap="butt">
              {v.segments.map((d, i) => (
                <path
                  key={stations[i].id}
                  d={d}
                  stroke="hsl(var(--track-blue))"
                  pathLength={100}
                  style={{ '--leg': i } as CSSProperties}
                />
              ))}
            </g>
          </svg>
      </>

      {/* <ol>, not <ul> — a route is ordered, and DOM order is route order is
          focus order (WCAG 1.3.2 / 2.4.3). */}
      <ol
        id="route-stations"
        aria-label={t('trips.discover.route.stopsAria', 'Stops on this line, in order')}
        className={cn(
          'm-0 flex list-none flex-col p-0',
          'lg:absolute lg:inset-0 lg:block',
        )}
      >
        {stations.map((station, i) => (
          <StationPlate
            key={station.id}
            station={station}
            index={i}
            sx={pct(rtl ? h.w - h.stations[i].x : h.stations[i].x, h.w)}
            sy={pct(h.stations[i].y, h.h)}
            // Alternating lanes are what make five plates fit: adjacent plates
            // sit on opposite sides, so the nearest same-lane neighbour is two
            // steps away — about 384px at lg.
            lane={i % 2 === 0 ? 'above' : 'below'}
            revealed={i <= revealed}
            animate={animate}
            window={seasonWindow}
            onSwap={onSwap}
          />
        ))}
      </ol>
    </div>
  );
}
