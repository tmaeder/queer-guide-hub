import { useTranslation } from 'react-i18next';
import { isRtlLocale } from '@/lib/locale';
import { cn } from '@/lib/utils';

/**
 * The master symbol for /about: four track lines running in from the left and
 * converging on a single station.
 *
 * Geometry follows the same three constraints as
 * `src/components/personalities/EraLine.tsx`:
 *
 *  1. **Every station is a cubic ENDPOINT**, so "is this station on the line?"
 *     is set membership rather than a numeric tolerance.
 *  2. **The line bends everywhere** — hard rule #1 of the design system. There
 *     is no straight segment, including the run-in from the left edge.
 *  3. **`preserveAspectRatio="none"` + `vector-effect="non-scaling-stroke"`**,
 *     because the band has to stretch to the full page width at a fixed height.
 *     Letting the SVG scale uniformly would make a 1600px-wide diagram 512px
 *     tall. That is also why every station ring is an HTML element positioned
 *     as a percentage of the band rather than an SVG `<circle>`: a circle drawn
 *     inside a non-uniformly scaled viewBox renders as an ellipse.
 *
 * This is the one sanctioned `.intersection-gradient` on the page, and it is
 * on the convergence station itself — the four lines blending exactly where
 * they meet, which is the only thing that utility is for. It is never a
 * background wash and never sits under text.
 *
 * **RTL mirrors the GEOMETRY, not the element** — the same rule IntentMap
 * arrived at the hard way. An `rtl:-scale-x-100` on the wrapper flips each
 * ring's own centring translate a SECOND time and lands every station off its
 * line; so the SVG mirrors itself through an internal transform and the rings
 * take mirrored percentages, on ordinary physical `left` the whole way down.
 * Without this the lines converge on the right — where an Arabic reader
 * STARTS — and the diagram reads backwards.
 */

const VIEW_W = 300;
const VIEW_H = 96;

/** Where the four lines meet. Every path's final cubic ends here. */
const JUNCTION = { x: 240, y: 48 } as const;

const LINES = [
  {
    track: 'pink',
    stroke: 'hsl(var(--track-pink))',
    fill: 'bg-track-pink',
    station: { x: 80, y: 14 },
    d: 'M 0 12 C 24 6, 56 20, 80 14 C 112 8, 132 36, 170 40 C 200 43, 222 46, 240 48',
  },
  {
    track: 'blue',
    stroke: 'hsl(var(--track-blue))',
    fill: 'bg-track-blue',
    station: { x: 78, y: 38 },
    d: 'M 0 36 C 26 44, 54 32, 78 38 C 108 44, 136 39, 168 44 C 198 47, 222 47, 240 48',
  },
  {
    track: 'green',
    stroke: 'hsl(var(--track-green))',
    fill: 'bg-track-green',
    station: { x: 78, y: 58 },
    d: 'M 0 60 C 26 52, 54 64, 78 58 C 108 52, 138 57, 168 52 C 198 49, 222 49, 240 48',
  },
  {
    track: 'yellow',
    stroke: 'hsl(var(--track-yellow))',
    fill: 'bg-track-yellow',
    station: { x: 80, y: 82 },
    d: 'M 0 84 C 30 92, 56 76, 80 82 C 112 88, 140 62, 170 56 C 200 51, 222 50, 240 48',
  },
] as const;

const pct = (v: number, span: number) => `${(v / span) * 100}%`;

export function NetworkDiagram({ label, className }: { label: string; className?: string }) {
  const { i18n } = useTranslation();
  // Keyed off the language the way `<html dir>` is, so the diagram mirrors WITH
  // the page and can never mirror against it. Not `i18n.dir()`.
  const rtl = isRtlLocale(i18n.language);
  const mx = (x: number) => (rtl ? VIEW_W - x : x);

  return (
    <div role="img" aria-label={label} className={cn('relative h-24 w-full md:h-32', className)}>
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        <g transform={rtl ? `translate(${VIEW_W},0) scale(-1,1)` : undefined}>
          {LINES.map((line) => (
            <path
              key={line.track}
              d={line.d}
              fill="none"
              stroke={line.stroke}
              strokeWidth={6}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>
      </svg>

      {LINES.map((line) => (
        <span
          key={line.track}
          aria-hidden="true"
          style={{ left: pct(mx(line.station.x), VIEW_W), top: pct(line.station.y, VIEW_H) }}
          className={cn(
            'pointer-events-none absolute block h-4 w-4 -translate-x-1/2 -translate-y-1/2',
            // Ink ring border-gates the fill: blue, green and yellow all measure
            // under 3:1 against paper on their own.
            'rounded-full border border-border-hairline',
            line.fill,
          )}
        />
      ))}

      <span
        aria-hidden="true"
        style={{ left: pct(mx(JUNCTION.x), VIEW_W), top: pct(JUNCTION.y, VIEW_H) }}
        className="intersection-gradient pointer-events-none absolute block h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border border-border-hairline md:h-12 md:w-12"
      />
    </div>
  );
}
