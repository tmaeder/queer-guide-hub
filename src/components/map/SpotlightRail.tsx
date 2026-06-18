import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { MapEntityCard } from './MapEntityCard';
import type { MapPointSummary } from './mapPoint';

export interface SpotlightRailProps {
  points: MapPointSummary[];
  selectedId?: string | null;
  loading?: boolean;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}

/** Rank: featured first, then live/open-now, then nearest, then alphabetical. */
function rankPoints(points: MapPointSummary[]): MapPointSummary[] {
  return [...points].sort((a, b) => {
    if (a.featured !== b.featured) return a.featured ? -1 : 1;
    if (a.live !== b.live) return a.live ? -1 : 1;
    const da = a.distanceKm ?? Infinity;
    const db = b.distanceKm ?? Infinity;
    if (da !== db) return da - db;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Bottom card scroller of "what's in view", synced two-way with the map:
 * hovering a card rings its pin, clicking flies to it and opens its popup.
 * Turns the map from a lookup tool into a browse surface. MapShell-only.
 */
export function SpotlightRail({
  points,
  selectedId,
  loading,
  onHover,
  onSelect,
}: SpotlightRailProps) {
  const [collapsed, setCollapsed] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // Cap the rendered set — the in-view feed can be large; the ranking surfaces
  // the most relevant first and the count line is honest about the remainder.
  const ranked = useMemo(() => rankPoints(points).slice(0, 30), [points]);
  const total = points.length;

  // Scroll the selected card into view when selection changes (e.g. a pin was
  // clicked on the map). Center it horizontally in the scroller.
  useEffect(() => {
    if (!selectedId || !scrollRef.current) return;
    const el = scrollRef.current.querySelector<HTMLElement>(`[data-point-id="${CSS.escape(selectedId)}"]`);
    el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [selectedId]);

  // First-load skeleton — avoids a 0→data pop before the first fetch resolves.
  if (loading && total === 0) {
    return (
      <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-4">
        <div className="pointer-events-auto w-[min(960px,100%)] rounded-container border border-border bg-background/95 p-2 backdrop-blur-md">
          <div className="px-1 pb-1.5">
            <span className="inline-block h-4 w-28 animate-pulse rounded-badge bg-muted" />
          </div>
          <div className="flex gap-2 overflow-hidden pb-1.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-36 w-44 shrink-0 animate-pulse rounded-container bg-muted" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (total === 0) return null;

  const countLabel = `${total.toLocaleString()} ${total === 1 ? 'place' : 'places'} in view`;

  if (collapsed) {
    return (
      <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-4">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-border bg-background/95 px-4 py-1.5 text-13 text-foreground backdrop-blur-md hover:bg-background"
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          {countLabel}
          <ChevronUp className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-4">
      <div className="pointer-events-auto w-[min(960px,100%)] rounded-container border border-border bg-background/95 p-2 backdrop-blur-md">
        <div className="flex items-center justify-between px-1 pb-1.5">
          <span className="inline-flex items-center gap-1.5 text-13 font-medium text-foreground">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            {countLabel}
          </span>
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            aria-label="Hide nearby places"
            className="text-muted-foreground hover:text-foreground"
          >
            <ChevronDown className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div ref={scrollRef} className="flex gap-2 overflow-x-auto pb-1.5" role="list">
          {ranked.map((point) => (
            <button
              key={point.id}
              type="button"
              role="listitem"
              data-point-id={point.id}
              aria-label={`Show ${point.name} on the map`}
              className={`block w-44 shrink-0 cursor-pointer rounded-container text-left ${
                selectedId === point.id ? 'ring-2 ring-foreground' : ''
              }`}
              onMouseEnter={() => onHover(point.id)}
              onMouseLeave={() => onHover(null)}
              onFocus={() => onHover(point.id)}
              onBlur={() => onHover(null)}
              onClick={() => onSelect(point.id)}
            >
              <MapEntityCard point={point} variant="rail" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default SpotlightRail;
