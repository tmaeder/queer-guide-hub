import { useMemo, useRef, useEffect } from 'react';
import type { PrideCalendarEvent } from '@/hooks/usePrideCalendar';
import { cn } from '@/lib/utils';

interface PrideTimelineProps {
  events: PrideCalendarEvent[];
  year: number;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface PlacedEvent {
  event: PrideCalendarEvent;
  monthIndex: number;
  dayInMonth: number;
  row: number;
}

function placeEvents(events: PrideCalendarEvent[]): PlacedEvent[] {
  const byMonth: Record<number, PlacedEvent[]> = {};
  const placed: PlacedEvent[] = [];
  for (const e of events) {
    const d = new Date(e.start_date);
    const monthIndex = d.getUTCMonth();
    const dayInMonth = d.getUTCDate();
    const monthList = (byMonth[monthIndex] ??= []);
    // find row: lowest row where no event within 2 days exists
    let row = 0;
    while (monthList.some((p) => p.row === row && Math.abs(p.dayInMonth - dayInMonth) < 2)) {
      row++;
    }
    const item = { event: e, monthIndex, dayInMonth, row };
    monthList.push(item);
    placed.push(item);
  }
  return placed;
}

export function PrideTimeline({ events, year, selectedId, onSelect }: PrideTimelineProps) {
  const placed = useMemo(() => placeEvents(events), [events]);
  const maxRow = useMemo(
    () => placed.reduce((m, p) => (p.row > m ? p.row : m), 0),
    [placed],
  );
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const today = new Date();
  const showToday = today.getUTCFullYear() === year;
  const todayMonthIndex = today.getUTCMonth();
  const todayDay = today.getUTCDate();

  // Scroll selected into view
  useEffect(() => {
    if (!selectedId || !scrollRef.current) return;
    const el = scrollRef.current.querySelector<HTMLButtonElement>(`[data-event-id="${selectedId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      el.focus({ preventScroll: true });
    }
  }, [selectedId]);

  const rowHeight = 26;
  const trackHeight = (maxRow + 1) * rowHeight + 16;

  return (
    <div className="w-full">
      {/* Month chips */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-2 scrollbar-thin">
        {MONTHS.map((m, i) => {
          const count = placed.filter((p) => p.monthIndex === i).length;
          if (count === 0) {
            return (
              <span
                key={m}
                className="px-2 py-1 text-xs2 text-foreground/40 rounded-badge border border-foreground/10"
              >
                {m}
              </span>
            );
          }
          return (
            <button
              key={m}
              type="button"
              onClick={() => {
                const el = scrollRef.current?.querySelector<HTMLDivElement>(`[data-month="${i}"]`);
                el?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
              }}
              className="px-2 py-1 text-xs2 rounded-badge border border-foreground/20 hover:bg-muted transition-colors"
            >
              {m} <span className="text-foreground/50">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Timeline track */}
      <div
        ref={scrollRef}
        className="relative overflow-x-auto border border-foreground/10 rounded-container bg-background"
        role="region"
        aria-label="Pride events timeline"
      >
        <div
          className="relative"
          style={{ width: '1800px', height: trackHeight, minWidth: '100%' }}
        >
          {/* Month columns */}
          <div className="absolute inset-0 grid" style={{ gridTemplateColumns: 'repeat(12, 1fr)' }}>
            {MONTHS.map((m, i) => (
              <div
                key={m}
                data-month={i}
                className={cn(
                  'relative border-r border-foreground/10 last:border-r-0',
                  i % 2 === 1 && 'bg-muted/30',
                )}
              >
                <div className="sticky top-0 z-10 px-2 py-1 text-xs2 font-medium tracking-wide text-foreground/70 bg-background/95 border-b border-foreground/10">
                  {m}
                </div>
              </div>
            ))}
          </div>

          {/* Today marker */}
          {showToday && (
            <div
              className="absolute top-7 bottom-2 w-px bg-foreground/80 z-20"
              style={{
                left: `${((todayMonthIndex + (todayDay - 1) / 31) / 12) * 100}%`,
              }}
              aria-hidden="true"
            >
              <div className="absolute -top-1 -translate-x-1/2 text-[9px] uppercase tracking-wider bg-foreground text-background px-1 rounded-badge">
                Today
              </div>
            </div>
          )}

          {/* Event dots */}
          {placed.map((p) => {
            const xPct = ((p.monthIndex + (p.dayInMonth - 1) / 31) / 12) * 100;
            const isSelected = selectedId === p.event.id;
            return (
              <button
                key={p.event.id}
                type="button"
                data-event-id={p.event.id}
                onClick={() => onSelect?.(isSelected ? null : p.event.id)}
                title={`${p.event.title} — ${new Date(p.event.start_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`}
                className={cn(
                  'absolute -translate-x-1/2 rounded-full border border-foreground transition-all',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2',
                  isSelected
                    ? 'bg-foreground w-4 h-4 z-30'
                    : p.event.is_featured
                      ? 'bg-foreground w-3 h-3 z-10 hover:scale-125'
                      : 'bg-background w-2.5 h-2.5 z-10 hover:scale-125 hover:bg-foreground',
                )}
                style={{
                  left: `${xPct}%`,
                  top: `${36 + p.row * rowHeight}px`,
                }}
                aria-label={`${p.event.title} on ${new Date(p.event.start_date).toLocaleDateString()}`}
                aria-pressed={isSelected}
              />
            );
          })}
        </div>
      </div>
      <p className="text-xs2 text-foreground/50 mt-2">
        {placed.length} prides in {year} · click a dot to view details · solid dots are featured
      </p>
    </div>
  );
}
