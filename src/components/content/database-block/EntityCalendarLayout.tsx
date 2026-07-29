import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { localDayKey, toCalendarBuckets } from '@/lib/databaseBlock/normalize';
import { cn } from '@/lib/utils';
import type { EntityLayoutProps } from './layoutTypes';

/**
 * Month grid.
 *
 * Deliberately does not reuse hub/calendar/MonthGrid: that component is typed
 * to the hub's AgendaItem and carries layer/trip chrome a document block has no
 * use for. The day bucketing — the part worth sharing — lives in
 * lib/databaseBlock/normalize and IS shared.
 *
 * Opens on the month of the earliest record rather than today, so a block about
 * a past or future season isn't empty on arrival.
 */

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MAX_CHIPS = 3;

/** Monday-first offset for the 1st of the month. */
function leadingBlanks(year: number, month: number): number {
  return (new Date(year, month, 1).getDay() + 6) % 7;
}

export function EntityCalendarLayout({ cards, isLoading }: EntityLayoutProps) {
  const buckets = useMemo(() => toCalendarBuckets(cards), [cards]);

  const initialMonth = useMemo(() => {
    const earliest = cards.reduce<number | null>(
      (acc, c) => (c.startMs === null ? acc : acc === null ? c.startMs : Math.min(acc, c.startMs)),
      null,
    );
    const d = earliest === null ? new Date() : new Date(earliest);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }, [cards]);

  const [month, setMonth] = useState(initialMonth);
  // Keyed remount on the data changing would lose the reader's navigation, so
  // the month only follows the data when the block itself changes identity.
  const [seenInitial, setSeenInitial] = useState(initialMonth.getTime());
  if (seenInitial !== initialMonth.getTime()) {
    setSeenInitial(initialMonth.getTime());
    setMonth(initialMonth);
  }

  if (isLoading && cards.length === 0) {
    return <Skeleton className="h-80 w-full rounded-container" />;
  }

  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const blanks = leadingBlanks(year, monthIndex);

  const shift = (delta: number) => setMonth(new Date(year, monthIndex + delta, 1));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <span className="text-title font-medium">
          {month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => shift(-1)}
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => shift(1)} aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px border border-border bg-border rounded-container overflow-hidden">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="bg-muted px-2 py-2 text-center text-2xs uppercase tracking-wide text-muted-foreground"
          >
            {day}
          </div>
        ))}

        {Array.from({ length: blanks }, (_, i) => (
          <div key={`blank-${i}`} className="min-h-20 bg-background" />
        ))}

        {Array.from({ length: daysInMonth }, (_, i) => {
          const date = new Date(year, monthIndex, i + 1);
          const dayCards = buckets.get(localDayKey(date)) ?? [];
          const isToday = localDayKey(new Date()) === localDayKey(date);

          return (
            <div key={i} className="flex min-h-20 flex-col gap-1 bg-background p-1">
              <span
                className={cn(
                  'text-2xs',
                  isToday ? 'font-semibold text-foreground' : 'text-muted-foreground',
                )}
              >
                {i + 1}
              </span>
              {dayCards.slice(0, MAX_CHIPS).map((card) =>
                card.href ? (
                  <Link
                    key={card.docId}
                    to={card.href}
                    className="truncate bg-muted px-1 py-0.5 text-2xs no-underline rounded-badge hover:bg-accent"
                    title={card.title}
                  >
                    {card.title}
                  </Link>
                ) : (
                  <span
                    key={card.docId}
                    className="truncate bg-muted px-1 py-0.5 text-2xs rounded-badge"
                    title={card.title}
                  >
                    {card.title}
                  </span>
                ),
              )}
              {dayCards.length > MAX_CHIPS && (
                <span className="px-1 text-2xs text-muted-foreground">
                  +{dayCards.length - MAX_CHIPS}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
