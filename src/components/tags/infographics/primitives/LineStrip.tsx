/**
 * LineStrip — several transit lines drawn as strip maps, the diagram that runs
 * above a train door: one line, its stops in order, every stop labelled.
 *
 * It replaces an earlier "AxisSet" that drew the lines as unlabelled wobbly
 * curves converging on one interchange, with the controls in a separate list
 * underneath. That shape argued against its own subject: the whole point of
 * the figure it serves is that the lines are INDEPENDENT, and a drawing where
 * they all run into one station says the opposite. It also put the meaning
 * (the stop names) somewhere other than the picture, so the picture carried
 * none.
 *
 * Three rules here:
 *
 * - **The stops ARE the controls.** Each station is a native radio or checkbox
 *   whose label is the ring plus its name, positioned on the track. There is
 *   no second list to reconcile with the drawing, and the track is drawn
 *   per gap, from one ring's centre to the next, so it can never drift off a
 *   station. Those small SVGs are aria-hidden decoration with nothing
 *   focusable in them.
 * - **The lines never meet.** Each strip is its own fieldset. Independence is
 *   drawn, not captioned.
 * - **Nothing is selected by default, and "rather not say" is a stop.** A
 *   pre-picked middle reads as the norm; an empty state doing double duty as
 *   "declined" makes not answering look like not finishing.
 *
 * A line is `one` (radio: exactly one stop) or `any` (checkbox: several stops
 * at once). An `exclusive` stop on an `any` line clears the others and is
 * cleared by them.
 *
 * Layout is logical (`start-*`), so RTL mirrors with the document direction;
 * only each track SVG flips its own drawing (`rtl:-scale-x-100`), which is
 * safe because nothing is positioned inside it. Narrow screens run each strip
 * vertically, because seven labelled stops do not fit across a phone.
 *
 * Nothing here is stored, sent, or remembered.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { TRACK_BG, TRACK_STROKE } from '@/components/transit/routeBulletMap';
import type { InfographicViewProps, Track } from '../types';
import { nextPicks, type Picks, type StripLine } from './lineStripModel';

export type { StripLine, StripStop } from './lineStripModel';

export interface LineStripProps extends InfographicViewProps {
  lines: readonly StripLine[];
  readoutTitleKey: string;
  readoutTitleFallback: string;
  /** Closing sentence of the readout — the figure's thesis, restated. */
  readoutNoteKey: string;
  readoutNoteFallback: string;
  renderTermChip: (slug: string) => React.ReactNode;
}

/** Wave amplitude in px either side of the centreline. "Lightly": enough to
 *  read as a drawn route, not enough to make the strip look unsteady. */
const AMP = 5;
/** Across, the gaps are several times longer than they are down a phone, so
 *  the same depth flattens out; it needs a little more to read as a wave. */
const AMP_ACROSS = 14;
const STROKE = 6;

/** Shared props for every track SVG: decoration only, never focusable, and
 *  a constant stroke width however the box is stretched. */
const svgProps = {
  'aria-hidden': true,
  focusable: 'false',
} as const;

/** One gap between two stops. The box spans ring-centre to ring-centre and is
 *  stretched to the gap with `preserveAspectRatio="none"`; the stroke uses
 *  `non-scaling-stroke`, so only the curve stretches, not the line weight. */
function Wave({ track, flip }: { track: Track; flip: boolean }) {
  const a = flip ? -AMP : AMP;
  const across = flip ? -AMP_ACROSS : AMP_ACROSS;
  return (
    <>
      {/* Phones: vertical, from this ring's centre down to the next. */}
      <svg
        {...svgProps}
        viewBox="0 0 24 100"
        preserveAspectRatio="none"
        className="absolute start-0 top-1/2 block h-full w-6 overflow-visible md:hidden rtl:-scale-x-100"
      >
        <path
          d={`M 12 0 C ${12 + a} 33, ${12 - a} 67, 12 100`}
          fill="none"
          stroke={TRACK_STROKE[track]}
          strokeWidth={STROKE}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {/* md+: horizontal, from this ring's centre across to the next. */}
      <svg
        {...svgProps}
        viewBox="0 0 100 24"
        preserveAspectRatio="none"
        className="absolute start-1/2 top-0 hidden h-6 w-full overflow-visible md:block rtl:-scale-x-100"
      >
        <path
          d={`M 0 12 C 33 ${12 + across}, 67 ${12 - across}, 100 12`}
          fill="none"
          stroke={TRACK_STROKE[track]}
          strokeWidth={STROKE}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </>
  );
}

export function LineStrip({
  lines,
  readoutTitleKey,
  readoutTitleFallback,
  readoutNoteKey,
  readoutNoteFallback,
  renderTermChip,
  reducedMotion,
  domId,
}: LineStripProps) {
  const { t } = useTranslation();
  const [picks, setPicks] = useState<Picks>({});

  const anyPicked = lines.some((l) => (picks[l.id]?.length ?? 0) > 0);

  return (
    <div>
      <div className="grid gap-10">
        {lines.map((line) => {
          const picked = picks[line.id] ?? [];
          return (
            <fieldset key={line.id} className="m-0 min-w-0 border-0 p-0">
              <legend className="flex flex-wrap items-center gap-x-2 gap-y-1 p-0 text-title font-bold">
                <span
                  aria-hidden
                  className={cn(
                    'inline-block h-3 w-6 rounded-full border-2 border-track-ring',
                    TRACK_BG[line.track],
                  )}
                />
                {t(line.labelKey, line.labelFallback)}
                <span className="w-full text-2xs font-semibold uppercase tracking-label text-muted-foreground md:w-auto">
                  {line.select === 'one'
                    ? t('tags.figures.fourLines.pickOne', 'Pick one')
                    : t('tags.figures.fourLines.pickAny', 'Pick any that fit')}
                </span>
              </legend>
              <p className="mt-1 max-w-reading text-13 leading-snug text-muted-foreground">
                {t(line.questionKey, line.questionFallback)}
              </p>

              <ol
                className="mt-6 flex list-none flex-col p-0 md:grid md:grid-flow-col md:auto-cols-fr"
                data-line={line.id}
              >
                {line.stops.map((stop, i) => {
                  const id = `${domId}-${line.id}-${stop.id}`;
                  const isPicked = picked.includes(stop.id);
                  const last = i === line.stops.length - 1;
                  return (
                    <li key={stop.id} className="relative min-w-0 py-1.5 md:py-0">
                      {/* Track segment to the next stop. Vertical on narrow
                          screens, horizontal from md up; centred on the ring
                          either way, so a stop can never sit off its line. */}
                      {/* The track, drawn lightly wavy: one gentle S per
                          gap between stops, alternating direction so the
                          line snakes rather than drifts. Every curve starts
                          and ends exactly on a ring's centre, so a stop can
                          never sit off its line. Phones run the strip
                          downwards; from md it runs across. Each SVG is
                          aria-hidden decoration; the inputs carry the
                          meaning. */}
                      {!last && <Wave track={line.track} flip={i % 2 === 1} />}
                      <input
                        type={line.select === 'one' ? 'radio' : 'checkbox'}
                        id={id}
                        name={`${domId}-${line.id}`}
                        value={stop.id}
                        checked={isPicked}
                        onChange={() => setPicks((p) => nextPicks(p, line, stop.id))}
                        className="peer sr-only"
                      />
                      <label
                        htmlFor={id}
                        className={cn(
                          'relative flex cursor-pointer items-center gap-4 rounded-element',
                          'md:flex-col md:items-center md:gap-2 md:px-1 md:text-center',
                          'peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-foreground',
                        )}
                      >
                        <span
                          aria-hidden
                          className={cn(
                            'relative z-10 block h-6 w-6 shrink-0 rounded-full border-[3px] border-foreground',
                            isPicked ? TRACK_BG[line.track] : 'bg-background',
                            isPicked && !reducedMotion && 'station-pop',
                          )}
                        >
                          {isPicked && (
                            <span className="absolute inset-[5px] block rounded-full bg-foreground" />
                          )}
                        </span>
                        <span
                          className={cn(
                            'text-13 leading-tight',
                            isPicked ? 'font-bold text-foreground' : 'text-foreground/80',
                          )}
                        >
                          {t(stop.labelKey, stop.labelFallback)}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ol>
            </fieldset>
          );
        })}
      </div>

      {/* Live region: announces what landed, line by line. */}
      <div aria-live="polite" className="mt-10">
        {anyPicked && (
          <div className="rounded-container bg-surface-container p-4 md:p-6">
            <div className="flex items-start justify-between gap-4">
              <p className="text-2xs font-semibold uppercase tracking-label text-muted-foreground">
                {t(readoutTitleKey, readoutTitleFallback)}
              </p>
              <Button type="button" variant="outline" size="sm" onClick={() => setPicks({})}>
                {t('tags.figures.fourLines.reset', 'Clear')}
              </Button>
            </div>
            <dl className="mt-4 grid gap-4">
              {lines.map((line) => {
                const chosen = line.stops.filter((s) => (picks[line.id] ?? []).includes(s.id));
                return (
                  <div
                    key={line.id}
                    className="grid gap-1 md:grid-cols-[12rem_1fr] md:items-baseline"
                  >
                    <dt className="flex items-center gap-2 text-13 text-muted-foreground">
                      <span
                        aria-hidden
                        className={cn(
                          'inline-block h-2 w-4 rounded-full border border-track-ring',
                          TRACK_BG[line.track],
                        )}
                      />
                      {t(line.labelKey, line.labelFallback)}
                    </dt>
                    <dd className="m-0 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-13">
                      {chosen.length === 0 ? (
                        <span className="text-muted-foreground">
                          {t('tags.figures.fourLines.notPicked', 'No stop picked')}
                        </span>
                      ) : (
                        chosen.map((s) => (
                          <span key={s.id} className="inline-flex items-baseline gap-2">
                            <span className="font-bold">{t(s.labelKey, s.labelFallback)}</span>
                            {s.slug && renderTermChip(s.slug)}
                          </span>
                        ))
                      )}
                    </dd>
                  </div>
                );
              })}
            </dl>
            <p className="mt-4 text-13 font-bold">{t(readoutNoteKey, readoutNoteFallback)}</p>
          </div>
        )}
      </div>
    </div>
  );
}
