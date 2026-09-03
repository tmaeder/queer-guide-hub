import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { TimelineYear } from '@/lib/rights/recognitionPerspective';

/**
 * When recognition by self-determination arrived, cumulatively.
 *
 * Built from HTML buttons rather than an SVG plot, for the same reason
 * `HumanityBand` is: every mark a reader can inspect is then a real focusable
 * control with its own accessible name, and the chart needs no parallel
 * `sr-only` table to be readable — the columns ARE the data. An SVG would have
 * bought smoother line joins and cost keyboard access to every point.
 *
 * The plateau years are the point of drawing this at all. 2013, 2017, 2020 and
 * 2021 added nobody, and a bare list of nine dated events would hide that;
 * every year in the span gets a column whether or not it moved.
 *
 * Monochrome, animation-free, no track colours — crisis-adjacent page.
 */

/** Columns shorter than this are unreadable, so the axis starts above zero. */
const MIN_COLUMN_PCT = 4;

export function SelfIdTimeline({ years }: { years: TimelineYear[] }) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<number | null>(null);

  /**
   * Every year in the span, not only the ones that moved — including the
   * plateaus. `cumulative` carries forward across a gap year.
   */
  const columns = useMemo(() => {
    if (years.length === 0) return [];
    const first = years[0].year;
    const last = years[years.length - 1].year;
    const byYear = new Map(years.map((y) => [y.year, y]));
    let carried = 0;
    const out: { year: number; added: string[]; cumulative: number }[] = [];
    for (let y = first; y <= last; y += 1) {
      const hit = byYear.get(y);
      if (hit) carried = hit.cumulative;
      out.push({ year: y, added: hit?.countries ?? [], cumulative: carried });
    }
    return out;
  }, [years]);

  if (columns.length === 0) return null;

  const max = columns[columns.length - 1].cumulative;
  const active = columns.find((c) => c.year === selected) ?? null;

  return (
    <figure className="m-0">
      <div
        role="group"
        aria-label={t(
          'rights.trans.timeline.label',
          'Countries with recognition by self-determination, by year',
        )}
        className="flex h-40 w-full items-end gap-1"
      >
        {columns.map((col) => {
          const pct = Math.max((col.cumulative / max) * 100, MIN_COLUMN_PCT);
          const moved = col.added.length > 0;
          return (
            <button
              key={col.year}
              type="button"
              aria-pressed={selected === col.year}
              aria-label={
                moved
                  ? `${col.year}: ${col.added.join(', ')}. ${col.cumulative} in total.`
                  : `${col.year}: none added. ${col.cumulative} in total.`
              }
              onMouseEnter={() => setSelected(col.year)}
              onFocus={() => setSelected(col.year)}
              onClick={() => setSelected(col.year)}
              className={cn(
                'group flex h-full flex-1 flex-col justify-end',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              )}
            >
              <span
                aria-hidden="true"
                style={{ height: `${pct}%` }}
                className={cn(
                  'block w-full',
                  // A year that added countries is solid ink; a plateau year is
                  // the same height in a lighter tone, so "nothing happened" is
                  // visible as its own state rather than as a missing column.
                  moved ? 'bg-foreground/85' : 'bg-foreground/30',
                  selected === col.year && 'bg-foreground',
                )}
              />
            </button>
          );
        })}
      </div>

      {/* Only the endpoints are labelled — thirteen year labels at this width
          collide, and the readout names whichever year is under the cursor. */}
      <div className="mt-1 flex justify-between text-2xs tabular-nums text-muted-foreground">
        <span>{columns[0].year}</span>
        <span>{columns[columns.length - 1].year}</span>
      </div>

      {/* Fixed height so hovering never reflows the page under the cursor. */}
      <figcaption className="mt-2 min-h-[3.5rem] text-13">
        {active ? (
          <>
            <span className="font-bold tabular-nums">{active.year}</span>
            {' — '}
            {active.added.length > 0 ? (
              <>
                {active.added.join(', ')}.{' '}
                <span className="text-muted-foreground">
                  <span className="tabular-nums">{active.cumulative}</span>{' '}
                  {t('rights.trans.timeline.inTotal', 'in total by the end of this year.')}
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">
                {t(
                  'rights.trans.timeline.none',
                  'No country adopted self-determination this year.',
                )}{' '}
                <span className="tabular-nums">{active.cumulative}</span>{' '}
                {t('rights.trans.timeline.stillTotal', 'in total.')}
              </span>
            )}
          </>
        ) : (
          <span className="text-muted-foreground">
            {t(
              'rights.trans.timeline.caption',
              'Argentina was first, in 2012. Two more countries have the right with no year recorded against it, so the line understates the total by two — and a start year is not a guarantee: our own source lists one country with a 2017 start date that it no longer counts as self-determination at all.',
            )}
          </span>
        )}
      </figcaption>
    </figure>
  );
}

export default SelfIdTimeline;
