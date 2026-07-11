import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { cn } from '@/lib/utils';
import { localDayKey } from './types';
import type { CalendarItem } from './types';
import { EventChip } from './EventChip';
import { Sparkles } from 'lucide-react';

const MAX_CHIPS = 3;

/**
 * Custom month grid (7 cols × 5-6 rows, date-fns — no calendar lib).
 * Keyboard: roving tabindex, Arrow/Home/End/PageUp/PageDown on the grid.
 * History items collapse to ONE aggregate chip per day (noise rule); the full
 * list lives in the day view. Mobile (<md): dot indicators, tap → day view.
 */
export function MonthGrid({
  date,
  byDay,
  onSelectDay,
}: {
  date: Date;
  byDay: Map<string, CalendarItem[]>;
  onSelectDay: (d: Date) => void;
}) {
  const { t } = useTranslation();
  const today = new Date();

  const days = useMemo(() => {
    const gridStart = startOfWeek(startOfMonth(date), { weekStartsOn: 1 });
    const gridEnd = endOfWeek(endOfMonth(date), { weekStartsOn: 1 });
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [date]);

  const [focusIdx, setFocusIdx] = useState(() => {
    const idx = days.findIndex((d) => isSameDay(d, date));
    return idx >= 0 ? idx : 0;
  });
  const gridRef = useRef<HTMLDivElement>(null);

  const moveFocus = useCallback(
    (nextIdx: number) => {
      const clamped = Math.max(0, Math.min(days.length - 1, nextIdx));
      setFocusIdx(clamped);
      const cell = gridRef.current?.querySelector<HTMLButtonElement>(`[data-idx="${clamped}"]`);
      cell?.focus();
    },
    [days.length],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const handlers: Record<string, () => void> = {
        ArrowLeft: () => moveFocus(focusIdx - 1),
        ArrowRight: () => moveFocus(focusIdx + 1),
        ArrowUp: () => moveFocus(focusIdx - 7),
        ArrowDown: () => moveFocus(focusIdx + 7),
        Home: () => moveFocus(focusIdx - (focusIdx % 7)),
        End: () => moveFocus(focusIdx + (6 - (focusIdx % 7))),
        PageUp: () => moveFocus(0),
        PageDown: () => moveFocus(days.length - 1),
      };
      const handler = handlers[e.key];
      if (handler) {
        e.preventDefault();
        handler();
      }
    },
    [focusIdx, moveFocus, days.length],
  );

  const weekdayLabels = useMemo(() => {
    const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) =>
      addDays(monday, i).toLocaleDateString([], { weekday: 'short' }),
    );
  }, []);

  return (
    <div>
      <div role="grid" aria-label={t('hub.calendar.gridLabel', { defaultValue: 'Calendar' })}>
        <div role="row" className="grid grid-cols-7 border-b border-border">
          {weekdayLabels.map((label) => (
            <div
              key={label}
              role="columnheader"
              className="px-2 py-1 text-13 font-semibold uppercase tracking-wider text-muted-foreground"
            >
              {label}
            </div>
          ))}
        </div>
        <div ref={gridRef} role="rowgroup" className="grid grid-cols-7">
          {days.map((d, idx) => {
            const key = localDayKey(d);
            const items = byDay.get(key) ?? [];
            const nonHistory = items.filter((i) => i.kind !== 'history');
            const historyCount = items.length - nonHistory.length;
            const chips = nonHistory.slice(0, MAX_CHIPS);
            const overflow = nonHistory.length - chips.length;
            const isToday = isSameDay(d, today);
            const inMonth = isSameMonth(d, date);
            const label = `${d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })} — ${t('hub.calendar.cellItems', { defaultValue: '{{count}} items', count: items.length })}`;

            return (
              <button
                key={key}
                type="button"
                role="gridcell"
                data-idx={idx}
                tabIndex={idx === focusIdx ? 0 : -1}
                aria-current={isToday ? 'date' : undefined}
                aria-label={label}
                onClick={() => onSelectDay(d)}
                onKeyDown={onKeyDown}
                onFocus={() => setFocusIdx(idx)}
                className={cn(
                  'flex min-h-11 flex-col items-stretch gap-1 border-b border-r border-border p-1 text-left align-top md:min-h-24',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foreground',
                  !inMonth && 'bg-muted/40 text-muted-foreground',
                  'hover:bg-muted/60',
                )}
              >
                <span
                  className={cn(
                    'flex h-6 w-6 items-center justify-center rounded-full text-13',
                    isToday && 'bg-foreground font-semibold text-background',
                  )}
                >
                  {d.getDate()}
                </span>

                {/* Desktop: chips. */}
                <span className="hidden flex-col gap-0.5 md:flex">
                  {chips.map((item) => (
                    <EventChip key={item.id} item={item} />
                  ))}
                  {historyCount > 0 && (
                    <span className="flex items-center gap-1 rounded-badge border border-border px-1.5 py-0.5 text-2xs text-muted-foreground">
                      <Sparkles className="h-3 w-3 shrink-0" aria-hidden />
                      <span className="truncate">
                        {t('hub.calendar.historyCount', {
                          defaultValue: 'Queer history · {{count}}',
                          count: historyCount,
                        })}
                      </span>
                    </span>
                  )}
                  {overflow > 0 && (
                    <span className="px-1 text-2xs text-muted-foreground">
                      {t('hub.calendar.more', { defaultValue: '+{{count}} more', count: overflow })}
                    </span>
                  )}
                </span>

                {/* Mobile: dots only. */}
                <span className="flex gap-0.5 md:hidden" aria-hidden>
                  {items.slice(0, 4).map((item) => (
                    <span
                      key={item.id}
                      className={cn(
                        'h-1.5 w-1.5 rounded-full',
                        item.kind === 'history' || item.kind === 'news'
                          ? 'bg-muted-foreground/50'
                          : 'bg-foreground',
                      )}
                    />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
