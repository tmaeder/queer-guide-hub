import { cn } from '@/lib/utils';
import { PAGE_BLEED, PAGE_GUTTER } from '@/components/layout/PageContainer';
import { PICKER_H, horizontalLine, pct } from '@/components/transit/lineGeometry';
import { TRACK_BG, type Track } from '@/components/transit/routeBulletMap';

/**
 * A row of choices drawn as stations on one bending line.
 *
 * Descended from `src/components/personalities/EraLine.tsx`, generalised to a
 * variable station count and given a disabled state. Two things are inherited
 * deliberately:
 *
 *  * **Semantics: a toggle-button group, not a radio group and not a tablist.**
 *    Re-clicking the active station clears the filter, which `role="radio"`
 *    cannot express, and a tablist would promise one panel per tab when there
 *    is a single shared result region. The `aria-label` carries the full label
 *    while the visible text is the short form.
 *  * **Selecting a station is a FILTER, not progress.** That is why this is not
 *    `LineStepper`, whose whole semantic is that everything before `current`
 *    renders "done".
 *
 * What it adds is the empty state. A season with nothing in it is still SHOWN,
 * with its real numbers, and is `aria-disabled` rather than `disabled`: a
 * disabled button drops out of the tab order and explains nothing, and here the
 * explanation is the entire point — "December is thin" is information, an
 * invisible chip is not.
 *
 * The segment under a disabled station renders in INK, thin. Ink is the absence
 * of a track, not another track — the same move `eraStroke` makes for the
 * restrained eras on /history — so the empty state never becomes a colour code.
 */

export interface PickerOption {
  id: string;
  /** Full label; becomes the accessible name. */
  label: string;
  /** Short visible label. Defaults to `label`. */
  short?: string;
  /** Second line under the label — a count, a range, a caveat. */
  meta?: string;
  /** Shown but not selectable. Always pair with `disabledReason`. */
  disabled?: boolean;
  /** Appended to the accessible name so the reason is spoken, not just seen. */
  disabledReason?: string;
}

const TRACK_STROKE: Record<Track, string> = {
  pink: 'hsl(var(--track-pink))',
  blue: 'hsl(var(--track-blue))',
  green: 'hsl(var(--track-green))',
  yellow: 'hsl(var(--track-yellow))',
};

interface PickerLineProps {
  options: PickerOption[];
  activeId: string | null;
  onSelect: (id: string | null) => void;
  /** Accessible name for the group. */
  label: string;
  track?: Track;
  className?: string;
}

export function PickerLine({
  options,
  activeId,
  onSelect,
  label,
  track = 'pink',
  className,
}: PickerLineProps) {
  const n = options.length;
  if (n < 2) return null;

  const line = horizontalLine(n, PICKER_H);

  return (
    // Scrolls rather than squashes — five labels in a 390px viewport is 78px
    // each, which crushes anything longer than a word. PAGE_BLEED rather than a
    // flat `-mx-4`: against the `sm:px-6 md:px-8` gutter ladder a flat -4 leaves
    // an 8px notch at sm and 16px at md.
    <div
      className={cn(
        PAGE_BLEED,
        PAGE_GUTTER,
        'overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
    >
      <div className="min-w-[520px] pt-2">
        {/* The band and the SVG share one coordinate space, so the rings are
            positioned against THIS box — not against their own grid cell. A
            percentage inside the <li> resolves against the cell's width, which
            puts every ring a fraction of the way into its own column instead of
            on the station. */}
        <div className="relative h-11">
          <svg
            viewBox={line.viewBox}
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full"
            aria-hidden="true"
          >
            {line.segments.map((d, i) => (
              <path
                key={options[i].id}
                d={d}
                fill="none"
                stroke={options[i].disabled ? 'hsl(var(--foreground))' : TRACK_STROKE[track]}
                strokeWidth={options[i].disabled ? 2.4 : 6}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>

          {options.map((option, i) => (
            <span
              key={option.id}
              aria-hidden="true"
              style={{
                left: pct(line.stations[i].x, line.w),
                top: pct(line.stations[i].y, line.h),
              }}
              className={cn(
                'pointer-events-none absolute block h-6 w-6 -translate-x-1/2 -translate-y-1/2',
                'rounded-full border-[3px] border-foreground transition-colors duration-fast',
                // The ink ring border-gates the fill: the track colours are
                // fill-only and clear 3:1 against paper on their own, but the
                // ring is what makes the set read as one system.
                activeId === option.id && !option.disabled
                  ? TRACK_BG[track]
                  : 'bg-background',
              )}
            />
          ))}
        </div>

        <ul
          role="group"
          aria-label={label}
          className="m-0 grid list-none p-0"
          // Not a `grid-cols-${n}` template literal — Tailwind purges classes it
          // cannot see as whole strings, and n changes with the option set.
          style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
        >
          {options.map((option) => {
            const active = activeId === option.id && !option.disabled;
            return (
              <li key={option.id}>
                <button
                  type="button"
                  onClick={() => !option.disabled && onSelect(active ? null : option.id)}
                  aria-pressed={active}
                  aria-disabled={option.disabled || undefined}
                  aria-label={
                    option.disabled && option.disabledReason
                      ? `${option.label} — ${option.disabledReason}`
                      : option.label
                  }
                  className={cn(
                    'flex w-full flex-col items-center gap-0.5 px-1 pb-2 pt-2 text-center',
                    'transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2',
                    'focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    option.disabled
                      ? 'cursor-not-allowed text-muted-foreground opacity-60'
                      : active
                        ? 'text-foreground'
                        : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <span className={cn('text-13 leading-tight', active ? 'font-bold' : 'font-medium')}>
                    {option.short ?? option.label}
                  </span>
                  {option.meta && (
                    <span className="text-2xs tabular-nums text-muted-foreground">{option.meta}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
