/**
 * AxisSet — several lines on one map, each carrying discrete stations, with a
 * convergence station where they meet.
 *
 * **Stations, not sliders.** A continuous slider asserts a measurable quantity
 * on a continuum with two poles, which is exactly the defect in the diagram
 * this replaces: a single Feminine↔Masculine bar forces a tradeoff that does
 * not exist, and the modern model splits it into independent scales. Discrete
 * named stops make no such claim, and a native radio group gives arrow-key
 * traversal, forced-colors support and a real "nothing selected" state for
 * free.
 *
 * **Nothing is selected by default.** A centred opening position reads as the
 * norm, and there is no norm here. Every line also carries an explicit
 * "prefer not to say" stop rather than making the empty state do that work
 * silently.
 *
 * **The map is output, never input.** The `<svg>` is `aria-hidden` and the
 * rings under it are `aria-hidden` markers; the controls are the radio groups
 * below, in line order, so focus order follows the legend. This is the repo's
 * standing convention and it is asserted by a component test.
 *
 * Nothing here is stored, sent, or remembered. It is a diagram you can point
 * at, not a profile.
 */

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { TRACK_STROKE, TRACK_BG } from '@/components/transit/routeBulletMap';
import type { InfographicViewProps, Track } from '../types';
import { axisPath, mirrorX, pct, type Point } from './axisGeometry';

export interface AxisStation {
  id: string;
  labelKey: string;
  labelFallback: string;
  /** Glossary term this stop IS, if any. Drives the readout's chips. */
  slug?: string;
  /** Position on the line. Must be one of the path's endpoints. */
  at: Point;
}

export interface AxisSpec {
  id: string;
  track: Track;
  labelKey: string;
  labelFallback: string;
  /** Sits under the legend — what the line is actually asking. */
  helpKey: string;
  helpFallback: string;
  stations: readonly AxisStation[];
  /** Anchors before the first and after the last station: the run-in from the
   *  page edge and the run-out to the junction. */
  runIn: Point;
  runOut: Point;
  /**
   * A terminus stub does not run on to the junction. Sex assigned at birth is
   * drawn this way on purpose: it is a recorded starting point, not a
   * destination, and geometry says that more plainly than a caption can.
   */
  terminus?: boolean;
  /** Lines sharing a corridor are drawn as parallel services and share one
   *  heading, the way a map draws express and local on one trunk. */
  corridorKey?: string;
  corridorFallback?: string;
}

export interface AxisSetProps extends InfographicViewProps {
  axes: readonly AxisSpec[];
  viewBox: { w: number; h: number };
  junction: Point;
  /** Rendered once every line that runs to the junction has a station picked. */
  readoutTitleKey: string;
  readoutTitleFallback: string;
  renderTermChip: (slug: string) => React.ReactNode;
}

export function AxisSet({
  axes,
  viewBox,
  junction,
  readoutTitleKey,
  readoutTitleFallback,
  renderTermChip,
  reducedMotion,
  rtl,
  domId,
}: AxisSetProps) {
  const { t } = useTranslation();
  const [picked, setPicked] = useState<Record<string, string>>({});

  const mx = useMemo(() => (x: number) => (rtl ? mirrorX(x, viewBox.w) : x), [rtl, viewBox.w]);

  const paths = useMemo(
    () =>
      axes.map((axis) => ({
        id: axis.id,
        track: axis.track,
        d: axisPath([
          axis.runIn,
          ...axis.stations.map((s) => s.at),
          ...(axis.terminus ? [] : [axis.runOut]),
        ]),
      })),
    [axes],
  );

  const connected = axes.filter((a) => !a.terminus);
  const allPicked = connected.length > 0 && connected.every((a) => picked[a.id]);

  const chosen = axes
    .map((axis) => {
      const station = axis.stations.find((s) => s.id === picked[axis.id]);
      return station ? { axis, station } : null;
    })
    .filter((x): x is { axis: AxisSpec; station: AxisStation } => x !== null);

  // Corridors get ONE heading: the first line of a pair owns it, the second
  // renders as a second service under it. Computed up front rather than with a
  // mutable `seen` set inside the map — the React compiler bails on a render
  // body that mutates, and a side effect in a ternary is unreadable anyway.
  const corridorOwner = useMemo(() => {
    const owners = new Set<string>();
    const seen = new Set<string>();
    for (const axis of axes) {
      if (!axis.corridorKey || seen.has(axis.corridorKey)) continue;
      seen.add(axis.corridorKey);
      owners.add(axis.id);
    }
    return owners;
  }, [axes]);

  return (
    <div>
      <div
        className="relative w-full"
        style={{ aspectRatio: `${viewBox.w} / ${viewBox.h}` }}
      >
        <svg
          viewBox={`0 0 ${viewBox.w} ${viewBox.h}`}
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
          aria-hidden="true"
        >
          <g transform={rtl ? `translate(${viewBox.w},0) scale(-1,1)` : undefined}>
            {paths.map((p) => (
              <path
                key={p.id}
                d={p.d}
                fill="none"
                stroke={TRACK_STROKE[p.track]}
                strokeWidth={6}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {/* Buffer stop on the terminus stub — the line ends, and you can
                see that it ends. */}
            {axes
              .filter((a) => a.terminus)
              .map((a) => {
                const last = a.stations[a.stations.length - 1].at;
                return (
                  <line
                    key={`stop-${a.id}`}
                    x1={last.x + 12}
                    y1={last.y - 11}
                    x2={last.x + 12}
                    y2={last.y + 11}
                    stroke="hsl(var(--foreground))"
                    strokeWidth={6}
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })}
          </g>
        </svg>

        {/* Station rings: HTML at percentage positions, never SVG circles — a
            circle inside a `preserveAspectRatio="none"` viewBox renders as an
            ellipse. */}
        {axes.flatMap((axis) =>
          axis.stations.map((s) => {
            const isPicked = picked[axis.id] === s.id;
            return (
              <span
                key={`${axis.id}-${s.id}`}
                aria-hidden
                style={{ left: pct(mx(s.at.x), viewBox.w), top: pct(s.at.y, viewBox.h) }}
                className={cn(
                  'pointer-events-none absolute block -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-foreground',
                  isPicked ? 'h-5 w-5' : 'h-3 w-3',
                  isPicked ? TRACK_BG[axis.track] : 'bg-background',
                  isPicked && !reducedMotion && 'station-pop',
                  !reducedMotion && 'transition-[width,height] duration-fast',
                )}
              />
            );
          }),
        )}

        <span
          aria-hidden
          style={{ left: pct(mx(junction.x), viewBox.w), top: pct(junction.y, viewBox.h) }}
          className={cn(
            'pointer-events-none absolute block -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-foreground',
            allPicked ? 'intersection-gradient h-10 w-10 md:h-12 md:w-12' : 'h-6 w-6 bg-background',
            allPicked && !reducedMotion && 'station-pop',
          )}
        />
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        {axes.map((axis) => {
          return (
            <fieldset key={axis.id} className="m-0 border-0 p-0">
              {corridorOwner.has(axis.id) && axis.corridorKey && (
                <p className="mb-2 text-2xs font-semibold uppercase tracking-label text-muted-foreground">
                  {t(axis.corridorKey, axis.corridorFallback ?? '')}
                </p>
              )}
              <legend className="flex items-center gap-2 p-0 text-title font-bold">
                <span
                  aria-hidden
                  className={cn(
                    'inline-block h-3 w-6 border-2 border-foreground',
                    TRACK_BG[axis.track],
                  )}
                />
                {t(axis.labelKey, axis.labelFallback)}
              </legend>
              <p className="mt-1 text-13 leading-snug text-muted-foreground">
                {t(axis.helpKey, axis.helpFallback)}
              </p>
              <ul className="mt-4 flex list-none flex-wrap gap-2 p-0">
                {axis.stations.map((s) => {
                  const id = `${domId}-${axis.id}-${s.id}`;
                  const isPicked = picked[axis.id] === s.id;
                  return (
                    <li key={s.id}>
                      <input
                        type="radio"
                        id={id}
                        name={`${domId}-${axis.id}`}
                        checked={isPicked}
                        onChange={() => setPicked((p) => ({ ...p, [axis.id]: s.id }))}
                        className="peer sr-only"
                      />
                      <label
                        htmlFor={id}
                        className={cn(
                          'inline-block cursor-pointer border-2 border-foreground px-2 py-1 text-13 font-bold',
                          'peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-foreground',
                          isPicked
                            ? 'bg-foreground text-background'
                            : 'bg-background hover:bg-surface-container',
                        )}
                      >
                        {t(s.labelKey, s.labelFallback)}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          );
        })}
      </div>

      {/* Live region: the map is aria-hidden, so this is where a screen reader
          learns that a choice landed. */}
      <div aria-live="polite" className="mt-8">
        {chosen.length > 0 && (
          <div className="border-[3px] border-foreground p-4">
            <p className="text-2xs font-semibold uppercase tracking-label text-muted-foreground">
              {t(readoutTitleKey, readoutTitleFallback)}
            </p>
            <ul className="mt-4 grid list-none gap-2 p-0">
              {chosen.map(({ axis, station }) => (
                <li key={axis.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-13">
                  <span className="text-muted-foreground">
                    {t(axis.labelKey, axis.labelFallback)}
                  </span>
                  <span className="font-bold">{t(station.labelKey, station.labelFallback)}</span>
                  {station.slug && renderTermChip(station.slug)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
