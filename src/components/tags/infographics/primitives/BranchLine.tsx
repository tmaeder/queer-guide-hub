/**
 * BranchLine — one main line read top to bottom, its stations labelled on the
 * line, questions with off-ramps to buffer stops, an optional speed
 * restriction, and an optional loop back.
 *
 * It replaces `FlowGraph`, which laid the same content out as boxes on a
 * free-form graph. The boxes sat on the line rather than the line running
 * through stations, branch labels hid behind plates, buffer stops floated
 * above the outcomes they ended, and the loop was a dashed curve cutting
 * through a box. This draws it the way `LineStrip` draws Four Lines:
 *
 * - **Stations on a lightly wavy line.** Each gap is one gentle S-curve from
 *   one ring's centre to the next, so a stop can never sit off its line.
 * - **Off-ramps end at buffer stops**, on the line itself, beside the outcome
 *   they end at. The answer that leads there is written next to the outcome;
 *   the answer that keeps you on the main line is written on the line.
 * - **The loop is a line**, running back up beside the main line, not a dashed
 *   overlay.
 * - **The stops are the controls.** Each is a button; picking one lights the
 *   route that reaches it and dims the rest. Every SVG is aria-hidden with
 *   nothing focusable inside, and the route is announced in a live region.
 *
 * Every row places its ring's centre 12px below the row's top, which is what
 * lets each piece of track be drawn per row and still meet the next ring.
 */

import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCcw } from '@/components/icons';
import { cn } from '@/lib/utils';
import { TRACK_BG, TRACK_STROKE } from '@/components/transit/routeBulletMap';
import { useRiskVisual } from '@/hooks/useRiskVisual';
import type { InfographicViewProps, RiskTier, Track } from '../types';
import { routeTo, type BranchEnd, type LoopBack, type MainStation } from './branchLineModel';

export type { BranchEnd, LoopBack, MainStation } from './branchLineModel';

export interface BranchLineProps extends InfographicViewProps {
  stations: readonly MainStation[];
  loop?: LoopBack;
  track: Track;
  /** Accessible name for the list of stops. */
  groupLabel: string;
  /** Told once, above the list, so the interaction need not be discovered. */
  hintLabel: string;
  /** Prefix for the live route readout ("Route"). */
  routeLabel: string;
  /** Chip on a restriction station ("Speed restriction"). */
  restrictionLabel: string;
}

/** x of the main line, and of the off-ramp's buffer stop, in px. */
const MAIN_X = 24;
const RAMP_X = 60;
const RING_Y = 12;
const AMP = 5;
const STROKE = 6;

const svgProps = { 'aria-hidden': true, focusable: 'false' } as const;

type Row =
  | { kind: 'station'; station: MainStation; index: number }
  | { kind: 'ramp'; station: MainStation; end: BranchEnd; index: number };

/** One gap of main line, from this row's ring height down to the next row's.
 *  `ties` draws the speed-restriction cross-ties across it. */
function MainSegment({
  track,
  flip,
  ties,
  dim,
}: {
  track: Track;
  flip: boolean;
  ties?: boolean;
  dim: boolean;
}) {
  const a = flip ? -AMP : AMP;
  return (
    <svg
      {...svgProps}
      viewBox="0 0 48 100"
      preserveAspectRatio="none"
      className={cn(
        'absolute start-0 top-[12px] block h-full w-12 overflow-visible transition-opacity rtl:-scale-x-100',
        dim && 'opacity-30',
      )}
    >
      <path
        d={`M ${MAIN_X} 0 C ${MAIN_X + a} 33, ${MAIN_X - a} 67, ${MAIN_X} 100`}
        fill="none"
        stroke={TRACK_STROKE[track]}
        strokeWidth={STROKE}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      {ties && (
        <path
          // Horizontal ties stay horizontal however tall the row stretches.
          d={[20, 35, 50, 65, 80]
            .map((y) => `M ${MAIN_X - 12} ${y} L ${MAIN_X + 12} ${y}`)
            .join(' ')}
          stroke="currentColor"
          className="text-foreground"
          strokeWidth={3}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}

/** The off-ramp: leaves the main line at the top of its row, curves out to
 *  the outcome's height and ends at a buffer stop. Fixed size, not stretched. */
function Ramp({ track, dim }: { track: Track; dim: boolean }) {
  return (
    <svg
      {...svgProps}
      viewBox="0 0 72 24"
      className={cn(
        'absolute start-0 top-0 block h-6 w-[72px] overflow-visible transition-opacity rtl:-scale-x-100',
        dim && 'opacity-30',
      )}
    >
      <path
        d={`M ${MAIN_X} -14 C ${MAIN_X} 6, ${MAIN_X + 14} ${RING_Y}, ${RAMP_X - 4} ${RING_Y}`}
        fill="none"
        stroke={TRACK_STROKE[track]}
        strokeWidth={STROKE}
        strokeLinecap="round"
      />
      {/* Buffer stop: the line ends, and you can see that it ends. */}
      <path
        d={`M ${RAMP_X} ${RING_Y - 9} L ${RAMP_X} ${RING_Y + 9}`}
        stroke="currentColor"
        className="text-foreground"
        strokeWidth={STROKE}
        strokeLinecap="round"
      />
    </svg>
  );
}

function TierIcon({ tier }: { tier: RiskTier }) {
  const { fg, Icon } = useRiskVisual(tier);
  return <Icon aria-hidden style={{ color: fg }} className="mt-1 h-4 w-4 shrink-0" />;
}

export function BranchLine({
  stations,
  loop,
  track,
  groupLabel,
  hintLabel,
  routeLabel,
  restrictionLabel,
  reducedMotion,
  domId,
}: BranchLineProps) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string | null>(null);
  const route = routeTo(stations, selected);
  const routing = route.size > 0;

  const rows: Row[] = stations.flatMap((station, index): Row[] =>
    station.branch
      ? [
          { kind: 'station', station, index },
          { kind: 'ramp', station, end: station.branch.to, index },
        ]
      : [{ kind: 'station', station, index }],
  );

  // Main-line progress of the selected target: how far down the main line
  // the lit route runs. A ramp end lights the main line to its question.
  const targetMain = (() => {
    if (!selected) return -1;
    const m = stations.findIndex((s) => s.id === selected);
    if (m >= 0) return m;
    return stations.findIndex((s) => s.branch?.to.id === selected);
  })();

  // The loop spans rows of unknown height, so it is measured rather than
  // assumed. Absent until measured (and in jsdom, where nothing has layout).
  const listRef = useRef<HTMLOListElement>(null);
  const [loopBox, setLoopBox] = useState<{ top: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const ol = listRef.current;
    if (!ol || !loop) return;
    const measure = () => {
      const from = ol.querySelector<HTMLElement>(`[data-stop="${loop.from}"]`);
      const to = ol.querySelector<HTMLElement>(`[data-stop="${loop.to}"]`);
      if (!from || !to) return;
      const top = to.offsetTop + RING_Y;
      const height = from.offsetTop + RING_Y - top;
      setLoopBox(height > 0 ? { top, height } : null);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(ol);
    return () => ro.disconnect();
  }, [loop]);

  const label = (key: string, fallback: string) => t(key, fallback);
  const routeNames = stations
    .flatMap((s) => [s, ...(s.branch ? [s.branch.to] : [])])
    .filter((s) => route.has(s.id))
    .map((s) => label(s.labelKey, s.labelFallback));

  return (
    <div>
      <p className="text-13 text-muted-foreground">{hintLabel}</p>
      <ol ref={listRef} aria-label={groupLabel} className="relative mt-6 list-none p-0">
        {loop && loopBox && (
          <svg
            {...svgProps}
            viewBox="0 0 24 100"
            preserveAspectRatio="none"
            style={{ top: loopBox.top, height: loopBox.height }}
            className={cn(
              'absolute start-0 block w-6 overflow-visible transition-opacity rtl:-scale-x-100',
              routing && 'opacity-30',
            )}
          >
            <path
              d={`M ${MAIN_X} 100 C 0 88, 0 12, ${MAIN_X} 0`}
              fill="none"
              stroke={TRACK_STROKE[track]}
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray="6 8"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        )}

        {rows.map((row, r) => {
          const last = r === rows.length - 1;
          const flip = r % 2 === 1;

          if (row.kind === 'ramp') {
            const { station, end } = row;
            const onRoute = route.has(end.id);
            // The main line passes through a ramp row on its way down.
            const passOn = targetMain > row.index;
            const id = `${domId}-stop-${end.id}`;
            return (
              <li
                key={`ramp-${end.id}`}
                data-stop={end.id}
                className="relative grid grid-cols-[4.5rem_1fr] pb-8"
              >
                {!last && <MainSegment track={track} flip={flip} dim={routing && !passOn} />}
                <Ramp track={track} dim={routing && !onRoute} />
                {station.continueLabelKey && (
                  // The answer that keeps you on the main line, on the line.
                  <span
                    aria-hidden
                    className={cn(
                      'absolute start-[24px] bottom-0 z-10 -translate-x-1/2 rounded-badge bg-background px-1 text-3xs font-bold uppercase tracking-label rtl:translate-x-1/2',
                      routing && !passOn && 'opacity-30',
                    )}
                  >
                    {label(station.continueLabelKey, station.continueLabelFallback ?? '')}
                  </span>
                )}
                <span aria-hidden />
                <button
                  type="button"
                  id={id}
                  aria-pressed={selected === end.id}
                  onClick={() => setSelected(selected === end.id ? null : end.id)}
                  className={cn(
                    'group flex items-start gap-2 rounded-element text-start transition-opacity',
                    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground',
                    routing && !onRoute && 'opacity-40',
                  )}
                >
                  <TierIcon tier={end.tier} />
                  <span className="min-w-0">
                    <span className="block text-15 leading-6">
                      <span className="me-2 inline-block rounded-badge border border-foreground px-1.5 align-middle text-2xs font-bold uppercase leading-4 tracking-label">
                        {label(station.branch!.labelKey, station.branch!.labelFallback)}
                      </span>
                      <span className="font-bold group-hover:underline">
                        {label(end.labelKey, end.labelFallback)}
                      </span>
                    </span>
                    {end.noteKey && (
                      <span className="mt-1 block text-13 leading-snug text-muted-foreground">
                        {label(end.noteKey, end.noteFallback ?? '')}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          }

          const { station } = row;
          const onRoute = route.has(station.id);
          const isTarget = selected === station.id;
          // This row's segment leads on down the main line (or into the ramp
          // directly below it), so it is lit if the route goes further.
          const segOn =
            targetMain > row.index ||
            (station.branch !== undefined && selected === station.branch.to.id);
          const id = `${domId}-stop-${station.id}`;
          return (
            <li
              key={station.id}
              data-stop={station.id}
              className="relative grid grid-cols-[4.5rem_1fr] pb-8"
            >
              {!last && (
                <MainSegment
                  track={track}
                  flip={flip}
                  // A restriction is a section of track, so the ties run from
                  // the restriction's own ring down to the next stop.
                  ties={station.kind === 'restriction'}
                  dim={routing && !segOn}
                />
              )}
              <span aria-hidden className="relative">
                <span
                  className={cn(
                    'absolute start-[12px] top-0 z-10 block h-6 w-6 rounded-full border-[3px] border-foreground transition-opacity',
                    onRoute || station.kind === 'outcome' ? TRACK_BG[track] : 'bg-background',
                    isTarget && !reducedMotion && 'station-pop',
                    routing && !onRoute && 'opacity-30',
                  )}
                >
                  {isTarget && (
                    <span className="absolute inset-[5px] block rounded-full bg-foreground" />
                  )}
                </span>
              </span>
              <button
                type="button"
                id={id}
                aria-pressed={isTarget}
                onClick={() => setSelected(isTarget ? null : station.id)}
                className={cn(
                  'group flex items-start gap-2 rounded-element text-start transition-opacity',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground',
                  routing && !onRoute && 'opacity-40',
                )}
              >
                {station.kind === 'outcome' && station.tier && <TierIcon tier={station.tier} />}
                <span className="min-w-0">
                  <span className="block text-15 leading-6">
                    {station.kind === 'restriction' && (
                      // Inline, so the title stays level with its ring.
                      <span className="me-2 inline-block rounded-badge border border-foreground px-1.5 align-middle text-2xs font-bold uppercase leading-4 tracking-label">
                        {restrictionLabel}
                      </span>
                    )}
                    <span className="font-bold group-hover:underline">
                      {label(station.labelKey, station.labelFallback)}
                    </span>
                  </span>
                  {station.noteKey && (
                    <span className="mt-1 block text-13 leading-snug text-muted-foreground">
                      {label(station.noteKey, station.noteFallback ?? '')}
                    </span>
                  )}
                  {loop && loop.from === station.id && (
                    <span className="mt-2 flex items-center gap-2 text-13 font-bold">
                      <RotateCcw aria-hidden className="h-4 w-4 shrink-0" />
                      {label(loop.labelKey, loop.labelFallback)}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <p aria-live="polite" className="mt-2 min-h-6 text-13">
        {routing && (
          <>
            <span className="font-bold">{routeLabel}: </span>
            {routeNames.join(' → ')}
          </>
        )}
      </p>
    </div>
  );
}
