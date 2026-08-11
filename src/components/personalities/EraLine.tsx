import { ERAS, type EraKey } from '@/lib/personalitiesFilters';
import { cn } from '@/lib/utils';

/**
 * The five eras as five stations on the P line.
 *
 * `ERAS` was already five chronological chapters of LGBTQ+ history in
 * birth-year order, which is a line with five stops — it was just being drawn
 * as a flat row of pill buttons. This renders the thing it always was.
 *
 * Three constraints shaped the geometry:
 *
 *  1. **Every station is a cubic ENDPOINT.** A cubic bezier passes exactly
 *     through P0 and P3 by definition, so "is this station on the line?" is
 *     set membership rather than a numeric tolerance. Same reasoning as
 *     `src/components/home/subway/intentMapGeometry` — see IntentMap.
 *  2. **The line bends everywhere.** Hard rule #1 of the design system; there
 *     is no straight `H` segment, including the lead-in and run-out.
 *  3. **`preserveAspectRatio="none"` + `vector-effect="non-scaling-stroke"`.**
 *     The band has to stretch to whatever width the grid is while keeping a
 *     fixed height, or the HTML rings (which are positioned as a percentage of
 *     that band) drift off the path. Letting the SVG scale uniformly instead
 *     would make a 1000px-wide line 147px tall. The non-scaling stroke is what
 *     stops the horizontal stretch from also fattening the stroke.
 *
 * Selecting a station is a FILTER, not progress — picking "Stonewall" does not
 * make pre-Stonewall "done" — which is why this is not
 * `src/components/transit/LineStepper.tsx`, whose whole semantic is that
 * everything before `current` renders complete.
 */

/** Station x/y inside the 300×44 viewBox. Each x is a 5-column grid centre
 *  (10/30/50/70/90 %) so the HTML ring and the SVG point coincide exactly;
 *  each y is the endpoint of the matching cubic in PATH below. Change one and
 *  you must change the other. */
const STATIONS = [
  { x: 30, y: 26 },
  { x: 90, y: 16 },
  { x: 150, y: 27 },
  { x: 210, y: 15 },
  { x: 270, y: 24 },
] as const;

const PATH =
  'M 0 30 C 12 28, 20 27, 30 26 C 45 24, 70 15, 90 16 C 112 17, 132 28, 150 27 ' +
  'C 172 26, 198 14, 210 15 C 232 17, 252 25, 270 24 C 282 23, 292 22, 300 22';

const VIEW_W = 300;
const VIEW_H = 44;

/** 1800 and 2099 are open-ended sentinels in ERAS, not real bounds. */
function rangeLabel(min: number, max: number): string {
  if (min <= 1800) return `–${max}`;
  if (max >= 2099) return `${min}–`;
  return `${min}–${max}`;
}

interface EraLineProps {
  activeEra?: EraKey;
  onEraSelect: (era: EraKey | undefined) => void;
  className?: string;
}

export function EraLine({ activeEra, onEraSelect, className }: EraLineProps) {
  const keys = Object.keys(ERAS) as EraKey[];

  return (
    // Scrolls rather than squashes: five labels in a 390px viewport is 78px
    // each, which crushes "Pre-Stonewall". Bleeds to the page gutter like the
    // other rails on this page.
    <div className={cn('-mx-4 overflow-x-auto px-4', className)}>
      <div className="min-w-[520px] pt-2">
        {/* The band and the SVG share one coordinate space, so the rings are
            positioned against THIS box — not against their own grid cell. A
            percentage inside the `<li>` resolves against the cell's width, so
            `left: 10%` put every ring a tenth of the way into its own column
            instead of at the station. */}
        <div className="relative h-11">
          <svg
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full"
            aria-hidden="true"
          >
            <path
              d={PATH}
              fill="none"
              stroke="hsl(var(--track-pink))"
              strokeWidth={6}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {keys.map((key, i) => (
            <span
              key={key}
              aria-hidden="true"
              style={{
                left: `${(STATIONS[i].x / VIEW_W) * 100}%`,
                top: `${(STATIONS[i].y / VIEW_H) * 100}%`,
              }}
              className={cn(
                'pointer-events-none absolute block h-6 w-6 -translate-x-1/2 -translate-y-1/2',
                'rounded-full border-[3px] border-foreground transition-colors',
                // The ink ring border-gates the fill — pink alone clears 3:1
                // on paper, but the set has to read as one system.
                activeEra === key ? 'bg-track-pink' : 'bg-background',
              )}
            />
          ))}
        </div>

        <ul className="m-0 grid list-none grid-cols-5 p-0">
          {keys.map((key) => {
            const era = ERAS[key];
            const active = activeEra === key;
            // "Stonewall era (1969–80)" → "Stonewall era" + "1969–80". The
            // accessible name stays the FULL ERAS label, which is what
            // e2e/personalities-views.spec.ts selects on.
            const [name] = era.label.split(' (');

            return (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => onEraSelect(active ? undefined : key)}
                  aria-pressed={active}
                  aria-label={era.label}
                  className={cn(
                    'flex w-full flex-col items-center gap-0.5 px-1 pt-2 pb-2 text-center transition-colors',
                    active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <span
                    className={cn('text-13 leading-tight', active ? 'font-bold' : 'font-medium')}
                  >
                    {name}
                  </span>
                  <span className="text-2xs tabular-nums text-muted-foreground">
                    {rangeLabel(era.min, era.max)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
