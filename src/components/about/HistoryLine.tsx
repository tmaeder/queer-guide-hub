import { useTranslation } from 'react-i18next';
import { StationRing } from '@/components/transit/StationRing';
import { isRtlLocale } from '@/lib/locale';

/**
 * Four years as four stations on one line.
 *
 * Same geometry contract as `src/components/personalities/EraLine.tsx` and
 * `NetworkDiagram` next door: every station is a cubic endpoint, the line bends
 * everywhere, and `preserveAspectRatio="none"` +
 * `vector-effect="non-scaling-stroke"` let the band stretch to the page width
 * without fattening the stroke or turning the rings into ellipses (which is
 * why the rings are HTML positioned as a percentage of the band).
 *
 * Below `md` the line is dropped entirely rather than redrawn vertically. Four
 * stations in a 390px viewport is 97px each, which crushes the bodies to two
 * words a line — and a vertical connector would have to be a straight segment,
 * which the design system does not allow for an illustrated line. Stacked
 * station plates say the same thing without either compromise.
 */

const VIEW_W = 300;
const VIEW_H = 44;

/** x values are the 4-column grid centres (12.5 / 37.5 / 62.5 / 87.5 %) so the
 *  HTML ring lands exactly on the SVG point; y values are the endpoints of the
 *  matching cubic in PATH. Change one and you must change the other. */
/** Amplitude is load-bearing, not decoration. A 300x44 viewBox stretched to
 *  1440px flattens vertical variation ~5x, so a y-range of 21-28 (the first
 *  attempt) renders as a straight rule with four dots — visibly off-system
 *  next to the footer's lines. y now swings 14-31, which is most of the band.
 *  The ceiling is the ring: it is 24px across inside a 44-high box, so a
 *  station centre outside [12, 32] clips against the band edge. */
const STATIONS = [
  { x: 37.5, y: 29 },
  { x: 112.5, y: 14 },
  { x: 187.5, y: 31 },
  { x: 262.5, y: 16 },
] as const;

const PATH =
  'M 0 21 C 12 24, 26 27, 37.5 29 C 60 32, 92 16, 112.5 14 ' +
  'C 138 11, 162 29, 187.5 31 C 212 33, 242 18, 262.5 16 C 278 15, 290 14, 300 15';

export interface HistoryStop {
  /** Already-formatted label, e.g. "2021". Never derived from a Date here. */
  year: string;
  body: string;
}

export function HistoryLine({ stops, className }: { stops: HistoryStop[]; className?: string }) {
  const { i18n } = useTranslation();
  // Mirrors the GEOMETRY, never the element — see the note in NetworkDiagram;
  // an `rtl:-scale-x-100` here would double-flip each ring's centring translate
  // AND reverse the year digits. A chronology that runs against the reading
  // direction is worse than a diagram that does, so this one has to mirror.
  const rtl = isRtlLocale(i18n.language);
  const shown = stops.slice(0, STATIONS.length);
  // Mirroring the x is the WHOLE correction — do not also re-index the
  // stations. The grid follows `dir` by itself, so under RTL stop 0 is already
  // in the rightmost column, and `VIEW_W - x0` (37.5 -> 262.5, i.e. 87.5%) is
  // exactly that column's centre. Re-indexing on top of it would send stop 0
  // back to 12.5% and put every year over the wrong station.
  const mx = (x: number) => (rtl ? VIEW_W - x : x);

  return (
    <div className={className}>
      {/* Line + stations — md and up only. */}
      <div className="hidden md:block">
        <div className="relative h-11">
          <svg
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full"
            aria-hidden="true"
          >
            <g transform={rtl ? `translate(${VIEW_W},0) scale(-1,1)` : undefined}>
              <path
                d={PATH}
                fill="none"
                stroke="hsl(var(--track-blue))"
                strokeWidth={6}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          </svg>
          {shown.map((stop, i) => (
            <span
              key={stop.year}
              aria-hidden="true"
              style={{
                left: `${(mx(STATIONS[i].x) / VIEW_W) * 100}%`,
                top: `${(STATIONS[i].y / VIEW_H) * 100}%`,
              }}
              className="pointer-events-none absolute block h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-foreground bg-track-blue"
            />
          ))}
        </div>

        <ol className="m-0 grid list-none grid-cols-4 gap-6 p-0 pt-6">
          {shown.map((stop) => (
            <li key={stop.year}>
              <p className="font-display text-headline leading-none tabular-nums">{stop.year}</p>
              <p className="mt-2 text-13 leading-relaxed text-muted-foreground">{stop.body}</p>
            </li>
          ))}
        </ol>
      </div>

      {/* Stacked station plates — below md. */}
      <ol className="m-0 flex list-none flex-col gap-4 p-0 md:hidden">
        {shown.map((stop) => (
          <li key={stop.year} className="border-[3px] border-foreground p-4">
            <p className="flex items-center gap-2">
              <StationRing state="typed" track="blue" />
              <span className="font-display text-headline leading-none tabular-nums">
                {stop.year}
              </span>
            </p>
            <p className="mt-2 text-13 leading-relaxed text-muted-foreground">{stop.body}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
