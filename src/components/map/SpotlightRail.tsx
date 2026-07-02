import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useReducedMotion } from '@/hooks/useReducedMotion';
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

/** Publish the rail's current height as a CSS var so fixed chrome (feedback
 *  FAB, legend, nav controls) can clear it without hardcoded offsets. */
function useRailClearance(state: 'hidden' | 'collapsed' | 'expanded') {
  useEffect(() => {
    const root = document.documentElement;
    const value = state === 'expanded' ? '9.5rem' : state === 'collapsed' ? '4.5rem' : null;
    if (value) root.style.setProperty('--map-rail-clearance', value);
    else root.style.removeProperty('--map-rail-clearance');
    return () => {
      root.style.removeProperty('--map-rail-clearance');
    };
  }, [state]);
}

/**
 * Bottom card scroller of "what's in view", synced two-way with the map:
 * hovering/focusing a card rings its pin, clicking flies to it and opens its
 * popup. Turns the map from a lookup tool into a browse surface. MapShell-only.
 */
export function SpotlightRail({
  points,
  selectedId,
  loading,
  onHover,
  onSelect,
}: SpotlightRailProps) {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const [collapsed, setCollapsed] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // Roving tabindex — one card in the tab order; arrows move within the rail.
  const [focusIndex, setFocusIndex] = useState(0);
  // Cap the rendered set — the in-view feed can be large; the ranking surfaces
  // the most relevant first and the count line is honest about the remainder.
  const ranked = useMemo(() => rankPoints(points).slice(0, 30), [points]);
  const total = points.length;

  const visible = total > 0 || !!loading;
  useRailClearance(!visible ? 'hidden' : collapsed ? 'collapsed' : 'expanded');

  // Scroll the selected card into view when selection changes (e.g. a pin was
  // clicked on the map). Center it horizontally in the scroller.
  useEffect(() => {
    if (!selectedId || !scrollRef.current) return;
    const el = scrollRef.current.querySelector<HTMLElement>(
      `[data-point-id="${CSS.escape(selectedId)}"]`,
    );
    el?.scrollIntoView({
      behavior: reducedMotion ? 'auto' : 'smooth',
      inline: 'center',
      block: 'nearest',
    });
  }, [selectedId, reducedMotion]);

  const focusCard = useCallback((index: number) => {
    const cards = scrollRef.current?.querySelectorAll<HTMLElement>('[data-point-id]');
    const el = cards?.[index];
    if (el) {
      setFocusIndex(index);
      el.focus();
    }
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    let next: number | null = null;
    if (e.key === 'ArrowRight') next = Math.min(focusIndex + 1, ranked.length - 1);
    else if (e.key === 'ArrowLeft') next = Math.max(focusIndex - 1, 0);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = ranked.length - 1;
    if (next !== null) {
      e.preventDefault();
      focusCard(next);
    }
  };

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
              <div key={i} className="h-16 w-56 shrink-0 animate-pulse rounded-container bg-muted" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (total === 0) return null;

  const countLabel = t('map.rail.inView', {
    defaultValue: '{{count}} places in view',
    count: total,
  });

  if (collapsed) {
    return (
      <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-4">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="pointer-events-auto inline-flex items-center gap-1.5 rounded-element border border-border bg-background/95 px-4 py-1.5 text-13 text-foreground backdrop-blur-md hover:bg-background focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          <span aria-live="polite">{countLabel}</span>
          <ChevronUp className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-4">
      <div className="pointer-events-auto w-[min(960px,100%)] rounded-container border border-border bg-background/95 p-2 backdrop-blur-md">
        <div className="flex items-center justify-between px-1 pb-1.5">
          <span
            className="inline-flex items-center gap-1.5 text-13 font-medium text-foreground"
            role="status"
            aria-live="polite"
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            {countLabel}
          </span>
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            aria-label={t('map.rail.hide', { defaultValue: 'Hide nearby places' })}
            className="text-muted-foreground hover:text-foreground focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <ChevronDown className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div
          ref={scrollRef}
          className={`flex gap-2 overflow-x-auto pb-1.5 snap-x snap-proximity scroll-px-2 ${
            reducedMotion ? '' : 'scroll-smooth'
          }`}
          role="listbox"
          aria-label={t('map.rail.listLabel', { defaultValue: 'Places in view' })}
          aria-orientation="horizontal"
          onKeyDown={handleKeyDown}
        >
          {ranked.map((point, i) => (
            <button
              key={point.id}
              type="button"
              role="option"
              aria-selected={selectedId === point.id}
              tabIndex={i === focusIndex ? 0 : -1}
              data-point-id={point.id}
              aria-label={t('map.rail.showOnMap', {
                defaultValue: 'Show {{name}} on the map',
                name: point.name,
              })}
              className={`block w-56 shrink-0 snap-start cursor-pointer rounded-container text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                selectedId === point.id ? 'ring-2 ring-foreground' : ''
              }`}
              onMouseEnter={() => onHover(point.id)}
              onMouseLeave={() => onHover(null)}
              onFocus={() => {
                setFocusIndex(i);
                onHover(point.id);
              }}
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
