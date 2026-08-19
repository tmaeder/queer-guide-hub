import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { dateOf, dayKey, monthLabel } from './dateFields';
import type { ListItem } from './types';

/**
 * Calendar view for any content type.
 *
 * A deliberately small month grid rather than a reuse of the hub's MonthGrid:
 * that one is entangled with CalendarItem, EventChip, calendar layers and a
 * history-aggregation rule, and has one live user-facing caller. Genericizing
 * it to serve an admin list would refactor a working surface for a secondary
 * consumer. Only the pure day-key helper is shared.
 *
 * Records with no date for the chosen field are surfaced in a count below the
 * grid instead of being dropped — otherwise the calendar would quietly claim a
 * type has fewer records than it does.
 */

interface ContentListCalendarProps {
  items: ListItem[];
  loading: boolean;
  /** Field name to plot against. Null means the record's updated_at. */
  dateField: string | null;
  onEdit: (contentType: string, id: string) => void;
}

const MAX_CHIPS = 3;
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Monday-first 6×7 grid covering the month, including the bleed days. */
function gridDays(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  // getDay() is Sunday-first; shift so Monday is 0.
  const lead = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - lead);

  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

export function ContentListCalendar({
  items,
  loading,
  dateField,
  onEdit,
}: ContentListCalendarProps) {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const { byDay, undatedCount } = useMemo(() => {
    const map = new Map<string, ListItem[]>();
    let undated = 0;
    for (const item of items) {
      const d = dateOf(item, dateField);
      if (!d) {
        undated++;
        continue;
      }
      const key = dayKey(d);
      const existing = map.get(key);
      if (existing) existing.push(item);
      else map.set(key, [item]);
    }
    return { byDay: map, undatedCount: undated };
  }, [items, dateField]);

  const days = useMemo(() => gridDays(month), [month]);
  const todayKey = dayKey(new Date());

  const shift = (delta: number) =>
    setMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));

  if (loading) {
    return <Skeleton className="h-[520px] w-full rounded-container" />;
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
          aria-label="Previous month"
          onClick={() => shift(-1)}
        >
          <ChevronLeft size={16} />
        </Button>
        <span className="text-sm font-semibold min-w-[160px] text-center">{monthLabel(month)}</span>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
          aria-label="Next month"
          onClick={() => shift(1)}
        >
          <ChevronRight size={16} />
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7"
          onClick={() => {
            const now = new Date();
            setMonth(new Date(now.getFullYear(), now.getMonth(), 1));
          }}
        >
          Today
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-px bg-border rounded-container overflow-hidden">
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className="bg-background px-2 py-1 text-2xs uppercase tracking-wide text-muted-foreground font-semibold"
          >
            {d}
          </div>
        ))}

        {days.map((day) => {
          const key = dayKey(day);
          const dayItems = byDay.get(key) ?? [];
          const inMonth = day.getMonth() === month.getMonth();
          return (
            <div
              key={key}
              className={`bg-background min-h-[96px] p-2 flex flex-col gap-1 ${
                inMonth ? '' : 'opacity-40'
              }`}
            >
              <span
                className={`text-xs ${
                  key === todayKey ? 'font-bold text-foreground' : 'text-muted-foreground'
                }`}
              >
                {day.getDate()}
              </span>
              {dayItems.slice(0, MAX_CHIPS).map((item) => (
                <button
                  key={`${item.contentType}:${item.id}`}
                  type="button"
                  onClick={() => onEdit(item.contentType, item.id)}
                  title={item.title}
                  className="text-left text-xs2 leading-tight border border-border rounded-badge px-1 py-0.5 truncate transition-colors hover:bg-muted"
                >
                  {item.title}
                </button>
              ))}
              {dayItems.length > MAX_CHIPS && (
                <span className="text-xs2 text-muted-foreground">
                  +{dayItems.length - MAX_CHIPS} more
                </span>
              )}
            </div>
          );
        })}
      </div>

      {undatedCount > 0 && (
        <p className="text-xs text-muted-foreground mt-2">
          {undatedCount} record{undatedCount === 1 ? '' : 's'} on this page have no date and are not
          shown. The Timeline view lists them.
        </p>
      )}
    </div>
  );
}
