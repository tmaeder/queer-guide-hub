/**
 * The Line That Stops — consent as a loop line.
 *
 * A ring of four stations, run round for as long as you are together, with
 * every station wired by its own spoke to Stop in the middle. The editorial
 * reasoning is in data.ts; this file is geometry and the "ride the line"
 * walk-through.
 *
 * - The map is one `aria-hidden` SVG in a square box, so nothing is stretched
 *   and every station sits exactly on the ring. The ring wobbles lightly (the
 *   house rule: drawn lines are never ruler-straight), and the wobble is zero
 *   at each station's angle by construction.
 * - Station rings are HTML laid over the SVG at percentage positions, numbered
 *   to match the legend beside the map. Nothing inside the SVG is focusable.
 * - "Ride the line" is the interaction: a panel asks the current station's
 *   question; yes moves round the ring, anything else goes to Stop. The map
 *   follows along. The panel is a live region, so the ride works without the
 *   picture.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { TRACK_BG, TRACK_STROKE } from '@/components/transit/routeBulletMap';
import type { InfographicViewProps } from '../../types';
import { ENTRY, STATIONS, STOP } from './data';

const K = 'tags.figures.consentFlow';

/** viewBox geometry. The box is square and never stretched. */
const SIZE = 200;
const C = SIZE / 2;
const R = 70;
const HUB_R = 20;
/** Ring wobble: amplitude, and lobes per full turn. A multiple of the station
 *  count, so every station angle lands on a zero of the wobble. */
const WOBBLE = 2.5;
const LOBES = 8;

const DEG = Math.PI / 180;
/** Station i sits at the top and steps clockwise. */
const angleOf = (i: number) => (-90 + (360 / STATIONS.length) * i) * DEG;
const ringR = (a: number) => R + WOBBLE * Math.sin(LOBES * a);
const at = (a: number, r: number) => ({ x: C + r * Math.cos(a), y: C + r * Math.sin(a) });
const f = (n: number) => Math.round(n * 100) / 100;

const RING_PATH = (() => {
  const pts = Array.from({ length: 181 }, (_, k) => {
    const a = (k / 180) * 2 * Math.PI;
    const p = at(a, ringR(a));
    return `${k === 0 ? 'M' : 'L'} ${f(p.x)} ${f(p.y)}`;
  });
  return `${pts.join(' ')} Z`;
})();

/** Clockwise direction chevrons, one per quarter except the restricted one. */
const CHEVRONS = STATIONS.flatMap((_, i) => {
  const next = STATIONS[(i + 1) % STATIONS.length];
  if (next.restriction) return [];
  const a = angleOf(i) + Math.PI / STATIONS.length;
  const p = at(a, ringR(a));
  const t = { x: -Math.sin(a), y: Math.cos(a) }; // clockwise tangent
  const n = { x: Math.cos(a), y: Math.sin(a) }; // outward normal
  const tip = { x: p.x + t.x * 3, y: p.y + t.y * 3 };
  const back = (side: number) => ({
    x: p.x - t.x * 3 + n.x * 5 * side,
    y: p.y - t.y * 3 + n.y * 5 * side,
  });
  const l = back(1);
  const r = back(-1);
  return [`M ${f(l.x)} ${f(l.y)} L ${f(tip.x)} ${f(tip.y)} L ${f(r.x)} ${f(r.y)}`];
});

/** Cross-ties across the ring on the approach to a restricted station. */
const TIES = STATIONS.flatMap((s, i) => {
  if (!s.restriction) return [];
  const end = angleOf(i);
  return [0.25, 0.4, 0.55, 0.7, 0.85].map((frac) => {
    const a = end - (Math.PI * 2 * (1 - frac)) / STATIONS.length;
    const inner = at(a, ringR(a) - 7);
    const outer = at(a, ringR(a) + 7);
    return `M ${f(inner.x)} ${f(inner.y)} L ${f(outer.x)} ${f(outer.y)}`;
  });
}).join(' ');

/** A spoke from a station inward to the hub's edge. */
const spoke = (i: number) => {
  const a = angleOf(i);
  const from = at(a, R);
  const to = at(a, HUB_R);
  return `M ${f(from.x)} ${f(from.y)} L ${f(to.x)} ${f(to.y)}`;
};

const ENTRY_PATH = `M ${C} 0 C ${C - 5} 10, ${C + 5} 20, ${C} ${C - R}`;

const pct = (v: number) => `${(v / SIZE) * 100}%`;

type Ride = { at: number; round: number } | { stoppedAt: number; round: number } | null;

export default function ConsentFlow({ reducedMotion, domId }: InfographicViewProps) {
  const { t } = useTranslation();
  const [ride, setRide] = useState<Ride>(null);

  const current = ride && 'at' in ride ? ride.at : -1;
  const stoppedAt = ride && 'stoppedAt' in ride ? ride.stoppedAt : -1;
  const stopped = stoppedAt >= 0;

  const yes = () =>
    setRide((r) => {
      if (!r || !('at' in r)) return r;
      const next = (r.at + 1) % STATIONS.length;
      return { at: next, round: next === 0 ? r.round + 1 : r.round };
    });
  const no = () => setRide((r) => (r && 'at' in r ? { stoppedAt: r.at, round: r.round } : r));
  const start = () => setRide({ at: 0, round: 1 });

  const station = current >= 0 ? STATIONS[current] : null;
  const stoppedStation = stopped ? STATIONS[stoppedAt] : null;

  return (
    <div className="grid items-start gap-8 md:grid-cols-[minmax(0,22rem)_1fr]">
      {/* The map. */}
      <div className="relative mx-auto aspect-square w-full max-w-[22rem]">
        <svg
          aria-hidden
          focusable="false"
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="absolute inset-0 block h-full w-full overflow-visible"
        >
          {/* Spokes first, so the ring and hub sit over their ends. */}
          {STATIONS.map((s, i) => (
            <path
              key={s.id}
              d={spoke(i)}
              fill="none"
              stroke={stoppedAt === i ? TRACK_STROKE.pink : 'currentColor'}
              className="text-foreground"
              strokeWidth={stoppedAt === i ? 6 : 3}
              strokeLinecap="round"
              strokeDasharray={stoppedAt === i ? undefined : '1 7'}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <path
            d={ENTRY_PATH}
            fill="none"
            stroke={TRACK_STROKE.pink}
            strokeWidth={6}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={RING_PATH}
            fill="none"
            stroke={TRACK_STROKE.pink}
            strokeWidth={6}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={TIES}
            stroke="currentColor"
            className="text-foreground"
            strokeWidth={3}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          {CHEVRONS.map((d) => (
            <path
              key={d}
              d={d}
              fill="none"
              stroke="currentColor"
              className="text-foreground"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>

        {/* Stop: the hub. */}
        <span
          aria-hidden
          style={{ left: '50%', top: '50%' }}
          className={cn(
            'absolute flex h-[22%] w-[22%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[3px] border-foreground text-13 font-bold',
            stopped ? 'bg-foreground text-background' : 'bg-background',
            stopped && !reducedMotion && 'station-pop',
          )}
        >
          {t(STOP.labelKey, STOP.labelFallback)}
        </span>

        {/* Stations, numbered to match the legend. */}
        {STATIONS.map((s, i) => {
          const p = at(angleOf(i), R);
          const here = current === i;
          return (
            <span
              key={s.id}
              aria-hidden
              style={{ left: pct(p.x), top: pct(p.y) }}
              className={cn(
                'absolute flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[3px] border-foreground text-13 font-bold',
                here ? cn(TRACK_BG.pink, 'text-track-ring') : 'bg-background',
                here && !reducedMotion && 'station-pop',
                stoppedAt === i && 'bg-foreground text-background',
              )}
            >
              {i + 1}
            </span>
          );
        })}
      </div>

      {/* Ride the line. Under the map on phones, so the map stays in view
          while riding; full width below both from md. */}
      <section
        aria-labelledby={`${domId}-ride`}
        className="rounded-container bg-surface-container p-4 md:col-span-2 md:row-start-2 md:p-6"
      >
        <h4
          id={`${domId}-ride`}
          className="m-0 text-2xs font-bold uppercase tracking-label text-muted-foreground"
        >
          {t(`${K}.ride.title`, 'Ride the line')}
        </h4>
        <div aria-live="polite" className="mt-2">
          {ride === null && (
            <p className="m-0 text-15">
              {t(
                `${K}.ride.intro`,
                'Go round the loop one station at a time. Any answer that is not a yes takes you to Stop.',
              )}
            </p>
          )}
          {station && (
            <>
              <p className="m-0 text-13 text-muted-foreground">
                {t(`${K}.ride.where`, 'Round {{round}} · Station {{n}}: {{name}}', {
                  round: (ride as { round: number }).round,
                  n: current + 1,
                  name: t(station.labelKey, station.labelFallback),
                })}
              </p>
              <p className="m-0 mt-1 text-title font-bold">
                {t(station.askKey, station.askFallback)}
              </p>
            </>
          )}
          {stoppedStation && (
            <>
              <p className="m-0 text-title font-bold">{t(STOP.labelKey, STOP.labelFallback)}</p>
              <p className="m-0 mt-1 text-15">
                {t(stoppedStation.whyKey, stoppedStation.whyFallback)}
              </p>
              <p className="m-0 mt-1 text-13 text-muted-foreground">
                {t(STOP.noteKey, STOP.noteFallback)}
              </p>
            </>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {ride === null && (
            <Button type="button" onClick={start}>
              {t(`${K}.ride.start`, 'Start')}
            </Button>
          )}
          {station && (
            <>
              <Button key="yes" type="button" onClick={yes}>
                {t(station.yesKey, station.yesFallback)}
              </Button>
              <Button key="no" type="button" variant="outline" onClick={no}>
                {t(station.noKey, station.noFallback)}
              </Button>
            </>
          )}
          {stopped && (
            <Button type="button" variant="outline" onClick={start}>
              {t(`${K}.ride.again`, 'Start again')}
            </Button>
          )}
        </div>
      </section>
      {/* Legend: the map in words, in ring order. */}
      <ol
        className="m-0 grid list-none gap-4 p-0 md:col-start-2 md:row-start-1"
        aria-label={t(`${K}.legend`, 'Stations on the loop')}
      >
        <li className="grid grid-cols-[2rem_1fr] items-start gap-4">
          <span aria-hidden className="mt-2 block h-1.5 w-8 rounded-full bg-track-pink" />
          <span className="text-15 text-muted-foreground">
            {t(ENTRY.labelKey, ENTRY.labelFallback)}
          </span>
        </li>
        {STATIONS.map((s, i) => (
          <li
            key={s.id}
            className={cn(
              'grid grid-cols-[2rem_1fr] items-start gap-4 rounded-element transition-opacity',
              (current >= 0 && current !== i) || (stopped && stoppedAt !== i) ? 'opacity-50' : '',
            )}
          >
            <span
              aria-hidden
              className="flex h-8 w-8 items-center justify-center rounded-full border-[3px] border-foreground text-13 font-bold"
            >
              {i + 1}
            </span>
            <span>
              <span className="block text-15 font-bold leading-8">
                {t(s.labelKey, s.labelFallback)}
              </span>
              <span className="block text-13 leading-snug text-muted-foreground">
                {t(s.noteKey, s.noteFallback)}
              </span>
            </span>
          </li>
        ))}
        <li className="grid grid-cols-[2rem_1fr] items-start gap-4">
          <span
            aria-hidden
            className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground"
          />
          <span>
            <span className="block text-15 font-bold leading-8">
              {t(STOP.labelKey, STOP.labelFallback)}
            </span>
            <span className="block text-13 leading-snug text-muted-foreground">
              {t(STOP.noteKey, STOP.noteFallback)}
            </span>
          </span>
        </li>
      </ol>
    </div>
  );
}
