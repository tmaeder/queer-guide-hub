import { cn } from '@/lib/utils';

export interface HoursRow {
  /** Display name, e.g. "Mon". */
  day: string;
  /** Opening string, or a closed label. */
  open: string;
  /** Right-aligned uppercase note, e.g. "Today" / "Late floor". */
  note?: string;
}

/**
 * The bordered opening-hours table from the venue single
 * ("Singles Venue Event Tag.dc.html" → Hours).
 *
 * TODAY is an ink-flooded row, not a coloured one: which day it is now is the
 * single fact a reader is scanning for, and inverting the row is the strongest
 * signal the system has that costs no colour. Track colours stay reserved for
 * wayfinding.
 *
 * `todayIndex` is passed in rather than computed here so the caller decides
 * the timezone — a venue's "today" is its own local day, not the reader's, and
 * a component that called `new Date()` itself would silently assume otherwise.
 */
export function HoursTable({
  rows,
  todayIndex,
  className,
}: {
  rows: HoursRow[];
  todayIndex?: number;
  className?: string;
}) {
  if (rows.length === 0) return null;

  return (
    <div className={cn('flex flex-col gap-0.5', className)}>
      {rows.map((r, i) => {
        const isToday = i === todayIndex;
        return (
          <div
            key={r.day}
            aria-current={isToday ? 'date' : undefined}
            className={cn(
              'grid grid-cols-[6rem_1fr_auto] items-baseline gap-4 rounded-element px-4 py-2',
              isToday ? 'bg-foreground font-bold text-background' : undefined,
            )}
          >
            <span className="text-15 font-bold">{r.day}</span>
            <span className="text-15 tabular-nums">{r.open}</span>
            {r.note && (
              <span className="text-2xs font-bold uppercase tracking-label">{r.note}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
