import { useMemo, useRef, useEffect } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Calendar, MapPin, Star } from 'lucide-react';
import type { PrideCalendarEvent } from '@/hooks/usePrideCalendar';
import { cn } from '@/lib/utils';
import { codeToFlagEmoji } from '@/lib/countryFlag';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { placeOnRows } from '@/utils/timelineLayout';

interface PrideTimelineProps {
  events: PrideCalendarEvent[];
  year: number;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const TRACK_WIDTH = 1800;
const LABEL_PX = 96;
const ROW_HEIGHT = 28;

interface PlacedEvent {
  event: PrideCalendarEvent;
  monthIndex: number;
  dayInMonth: number;
  row: number;
}

function formatDateRange(start: string, end: string | null): string {
  const s = new Date(start);
  const e = end ? new Date(end) : null;
  const opts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
  if (!e || s.toDateString() === e.toDateString()) return s.toLocaleDateString(undefined, opts);
  const sameYear = s.getUTCFullYear() === e.getUTCFullYear();
  const startShort: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return sameYear
    ? `${s.toLocaleDateString(undefined, startShort)} – ${e.toLocaleDateString(undefined, opts)}`
    : `${s.toLocaleDateString(undefined, opts)} – ${e.toLocaleDateString(undefined, opts)}`;
}

function placeEvents(events: PrideCalendarEvent[], year: number): PlacedEvent[] {
  const yearStartMs = Date.UTC(year, 0, 1);
  const yearEndMs = Date.UTC(year + 1, 0, 1);
  const pxForMs = (ms: number) =>
    ((ms - yearStartMs) / (yearEndMs - yearStartMs)) * TRACK_WIDTH;
  const placeables = events.map((e) => {
    const startMs = new Date(e.start_date).getTime();
    const endMs = e.end_date ? new Date(e.end_date).getTime() : startMs;
    return { id: e.id, startMs, endMs, _event: e };
  });
  const placed = placeOnRows(placeables, pxForMs, LABEL_PX);
  return placed.map((p) => {
    const d = new Date(p.item.startMs);
    return {
      event: p.item._event,
      monthIndex: d.getUTCMonth(),
      dayInMonth: d.getUTCDate(),
      row: p.row,
    };
  });
}

export function PrideTimeline({ events, year, selectedId, onSelect: _onSelect }: PrideTimelineProps) {
  const { t } = useTranslation();
  const placed = useMemo(() => placeEvents(events, year), [events, year]);
  const maxRow = useMemo(() => placed.reduce((m, p) => (p.row > m ? p.row : m), 0), [placed]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const today = new Date();
  const showToday = today.getUTCFullYear() === year;
  const todayMonthIndex = today.getUTCMonth();
  const todayDay = today.getUTCDate();

  useEffect(() => {
    if (!selectedId || !scrollRef.current) return;
    const el = scrollRef.current.querySelector<HTMLElement>(`[data-event-id="${selectedId}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [selectedId]);

  const trackHeight = (maxRow + 1) * ROW_HEIGHT + 48;

  return (
    <div className="w-full">
      {/* Month chips — quick scroll */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-2 scrollbar-thin">
        {MONTHS.map((m, i) => {
          const count = placed.filter((p) => p.monthIndex === i).length;
          if (count === 0) {
            return (
              <span key={m} className="px-2 py-1 text-xs2 text-foreground/40 rounded-badge border border-foreground/10">
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
              className="px-2 py-1 text-xs2 rounded-badge border border-foreground/20 hover:bg-muted transition-colors min-h-0"
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
        aria-label={t('pride.timeline.aria')}
      >
        <div className="relative" style={{ width: `${TRACK_WIDTH}px`, height: trackHeight, minWidth: '100%' }}>
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
              style={{ left: `${((todayMonthIndex + (todayDay - 1) / 31) / 12) * 100}%` }}
              aria-hidden="true"
            >
              <div className="absolute -top-1 -translate-x-1/2 text-[9px] uppercase tracking-wider bg-foreground text-background px-1 rounded-badge">
                {t('pride.timeline.today')}
              </div>
            </div>
          )}

          {/* Events: dot + label, each with a hover/focus preview card */}
          <TooltipProvider delayDuration={200} skipDelayDuration={300}>
            {placed.map((p) => {
              const xPct = ((p.monthIndex + (p.dayInMonth - 1) / 31) / 12) * 100;
              const isSelected = selectedId === p.event.id;
              const y = 36 + p.row * ROW_HEIGHT;
              const dateLabel = new Date(p.event.start_date).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
              });
              const flag = codeToFlagEmoji(p.event.country);
              const dateRange = formatDateRange(p.event.start_date, p.event.end_date);
              const location = [p.event.city, p.event.country].filter(Boolean).join(', ');
              return (
                <Tooltip key={p.event.id}>
                  <TooltipTrigger asChild>
                    <Link
                      to={`/events/${p.event.slug}`}
                      data-event-id={p.event.id}
                      aria-label={`${p.event.title} on ${dateLabel}`}
                      aria-current={isSelected ? 'true' : undefined}
                      className={cn(
                        'absolute flex items-center gap-1.5 min-h-0 min-w-0 p-0 bg-transparent group no-underline',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-1 rounded-badge',
                      )}
                      style={{ left: `${xPct}%`, top: `${y}px`, height: '20px', maxWidth: `${LABEL_PX + 16}px` }}
                    >
                      <span
                        className={cn(
                          'shrink-0 rounded-full border border-foreground transition-all',
                          isSelected
                            ? 'bg-foreground w-3 h-3'
                            : p.event.is_featured
                              ? 'bg-foreground w-2.5 h-2.5 group-hover:scale-125'
                              : 'bg-background w-2 h-2 group-hover:scale-125 group-hover:bg-foreground',
                        )}
                      />
                      <span
                        className={cn(
                          'flex items-center gap-1 text-[10px] leading-none whitespace-nowrap overflow-hidden min-w-0',
                          isSelected || p.event.is_featured ? 'text-foreground font-medium' : 'text-foreground/70',
                          'group-hover:text-foreground group-hover:font-medium',
                        )}
                      >
                        {flag && (
                          <span aria-hidden="true" className="shrink-0 leading-none">
                            {flag}
                          </span>
                        )}
                        <span className="truncate">{p.event.city ?? p.event.title}</span>
                      </span>
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent
                    side="top"
                    sideOffset={8}
                    collisionPadding={12}
                    className="z-50 w-64 max-w-[calc(100vw-24px)] px-3 py-2.5 rounded-element border border-foreground/15 bg-background text-foreground font-normal text-left shadow-none"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium leading-tight">
                        {flag && <span aria-hidden="true" className="mr-1">{flag}</span>}
                        {p.event.title}
                      </p>
                      {p.event.is_featured && (
                        <Star className="size-3 shrink-0 fill-foreground text-foreground mt-0.5" aria-label="Featured" />
                      )}
                    </div>
                    <p className="mt-1.5 flex items-center gap-1 text-xs2 text-foreground/70">
                      <Calendar className="size-3 shrink-0" aria-hidden="true" />
                      <span className="truncate">{dateRange}</span>
                    </p>
                    {location && (
                      <p className="mt-1 flex items-center gap-1 text-xs2 text-foreground/70">
                        <MapPin className="size-3 shrink-0" aria-hidden="true" />
                        <span className="truncate">{location}</span>
                      </p>
                    )}
                    {p.event.description && (
                      <p className="mt-2 text-xs2 text-foreground/80 line-clamp-3">{p.event.description}</p>
                    )}
                    {p.event.verification_status !== 'verified' && (
                      <p className="mt-2 text-2xs text-foreground/50">Date estimated</p>
                    )}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </TooltipProvider>
        </div>
      </div>
      <p className="text-xs2 text-foreground/50 mt-2">
        {t('pride.timeline.helper', { count: placed.length, year })}
      </p>
    </div>
  );
}
