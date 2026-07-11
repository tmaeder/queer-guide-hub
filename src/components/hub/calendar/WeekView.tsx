import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { addDays, isSameDay, startOfWeek } from 'date-fns';
import { cn } from '@/lib/utils';
import { AgendaRow } from '@/components/hub/AgendaRow';
import { localDayKey } from './types';
import type { CalendarItem } from './types';
import { EventChip } from './EventChip';

/**
 * Week view. Desktop: 7 columns, all-day items in a top lane, timed items
 * stacked by time below (stacked lists — no hour grid, YAGNI). Mobile:
 * stacked day sections reusing AgendaRow.
 */
export function WeekView({
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
    const start = startOfWeek(date, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [date]);

  return (
    <div>
      {/* Desktop columns */}
      <div className="hidden grid-cols-7 md:grid">
        {days.map((d) => {
          const items = byDay.get(localDayKey(d)) ?? [];
          const allDay = items.filter((i) => i.all_day);
          const timed = items.filter((i) => !i.all_day);
          const isToday = isSameDay(d, today);
          return (
            <div key={localDayKey(d)} className="flex min-h-48 flex-col gap-1 border-b border-r border-border p-1">
              <button
                type="button"
                onClick={() => onSelectDay(d)}
                className="flex items-center gap-1 px-1 py-0.5 text-left"
              >
                <span
                  className={cn(
                    'flex h-6 w-6 items-center justify-center rounded-full text-13',
                    isToday && 'bg-foreground font-semibold text-background',
                  )}
                  aria-current={isToday ? 'date' : undefined}
                >
                  {d.getDate()}
                </span>
                <span className="text-13 text-muted-foreground">
                  {d.toLocaleDateString([], { weekday: 'short' })}
                </span>
              </button>
              {allDay.map((item) => (
                <EventChip key={item.id} item={item} />
              ))}
              {timed.map((item) => (
                <div key={item.id} className="flex flex-col">
                  <span className="px-1 text-2xs tabular-nums text-muted-foreground">
                    {new Date(item.starts_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  <EventChip item={item} />
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Mobile stacked sections */}
      <div className="flex flex-col gap-6 md:hidden">
        {days.map((d) => {
          const items = byDay.get(localDayKey(d)) ?? [];
          if (items.length === 0) return null;
          const isToday = isSameDay(d, today);
          return (
            <section key={localDayKey(d)} className="flex flex-col gap-2">
              <h3
                className={cn(
                  'text-13 font-semibold uppercase tracking-wider text-muted-foreground',
                  isToday && 'text-foreground',
                )}
              >
                {isToday
                  ? t('hub.calendar.today', { defaultValue: 'Today' })
                  : d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}
              </h3>
              {items.map((item) => (
                <AgendaRow key={item.id} item={item} />
              ))}
            </section>
          );
        })}
        {days.every((d) => (byDay.get(localDayKey(d)) ?? []).length === 0) && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t('hub.calendar.weekEmpty', { defaultValue: 'Nothing this week.' })}
          </p>
        )}
      </div>
    </div>
  );
}
