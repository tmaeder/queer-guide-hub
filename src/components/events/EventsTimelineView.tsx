import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Calendar as CalendarIcon, MapPin, Star, Ticket } from 'lucide-react';
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth, startOfWeek, startOfQuarter, addDays, addWeeks, addMonths, addQuarters, differenceInMilliseconds } from 'date-fns';
import type { Database } from '@/integrations/supabase/types';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { placeOnRows, pickColumnUnit, type ColumnUnit } from '@/utils/timelineLayout';
import { formatEventTime } from '@/lib/event-time';

type Event = Database['public']['Tables']['events']['Row'];

interface EventsTimelineViewProps {
  events: Event[];
  onEventSelect?: (event: Event) => void;
}

const TRACK_TARGET_WIDTH = 1800;
const LABEL_PX = 110;
const ROW_HEIGHT = 30;
const BAR_HEIGHT = 18;
const CLUSTER_PX = 24;
const CLUSTER_MIN = 3;

interface Bucket {
  startMs: number;
  endMs: number;
  label: string;
}

function buildBuckets(rangeStart: Date, rangeEnd: Date, unit: ColumnUnit): Bucket[] {
  const buckets: Bucket[] = [];
  let cursor: Date;
  switch (unit) {
    case 'day':
      cursor = startOfDay(rangeStart);
      while (cursor < rangeEnd) {
        const next = addDays(cursor, 1);
        buckets.push({ startMs: cursor.getTime(), endMs: next.getTime(), label: format(cursor, 'MMM d') });
        cursor = next;
      }
      break;
    case 'week':
      cursor = startOfWeek(rangeStart, { weekStartsOn: 1 });
      while (cursor < rangeEnd) {
        const next = addWeeks(cursor, 1);
        buckets.push({ startMs: cursor.getTime(), endMs: next.getTime(), label: format(cursor, 'MMM d') });
        cursor = next;
      }
      break;
    case 'month':
      cursor = startOfMonth(rangeStart);
      while (cursor < rangeEnd) {
        const next = addMonths(cursor, 1);
        const sameYear = cursor.getFullYear() === new Date().getFullYear();
        buckets.push({
          startMs: cursor.getTime(),
          endMs: next.getTime(),
          label: sameYear ? format(cursor, 'MMM') : format(cursor, 'MMM yy'),
        });
        cursor = next;
      }
      break;
    case 'quarter':
      cursor = startOfQuarter(rangeStart);
      while (cursor < rangeEnd) {
        const next = addQuarters(cursor, 1);
        buckets.push({
          startMs: cursor.getTime(),
          endMs: next.getTime(),
          label: `Q${Math.floor(cursor.getMonth() / 3) + 1} ${format(cursor, 'yy')}`,
        });
        cursor = next;
      }
      break;
  }
  return buckets;
}

interface PlaceableEvent {
  id: string;
  startMs: number;
  endMs: number;
  _event: Event;
}

interface ClusterItem {
  kind: 'cluster';
  id: string;
  startMs: number;
  endMs: number;
  events: Event[];
}
interface SingleItem {
  kind: 'event';
  id: string;
  startMs: number;
  endMs: number;
  event: Event;
}
type TrackItem = ClusterItem | SingleItem;

function buildItems(events: Event[], pxForMs: (ms: number) => number): TrackItem[] {
  const placeables: PlaceableEvent[] = events
    .filter((e) => !!e.start_date)
    .map((e) => {
      const startMs = new Date(e.start_date).getTime();
      const rawEnd = e.end_date ? new Date(e.end_date).getTime() : startMs;
      return { id: e.id, startMs, endMs: Math.max(startMs, rawEnd), _event: e };
    })
    .sort((a, b) => a.startMs - b.startMs);

  // Cluster single-day-ish events that bunch within CLUSTER_PX
  const items: TrackItem[] = [];
  let i = 0;
  while (i < placeables.length) {
    const p = placeables[i];
    const isShort = pxForMs(p.endMs) - pxForMs(p.startMs) < CLUSTER_PX;
    if (!isShort) {
      items.push({ kind: 'event', id: p.id, startMs: p.startMs, endMs: p.endMs, event: p._event });
      i++;
      continue;
    }
    // collect short events within CLUSTER_PX of p
    const groupStartPx = pxForMs(p.startMs);
    const group: PlaceableEvent[] = [p];
    let j = i + 1;
    while (j < placeables.length) {
      const q = placeables[j];
      const qStartPx = pxForMs(q.startMs);
      const qShort = pxForMs(q.endMs) - qStartPx < CLUSTER_PX;
      if (!qShort) break;
      if (qStartPx - groupStartPx > CLUSTER_PX) break;
      group.push(q);
      j++;
    }
    if (group.length >= CLUSTER_MIN) {
      const minStart = group[0].startMs;
      const maxEnd = Math.max(...group.map((g) => g.endMs));
      items.push({
        kind: 'cluster',
        id: `cluster-${minStart}-${group.length}`,
        startMs: minStart,
        endMs: maxEnd,
        events: group.map((g) => g._event),
      });
      i = j;
    } else {
      items.push({ kind: 'event', id: p.id, startMs: p.startMs, endMs: p.endMs, event: p._event });
      i++;
    }
  }
  return items;
}

export function EventsTimelineView({ events, onEventSelect }: EventsTimelineViewProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [openCluster, setOpenCluster] = useState<string | null>(null);

  const { rangeStart, rangeEnd, unit, buckets, trackWidth, pxForMs } = useMemo(() => {
    if (events.length === 0) {
      const now = new Date();
      const start = startOfMonth(now);
      const end = endOfMonth(now);
      return {
        rangeStart: start,
        rangeEnd: end,
        unit: 'day' as ColumnUnit,
        buckets: [],
        trackWidth: TRACK_TARGET_WIDTH,
        pxForMs: () => 0,
      };
    }
    const starts = events.map((e) => new Date(e.start_date).getTime());
    const ends = events.map((e) => new Date(e.end_date ?? e.start_date).getTime());
    const minMs = Math.min(...starts);
    const maxMs = Math.max(...ends);
    const rangeMs = maxMs - minMs;
    const unit = pickColumnUnit(rangeMs);
    let start: Date;
    let end: Date;
    switch (unit) {
      case 'day':
        start = startOfDay(new Date(minMs));
        end = endOfDay(new Date(maxMs));
        break;
      case 'week':
        start = startOfWeek(new Date(minMs), { weekStartsOn: 1 });
        end = addWeeks(startOfWeek(new Date(maxMs), { weekStartsOn: 1 }), 1);
        break;
      case 'month':
        start = startOfMonth(new Date(minMs));
        end = addMonths(startOfMonth(new Date(maxMs)), 1);
        break;
      case 'quarter':
        start = startOfQuarter(new Date(minMs));
        end = addQuarters(startOfQuarter(new Date(maxMs)), 1);
        break;
    }
    const buckets = buildBuckets(start, end, unit);
    const totalMs = differenceInMilliseconds(end, start);
    const trackWidth = Math.max(TRACK_TARGET_WIDTH, buckets.length * 80);
    const pxForMs = (ms: number) => ((ms - start.getTime()) / totalMs) * trackWidth;
    return { rangeStart: start, rangeEnd: end, unit, buckets, trackWidth, pxForMs };
  }, [events]);

  const items = useMemo(() => buildItems(events, pxForMs), [events, pxForMs]);
  const placed = useMemo(
    () => placeOnRows(items.map((it) => ({ id: it.id, startMs: it.startMs, endMs: it.endMs, _item: it })), pxForMs, LABEL_PX),
    [items, pxForMs],
  );
  const maxRow = placed.reduce((m, p) => (p.row > m ? p.row : m), 0);
  const trackHeight = (maxRow + 1) * ROW_HEIGHT + 48;

  const today = new Date();
  const showToday = today >= rangeStart && today < rangeEnd;

  const bucketCounts = useMemo(() => {
    return buckets.map((b) => events.filter((e) => {
      const s = new Date(e.start_date).getTime();
      return s >= b.startMs && s < b.endMs;
    }).length);
  }, [buckets, events]);

  if (events.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">No events to display.</div>
    );
  }

  return (
    <div className="w-full">
      {/* Period chips */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-2 scrollbar-thin">
        {buckets.map((b, i) => {
          const count = bucketCounts[i];
          if (count === 0) {
            return (
              <span
                key={b.startMs}
                className="px-2 py-1 text-xs2 text-foreground/40 rounded-badge border border-foreground/10 whitespace-nowrap"
              >
                {b.label}
              </span>
            );
          }
          return (
            <button
              key={b.startMs}
              type="button"
              onClick={() => {
                const el = scrollRef.current?.querySelector<HTMLDivElement>(`[data-bucket="${b.startMs}"]`);
                el?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
              }}
              className="px-2 py-1 text-xs2 rounded-badge border border-foreground/20 hover:bg-muted transition-colors min-h-0 whitespace-nowrap"
            >
              {b.label} <span className="text-foreground/50">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Timeline track */}
      <div
        ref={scrollRef}
        className="relative overflow-x-auto border border-foreground/10 rounded-container bg-background"
        role="region"
        aria-label="Events timeline"
      >
        <div
          className="relative"
          style={{ width: `${trackWidth}px`, height: trackHeight, minWidth: '100%' }}
        >
          {/* Bucket columns */}
          <div
            className="absolute inset-0 grid"
            style={{ gridTemplateColumns: `repeat(${buckets.length}, 1fr)` }}
          >
            {buckets.map((b, i) => (
              <div
                key={b.startMs}
                data-bucket={b.startMs}
                className={cn(
                  'relative border-r border-foreground/10 last:border-r-0',
                  i % 2 === 1 && 'bg-muted/30',
                )}
              >
                <div className="sticky top-0 z-10 px-2 py-1 text-xs2 font-medium tracking-wide text-foreground/70 bg-background/95 border-b border-foreground/10 truncate">
                  {b.label}
                </div>
              </div>
            ))}
          </div>

          {/* Today marker */}
          {showToday && (
            <div
              className="absolute top-7 bottom-2 w-px bg-foreground/80 z-20"
              style={{ left: `${pxForMs(today.getTime())}px` }}
              aria-hidden="true"
            >
              <div className="absolute -top-1 -translate-x-1/2 text-[9px] uppercase tracking-wider bg-foreground text-background px-1 rounded-badge">
                Today
              </div>
            </div>
          )}

          {/* Items: bars, dots, clusters */}
          <TooltipProvider delayDuration={200} skipDelayDuration={300}>
            {placed.map((p) => {
              const item = (p.item as unknown as { _item: TrackItem })._item;
              const xStart = pxForMs(p.startMs);
              const xEnd = pxForMs(p.endMs);
              const y = 36 + p.row * ROW_HEIGHT;
              const isPast = p.endMs < today.getTime();

              if (item.kind === 'cluster') {
                const count = item.events.length;
                return (
                  <Popover
                    key={item.id}
                    open={openCluster === item.id}
                    onOpenChange={(o) => setOpenCluster(o ? item.id : null)}
                  >
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        aria-label={`${count} events around ${format(new Date(p.startMs), 'PP')}`}
                        className={cn(
                          'absolute flex items-center justify-center text-[10px] font-medium leading-none',
                          'bg-foreground text-background rounded-full border border-foreground hover:scale-110 transition-transform',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-1',
                          isPast && 'opacity-50',
                        )}
                        style={{
                          left: `${xStart}px`,
                          top: `${y}px`,
                          width: `${Math.max(BAR_HEIGHT, BAR_HEIGHT + (count.toString().length - 1) * 4)}px`,
                          height: `${BAR_HEIGHT}px`,
                        }}
                      >
                        {count}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      side="top"
                      sideOffset={8}
                      collisionPadding={12}
                      className="z-50 w-72 max-w-[calc(100vw-24px)] p-0 rounded-element border border-foreground/15 bg-background"
                    >
                      <div className="px-3 py-2 border-b border-foreground/10 text-xs2 text-foreground/70">
                        {count} events · {format(new Date(item.startMs), 'PP')}
                      </div>
                      <ul className="max-h-64 overflow-y-auto">
                        {item.events.map((e) => (
                          <li key={e.id}>
                            <Link
                              to={`/events/${e.slug}`}
                              onClick={() => {
                                setOpenCluster(null);
                                onEventSelect?.(e);
                              }}
                              className="block px-3 py-2 hover:bg-muted text-sm no-underline border-b border-foreground/5 last:border-b-0"
                            >
                              <p className="font-medium leading-tight truncate">
                                {e.is_featured && (
                                  <Star className="inline size-3 mr-1 fill-foreground" aria-label="Featured" />
                                )}
                                {e.title}
                              </p>
                              <p className="mt-0.5 text-xs2 text-foreground/60 truncate">
                                {format(new Date(e.start_date), 'MMM d')}
                                {e.city && ` · ${e.city}`}
                                {e.event_type && ` · ${e.event_type}`}
                              </p>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </PopoverContent>
                  </Popover>
                );
              }

              const event = item.event;
              const widthPx = xEnd - xStart;
              const isBar = widthPx >= CLUSTER_PX;
              const dateLabel = format(new Date(event.start_date), 'MMM d');
              const dateRange = formatEventTime(
                event.start_date,
                event.end_date,
                (event as { timezone?: string | null }).timezone,
              );
              const location = [event.venue_name, event.city].filter(Boolean).join(', ');

              return (
                <Tooltip key={event.id}>
                  <TooltipTrigger asChild>
                    <Link
                      to={`/events/${event.slug}`}
                      data-event-id={event.id}
                      aria-label={`${event.title} on ${dateLabel}`}
                      onClick={() => onEventSelect?.(event)}
                      className={cn(
                        'absolute flex items-center gap-1.5 min-h-0 min-w-0 p-0 bg-transparent group no-underline',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-1 rounded-badge',
                        isPast && 'opacity-50',
                      )}
                      style={{
                        left: `${xStart}px`,
                        top: `${y}px`,
                        height: `${BAR_HEIGHT}px`,
                        maxWidth: isBar ? undefined : `${LABEL_PX + 16}px`,
                      }}
                    >
                      {isBar ? (
                        <span
                          className={cn(
                            'flex items-center px-2 rounded-element border border-foreground transition-colors',
                            event.is_featured
                              ? 'bg-foreground text-background'
                              : 'bg-background text-foreground group-hover:bg-muted',
                          )}
                          style={{ width: `${widthPx}px`, height: `${BAR_HEIGHT}px` }}
                        >
                          <span className="truncate text-[10px] leading-none font-medium">
                            {event.title}
                          </span>
                        </span>
                      ) : (
                        <>
                          <span
                            className={cn(
                              'shrink-0 rounded-full border border-foreground transition-all',
                              event.is_featured
                                ? 'bg-foreground w-2.5 h-2.5 group-hover:scale-125'
                                : 'bg-background w-2 h-2 group-hover:scale-125 group-hover:bg-foreground',
                            )}
                          />
                          <span
                            className={cn(
                              'flex items-center gap-1 text-[10px] leading-none whitespace-nowrap overflow-hidden min-w-0',
                              event.is_featured
                                ? 'text-foreground font-medium'
                                : 'text-foreground/70',
                              'group-hover:text-foreground group-hover:font-medium',
                            )}
                          >
                            <span className="truncate">{event.title}</span>
                          </span>
                        </>
                      )}
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent
                    side="top"
                    sideOffset={8}
                    collisionPadding={12}
                    className="z-50 w-64 max-w-[calc(100vw-24px)] px-3 py-2.5 rounded-element border border-foreground/15 bg-background text-foreground font-normal text-left shadow-none"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium leading-tight">{event.title}</p>
                      {event.is_featured && (
                        <Star
                          className="size-3 shrink-0 fill-foreground text-foreground mt-0.5"
                          aria-label="Featured"
                        />
                      )}
                    </div>
                    <p className="mt-1.5 flex items-center gap-1 text-xs2 text-foreground/70">
                      <CalendarIcon className="size-3 shrink-0" aria-hidden="true" />
                      <span className="truncate">{dateRange}</span>
                    </p>
                    {location && (
                      <p className="mt-1 flex items-center gap-1 text-xs2 text-foreground/70">
                        <MapPin className="size-3 shrink-0" aria-hidden="true" />
                        <span className="truncate">{location}</span>
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {event.event_type && (
                        <Badge variant="outline" className="text-xs2 px-1.5 py-0">
                          {event.event_type}
                        </Badge>
                      )}
                      {event.is_free && (
                        <Badge variant="secondary" className="text-xs2 px-1.5 py-0">
                          <Ticket className="size-2.5 mr-1" aria-hidden="true" />
                          Free
                        </Badge>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </TooltipProvider>
        </div>
      </div>
      <p className="text-xs2 text-foreground/50 mt-2">
        {events.length} {events.length === 1 ? 'event' : 'events'} · grouped by {unit} · solid markers are featured
      </p>
    </div>
  );
}
