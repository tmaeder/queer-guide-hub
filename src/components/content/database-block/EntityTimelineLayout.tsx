import { Link } from 'react-router';
import { Skeleton } from '@/components/ui/skeleton';
import { toTimelineData } from '@/lib/databaseBlock/normalize';
import type { EntityLayoutProps } from './layoutTypes';

/**
 * Gantt-style horizontal timeline.
 *
 * A fresh, small component rather than a reuse of EventsTimelineView: that one
 * is 613 lines hard-typed to the events row and carries zoom/pan/minimap state
 * a document block does not want. The pure utilities it sits on are the
 * genuinely reusable part, and the arithmetic here is simple enough to keep
 * local and testable.
 *
 * Undated records are surfaced under the chart instead of being dropped —
 * silently omitting them would misrepresent the block's contents.
 */

const MIN_BAR_PERCENT = 1.5;

function formatRange(startMs: number, endMs: number): string {
  const fmt = (ms: number) =>
    new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  return startMs === endMs ? fmt(startMs) : `${fmt(startMs)} – ${fmt(endMs)}`;
}

export function EntityTimelineLayout({ cards, isLoading }: EntityLayoutProps) {
  if (isLoading && cards.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-8 w-full rounded-element" />
        ))}
      </div>
    );
  }

  const { items, undated, rangeStartMs, rangeEndMs } = toTimelineData(cards);

  if (items.length === 0 && undated.length === 0) return null;

  // Guard the zero-width case: a block whose records all share one instant
  // would otherwise divide by zero.
  const span = rangeStartMs !== null && rangeEndMs !== null ? rangeEndMs - rangeStartMs : 0;
  const scale = span > 0 ? span : 1;

  return (
    <div className="flex flex-col gap-4">
      {items.length > 0 && (
        <>
          <div className="flex items-center justify-between text-2xs uppercase tracking-wide text-muted-foreground">
            <span>{rangeStartMs !== null && new Date(rangeStartMs).getFullYear()}</span>
            <span>{rangeEndMs !== null && new Date(rangeEndMs).getFullYear()}</span>
          </div>

          <ul className="flex list-none flex-col gap-2 p-0">
            {items.map(({ card, startMs, endMs }) => {
              const left = rangeStartMs === null ? 0 : ((startMs - rangeStartMs) / scale) * 100;
              const width = Math.max(((endMs - startMs) / scale) * 100, MIN_BAR_PERCENT);
              const label = `${card.title}, ${formatRange(startMs, endMs)}`;

              return (
                <li key={card.docId} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between gap-4">
                    {card.href ? (
                      <Link to={card.href} className="text-13 font-medium no-underline hover:underline">
                        {card.title}
                      </Link>
                    ) : (
                      <span className="text-13 font-medium">{card.title}</span>
                    )}
                    <span className="shrink-0 text-2xs text-muted-foreground">
                      {formatRange(startMs, endMs)}
                    </span>
                  </div>
                  <div
                    className="relative h-2 w-full bg-muted rounded-badge"
                    role="img"
                    aria-label={label}
                  >
                    <div
                      className="absolute inset-y-0 bg-foreground rounded-badge"
                      style={{
                        left: `${Math.min(left, 100 - MIN_BAR_PERCENT)}%`,
                        width: `${Math.min(width, 100)}%`,
                      }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {undated.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <span className="text-2xs uppercase tracking-wide text-muted-foreground">
            No date recorded
          </span>
          <ul className="flex list-none flex-wrap gap-2 p-0">
            {undated.map((card) => (
              <li key={card.docId}>
                {card.href ? (
                  <Link
                    to={card.href}
                    className="inline-block border border-border px-2 py-1 text-13 no-underline rounded-badge hover:bg-accent"
                  >
                    {card.title}
                  </Link>
                ) : (
                  <span className="inline-block border border-border px-2 py-1 text-13 rounded-badge">
                    {card.title}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
