import { useMemo, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { type Viewport } from '@/utils/timelineViewport';

interface TimelineMinimapProps {
  viewport: Viewport;
  eventStarts: number[];
  /** Total span of the minimap. Default = today ± 2.5y. */
  rangeMs?: { startMs: number; endMs: number };
  onViewportChange: (next: Viewport) => void;
}

const HEIGHT = 56;
const MINIMAP_DEFAULT_SPAN_MS = 5 * 365 * 86_400_000;

export function TimelineMinimap({ viewport, eventStarts, rangeMs, onViewportChange }: TimelineMinimapProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const dragState = useRef<{ startX: number; origStartMs: number } | null>(null);

  const range = rangeMs ?? (() => {
    const now = Date.now();
    return { startMs: now - MINIMAP_DEFAULT_SPAN_MS / 2, endMs: now + MINIMAP_DEFAULT_SPAN_MS / 2 };
  })();
  const span = range.endMs - range.startMs;

  // Bucket events into 60 columns (~ months over 5 years)
  const BUCKETS = 60;
  const buckets = useMemo(() => {
    const counts = new Array<number>(BUCKETS).fill(0);
    for (const s of eventStarts) {
      const idx = Math.floor(((s - range.startMs) / span) * BUCKETS);
      if (idx >= 0 && idx < BUCKETS) counts[idx]++;
    }
    const max = Math.max(1, ...counts);
    return counts.map((c) => c / max);
  }, [eventStarts, range.startMs, span]);

  const vpLeftPct = ((viewport.startMs - range.startMs) / span) * 100;
  const vpWidthPct = ((viewport.endMs - viewport.startMs) / span) * 100;

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!ref.current) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragState.current = { startX: e.clientX, origStartMs: viewport.startMs };
  }, [viewport.startMs]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current || !ref.current) return;
    const dx = e.clientX - dragState.current.startX;
    const w = ref.current.offsetWidth;
    const deltaMs = (dx / w) * span;
    const target = viewport.startMs - viewport.startMs + dragState.current.origStartMs + deltaMs;
    const proposed: Viewport = {
      startMs: dragState.current.origStartMs + deltaMs,
      endMs: dragState.current.origStartMs + deltaMs + (viewport.endMs - viewport.startMs),
    };
    onViewportChange(proposed);
    void target;
  }, [span, viewport.startMs, viewport.endMs, onViewportChange]);

  const onPointerUp = useCallback(() => {
    dragState.current = null;
  }, []);

  const onClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // Ignore if drag just finished (within 3px)
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const ms = range.startMs + (px / rect.width) * span;
    const half = (viewport.endMs - viewport.startMs) / 2;
    onViewportChange({ startMs: ms - half, endMs: ms + half });
  }, [range.startMs, span, viewport.startMs, viewport.endMs, onViewportChange]);

  // Year ticks
  const yearTicks = useMemo(() => {
    const startYear = new Date(range.startMs).getFullYear();
    const endYear = new Date(range.endMs).getFullYear();
    const ticks: { year: number; leftPct: number }[] = [];
    for (let y = startYear; y <= endYear; y++) {
      const ms = new Date(y, 0, 1).getTime();
      const leftPct = ((ms - range.startMs) / span) * 100;
      if (leftPct >= 0 && leftPct <= 100) ticks.push({ year: y, leftPct });
    }
    return ticks;
  }, [range.startMs, range.endMs, span]);

  // Today
  const todayPct = ((Date.now() - range.startMs) / span) * 100;
  const showToday = todayPct >= 0 && todayPct <= 100;

  return (
    <div className="mt-2">
      <div
        ref={ref}
        className="relative bg-muted/30 border border-foreground/10 rounded-element cursor-crosshair select-none"
        style={{ height: `${HEIGHT}px` }}
        onClick={onClick}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && ref.current) {
            const ms = range.startMs + (0.5 * span);
            const half = (viewport.endMs - viewport.startMs) / 2;
            onViewportChange({ startMs: ms - half, endMs: ms + half });
          } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
            const step = (viewport.endMs - viewport.startMs) * 0.25;
            const delta = e.key === 'ArrowLeft' ? -step : step;
            onViewportChange({ startMs: viewport.startMs + delta, endMs: viewport.endMs + delta });
          }
        }}
        tabIndex={0}
        role="region"
        aria-label="Timeline minimap"
      >
        {/* Density bars */}
        <div className="absolute inset-x-0 bottom-0 top-3 flex items-end">
          {buckets.map((h, i) => (
            <div
              key={i}
              className="flex-1 mx-px bg-foreground/40"
              style={{ height: `${Math.max(2, h * 100)}%` }}
            />
          ))}
        </div>

        {/* Year ticks */}
        {yearTicks.map((t) => (
          <div
            key={t.year}
            className="absolute top-0 bottom-0 border-l border-foreground/15"
            style={{ left: `${t.leftPct}%` }}
            aria-hidden
          >
            <span className="absolute top-0 left-1 text-[9px] text-foreground/60">{t.year}</span>
          </div>
        ))}

        {/* Today */}
        {showToday && (
          <div
            className="absolute top-0 bottom-0 w-px bg-foreground/80"
            style={{ left: `${todayPct}%` }}
            aria-hidden
          />
        )}

        {/* Viewport rect */}
        <div
          className={cn(
            'absolute top-0 bottom-0 bg-foreground/10 border border-foreground rounded-element cursor-grab active:cursor-grabbing',
          )}
          style={{
            left: `${Math.max(0, vpLeftPct)}%`,
            width: `${Math.min(100, vpWidthPct)}%`,
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
              e.preventDefault();
              e.stopPropagation();
              const step = (viewport.endMs - viewport.startMs) * 0.1;
              const delta = e.key === 'ArrowLeft' ? -step : step;
              onViewportChange({ startMs: viewport.startMs + delta, endMs: viewport.endMs + delta });
            }
          }}
          tabIndex={0}
          role="slider"
          aria-label="Timeline viewport"
          aria-valuemin={range.startMs}
          aria-valuemax={range.endMs}
          aria-valuenow={Math.round((viewport.startMs + viewport.endMs) / 2)}
        />
      </div>
    </div>
  );
}

