import { useMemo, useRef, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import type { SearchResult } from '@/hooks/useSearch';
import { SearchResultCard } from './SearchResultCard';

export interface SearchCalendarViewProps {
  results: SearchResult[];
  query: string;
  onSelect: (result: SearchResult) => void;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Calendar view for dated search results (events). A month grid marks days that
 * have events; below it an agenda lists results grouped by day. Selecting a day
 * scrolls the agenda to it. Undated results fall into a trailing section.
 * Read-only over the current result set (no fetch of its own).
 */
export function SearchCalendarView({ results, query, onSelect }: SearchCalendarViewProps) {
  const { t } = useTranslation();
  const agendaRef = useRef<HTMLDivElement>(null);
  const dayRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const { byDay, dayKeys, eventDates, undated } = useMemo(() => {
    const map = new Map<string, SearchResult[]>();
    const undatedList: SearchResult[] = [];
    for (const r of results) {
      if (!r.date) {
        undatedList.push(r);
        continue;
      }
      const d = new Date(r.date);
      if (Number.isNaN(d.getTime())) {
        undatedList.push(r);
        continue;
      }
      const k = dayKey(d);
      const arr = map.get(k);
      if (arr) arr.push(r);
      else map.set(k, [r]);
    }
    const keys = [...map.keys()].sort();
    return {
      byDay: map,
      dayKeys: keys,
      eventDates: keys.map((k) => new Date(`${k}T00:00:00`)),
      undated: undatedList,
    };
  }, [results]);

  const [month, setMonth] = useState<Date>(() => eventDates[0] ?? new Date());
  const [selected, setSelected] = useState<Date | undefined>(undefined);

  // Keep the visible month anchored to the first event when results change.
  const firstDayKey = dayKeys[0];
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync visible month to data.
    if (eventDates[0]) setMonth(eventDates[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstDayKey]);

  const handleSelect = (d: Date | undefined) => {
    setSelected(d);
    if (!d) return;
    const k = dayKey(d);
    dayRefs.current[k]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const fmtHeading = (k: string) =>
    new Date(`${k}T00:00:00`).toLocaleDateString(undefined, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });

  return (
    <div className="grid gap-6 md:grid-cols-[auto_1fr]">
      <div className="rounded-element border border-border md:self-start">
        <Calendar
          mode="single"
          month={month}
          onMonthChange={setMonth}
          selected={selected}
          onSelect={handleSelect}
          modifiers={{ hasEvents: eventDates }}
          modifiersClassNames={{ hasEvents: 'font-bold underline underline-offset-4' }}
        />
      </div>

      <div ref={agendaRef} className="flex flex-col gap-6">
        {dayKeys.length === 0 && undated.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t('search.calendar.empty', 'No dated results to show.')}
          </p>
        )}

        {dayKeys.map((k) => (
          <section
            key={k}
            ref={(el) => {
              dayRefs.current[k] = el;
            }}
            aria-label={fmtHeading(k)}
          >
            <h3
              className={cn(
                'mb-2 text-13 font-semibold uppercase tracking-wider',
                selected && dayKey(selected) === k ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {fmtHeading(k)}
            </h3>
            <div className="flex flex-col gap-3">
              {byDay.get(k)!.map((r) => (
                <SearchResultCard
                  key={`${r.type}-${r.objectID}`}
                  result={r}
                  view="list"
                  query={query}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </section>
        ))}

        {undated.length > 0 && (
          <section aria-label={t('search.calendar.undated', 'Undated')}>
            <h3 className="mb-2 text-13 font-semibold uppercase tracking-wider text-muted-foreground">
              {t('search.calendar.undated', 'Undated')}
            </h3>
            <div className="flex flex-col gap-3">
              {undated.map((r) => (
                <SearchResultCard
                  key={`${r.type}-${r.objectID}`}
                  result={r}
                  view="list"
                  query={query}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
