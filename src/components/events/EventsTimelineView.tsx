import { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router';
import { Star } from 'lucide-react';
import {
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfQuarter,
  addDays,
  addWeeks,
  addMonths,
  addQuarters,
} from 'date-fns';
import type { Database } from '@/integrations/supabase/types';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { placeOnRows } from '@/utils/timelineLayout';
import { EventHoverCard } from './EventHoverCard';
import {
  type Viewport,
  panBy,
  zoomBy,
  centerOn,
  fitToData,
  defaultViewport,
  pxForMs as pxForMsFn,
  msForPx,
  stepFor,
} from '@/utils/timelineViewport';
import { TimelineToolbar } from './TimelineToolbar';
import { TimelineMinimap } from './TimelineMinimap';

type Event = Database['public']['Tables']['events']['Row'];

interface EventsTimelineViewProps {
  events: Event[];
  onEventSelect?: (event: Event) => void;
  viewport?: Viewport;
  onViewportChange?: (v: Viewport) => void;
  loading?: boolean;
  onRsvp?: (eventId: string, status: 'going' | 'interested' | 'not_going') => void | Promise<void>;
  onSaveToTrip?: (event: Event) => void | Promise<void>;
  /** Render a built-in Save-to-trip button (opens AddToTripDialog inside the hover card). */
  enableSaveToTrip?: boolean;
  attendStatus?: (eventId: string) => 'going' | 'interested' | 'not_going' | null;
  isInTrip?: (eventId: string) => boolean;
}

const TRACK_TARGET_WIDTH = 1800;
const LABEL_PX = 110;
const ROW_HEIGHT = 30;
const BAR_HEIGHT = 18;
const CLUSTER_PX = 24;
const CLUSTER_MIN = 3;
const DRAG_THRESHOLD_PX = 5;

interface Bucket {
  startMs: number;
  endMs: number;
  label: string;
}

function buildBuckets(viewport: Viewport): Bucket[] {
  const step = stepFor(viewport);
  const buckets: Bucket[] = [];
  let cursor: Date;
  const rangeEnd = new Date(viewport.endMs);
  switch (step.unit) {
    case 'day':
      cursor = startOfDay(new Date(viewport.startMs));
      while (cursor < rangeEnd) {
        const next = addDays(cursor, 1);
        buckets.push({ startMs: cursor.getTime(), endMs: next.getTime(), label: format(cursor, 'MMM d') });
        cursor = next;
      }
      break;
    case 'week':
      cursor = startOfWeek(new Date(viewport.startMs), { weekStartsOn: 1 });
      while (cursor < rangeEnd) {
        const next = addWeeks(cursor, 1);
        buckets.push({ startMs: cursor.getTime(), endMs: next.getTime(), label: format(cursor, 'MMM d') });
        cursor = next;
      }
      break;
    case 'month':
      cursor = startOfMonth(new Date(viewport.startMs));
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
      cursor = startOfQuarter(new Date(viewport.startMs));
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

export function EventsTimelineView({
  events,
  onEventSelect,
  viewport: controlledViewport,
  onViewportChange,
  loading,
  onRsvp,
  onSaveToTrip,
  enableSaveToTrip,
  attendStatus,
  isInTrip,
}: EventsTimelineViewProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [openCluster, setOpenCluster] = useState<string | null>(null);

  const [internalViewport, setInternalViewport] = useState<Viewport>(() => {
    if (controlledViewport) return controlledViewport;
    const starts = events.map((e) => new Date(e.start_date).getTime()).filter((n) => !isNaN(n));
    const ends = events.map((e) => new Date(e.end_date ?? e.start_date).getTime()).filter((n) => !isNaN(n));
    return fitToData(starts, ends) ?? defaultViewport();
  });
  const viewport = controlledViewport ?? internalViewport;

  const setViewport = useCallback(
    (next: Viewport) => {
      if (!controlledViewport) setInternalViewport(next);
      onViewportChange?.(next);
    },
    [controlledViewport, onViewportChange],
  );

  const userInteractedRef = useRef(false);
  useEffect(() => {
    if (controlledViewport || userInteractedRef.current) return;
    const starts = events.map((e) => new Date(e.start_date).getTime()).filter((n) => !isNaN(n));
    const ends = events.map((e) => new Date(e.end_date ?? e.start_date).getTime()).filter((n) => !isNaN(n));
    const fit = fitToData(starts, ends);
    if (fit) setInternalViewport(fit);
  }, [events, controlledViewport]);

  const buckets = useMemo(() => buildBuckets(viewport), [viewport]);
  const trackWidth = Math.max(TRACK_TARGET_WIDTH, buckets.length * 80);
  const pxForMs = useCallback(
    (ms: number) => pxForMsFn(viewport, ms, trackWidth),
    [viewport, trackWidth],
  );

  const visibleEvents = useMemo(
    () =>
      events.filter((e) => {
        const s = new Date(e.start_date).getTime();
        const eEnd = new Date(e.end_date ?? e.start_date).getTime();
        return eEnd >= viewport.startMs && s <= viewport.endMs;
      }),
    [events, viewport.startMs, viewport.endMs],
  );

  const items = useMemo(() => buildItems(visibleEvents, pxForMs), [visibleEvents, pxForMs]);
  const placed = useMemo(
    () =>
      placeOnRows(
        items.map((it) => ({ id: it.id, startMs: it.startMs, endMs: it.endMs, _item: it })),
        pxForMs,
        LABEL_PX,
      ),
    [items, pxForMs],
  );
  const maxRow = placed.reduce((m, p) => (p.row > m ? p.row : m), 0);
  const trackHeight = (maxRow + 1) * ROW_HEIGHT + 48;

  const today = new Date();
  const showToday = today.getTime() >= viewport.startMs && today.getTime() < viewport.endMs;

  const bucketCounts = useMemo(
    () =>
      buckets.map(
        (b) =>
          visibleEvents.filter((e) => {
            const s = new Date(e.start_date).getTime();
            return s >= b.startMs && s < b.endMs;
          }).length,
      ),
    [buckets, visibleEvents],
  );

  const panState = useRef<{
    pointerId: number;
    startX: number;
    origStart: number;
    origEnd: number;
    moved: boolean;
  } | null>(null);

  const onPointerDownTrack = (e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('a, button')) return;
    panState.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      origStart: viewport.startMs,
      origEnd: viewport.endMs,
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMoveTrack = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!panState.current) return;
    const dx = e.clientX - panState.current.startX;
    if (!panState.current.moved && Math.abs(dx) < DRAG_THRESHOLD_PX) return;
    panState.current.moved = true;
    userInteractedRef.current = true;
    const w = trackWidth;
    const span = panState.current.origEnd - panState.current.origStart;
    const deltaMs = -(dx / w) * span;
    setViewport({
      startMs: panState.current.origStart + deltaMs,
      endMs: panState.current.origEnd + deltaMs,
    });
  };

  const onPointerUpTrack = (e: React.PointerEvent<HTMLDivElement>) => {
    if (panState.current?.pointerId === e.pointerId) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      panState.current = null;
    }
  };

  const onWheelTrack = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!(e.metaKey || e.ctrlKey) || !scrollRef.current || !trackRef.current) return;
    e.preventDefault();
    userInteractedRef.current = true;
    const rect = trackRef.current.getBoundingClientRect();
    const scrollLeft = scrollRef.current.scrollLeft;
    const px = e.clientX - rect.left + scrollLeft;
    const anchorMs = msForPx(viewport, px, trackWidth);
    const factor = e.deltaY > 0 ? 1.2 : 1 / 1.2;
    setViewport(zoomBy(viewport, factor, anchorMs));
  };

  return (
    <div className="w-full">
      <TimelineToolbar
        viewport={viewport}
        onPan={(d) => {
          userInteractedRef.current = true;
          setViewport(panBy(viewport, d));
        }}
        onCenter={(ms) => {
          userInteractedRef.current = true;
          setViewport(centerOn(viewport, ms));
        }}
        onZoom={(f) => {
          userInteractedRef.current = true;
          const center = (viewport.startMs + viewport.endMs) / 2;
          setViewport(zoomBy(viewport, f, center));
        }}
        onFit={() => {
          const starts = events.map((e) => new Date(e.start_date).getTime()).filter((n) => !isNaN(n));
          const ends = events.map((e) => new Date(e.end_date ?? e.start_date).getTime()).filter((n) => !isNaN(n));
          const fit = fitToData(starts, ends);
          if (fit) {
            userInteractedRef.current = false;
            setViewport(fit);
          }
        }}
        canFit={events.length > 0}
      />

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

      {loading && (
        <div className="h-0.5 bg-foreground/10 overflow-hidden mb-1" aria-label="Loading events">
          <div className="h-full w-1/3 bg-foreground/60 animate-pulse" />
        </div>
      )}

      <div
        ref={scrollRef}
        className="relative overflow-x-auto border border-foreground/10 rounded-container bg-background"
        role="region"
        aria-label="Events timeline"
      >
        <div
          ref={trackRef}
          className="relative cursor-grab active:cursor-grabbing select-none touch-pan-y"
          style={{ width: `${trackWidth}px`, height: trackHeight, minWidth: '100%' }}
          onPointerDown={onPointerDownTrack}
          onPointerMove={onPointerMoveTrack}
          onPointerUp={onPointerUpTrack}
          onPointerCancel={onPointerUpTrack}
          onWheel={onWheelTrack}
        >
          <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${buckets.length}, 1fr)` }}>
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

              return (
                <EventHoverCard
                  key={event.id}
                  event={event}
                  onRsvp={onRsvp}
                  onSaveToTrip={onSaveToTrip}
                  enableSaveToTrip={enableSaveToTrip}
                  isInTrip={isInTrip?.(event.id)}
                  attendStatus={attendStatus?.(event.id) ?? null}
                >
                  <Link
                    to={`/events/${event.slug}`}
                    data-event-id={event.id}
                    aria-label={`${event.title} on ${dateLabel}`}
                    onClick={(e) => {
                      if (panState.current?.moved) {
                        e.preventDefault();
                        return;
                      }
                      onEventSelect?.(event);
                    }}
                    draggable={false}
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
                        <span className="truncate text-[10px] leading-none font-medium">{event.title}</span>
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
                            event.is_featured ? 'text-foreground font-medium' : 'text-foreground/70',
                            'group-hover:text-foreground group-hover:font-medium',
                          )}
                        >
                          <span className="truncate">{event.title}</span>
                        </span>
                      </>
                    )}
                  </Link>
                </EventHoverCard>
              );
            })}
        </div>
      </div>

      <TimelineMinimap
        viewport={viewport}
        eventStarts={events.map((e) => new Date(e.start_date).getTime()).filter((n) => !isNaN(n))}
        onViewportChange={(v) => {
          userInteractedRef.current = true;
          setViewport(v);
        }}
      />

      <p className="text-xs2 text-foreground/50 mt-2">
        {visibleEvents.length} of {events.length} {events.length === 1 ? 'event' : 'events'} visible · drag to
        pan, cmd+scroll to zoom · solid markers are featured
      </p>
    </div>
  );
}
