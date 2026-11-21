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
import { Sparkles } from '@/components/icons';

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
    <div className="rounded-container bg-card p-2 shadow-soft sm:p-4">
      <div role="grid" aria-label={t('hub.calendar.gridLabel', { defaultValue: 'Calendar' })}>
        <div role="row" className="grid grid-cols-7">
          {weekdayLabels.map((label) => (
            <div
              key={label}
              role="columnheader"
              className="pb-2 text-center text-2xs font-semibold uppercase tracking-wide text-muted-foreground md:px-2 md:text-left"
            >
              {label}
            </div>
          ))}
        </div>
        <div ref={gridRef} role="rowgroup" className="grid grid-cols-7 gap-1">
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
                  'flex min-h-12 flex-col items-center gap-1 rounded-element p-1 transition-colors md:min-h-24 md:items-stretch md:text-left',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foreground',
                  !inMonth && 'text-muted-foreground/50',
                  'hover:bg-muted',
                )}
              >
                <span
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full text-sm tabular-nums',
                    nonHistory.length > 0 && 'font-bold',
                    isToday && 'bg-foreground font-bold text-background',
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
                    <span className="flex items-center gap-1 rounded-badge px-1.5 py-0.5 text-2xs text-muted-foreground bg-surface-container">
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

                {/* Mobile: a dot per own plan (max 3). History and news are on
                    nearly every day, so dotting them marked every cell. */}
                <span className="flex h-1.5 gap-0.5 md:hidden" aria-hidden>
                  {nonHistory
                    .filter((item) => item.kind !== 'news')
                    .slice(0, 3)
                    .map((item) => (
                      <span key={item.id} className="h-1.5 w-1.5 rounded-full bg-track-pink" />
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
