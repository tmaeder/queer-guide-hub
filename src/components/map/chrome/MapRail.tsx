import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { cn } from '@/lib/utils';
import { DepartureRow } from '@/components/transit/DepartureRow';
import { bulletTypeForLayer, departureStatus, departureTime } from './railDeparture';
import type { MapPointSummary } from '../mapPoint';

export interface MapRailProps {
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
 *  FAB, nav controls) can clear it without hardcoded offsets. */
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
 * The departure board — what's in view, ranked, synced two-way with the map.
 *
 * Formerly `SpotlightRail`. Same behaviour (ranking, roving tabindex, fly-to on
 * select, hover rings the pin) in the board form the design system asks for:
 * an ink header strip over paper cards.
 *
 * The board owns the count on every surface that has one. `MapResultsPill`
 * still exists and is still correct — `showResultCount={!showRail}` makes the
 * two mutually exclusive, so the pill is the counter for rail-less surfaces
 * (the trip map, and `/venues`, which mounts ExploreMap directly with no
 * shell). They have never both been on screen at once.
 */
export function MapRail({ points, selectedId, loading, onHover, onSelect }: MapRailProps) {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const [collapsed, setCollapsed] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  // Cap the rendered set — the in-view feed can be large; the ranking surfaces
  // the most relevant first and the count line is honest about the remainder.
  const ranked = useMemo(() => rankPoints(points).slice(0, 30), [points]);
  const total = points.length;

  const visible = total > 0 || !!loading;
  useRailClearance(!visible ? 'hidden' : collapsed ? 'collapsed' : 'expanded');

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

  const shell = 'pointer-events-auto w-[min(960px,100%)] bg-card rounded-container shadow-soft';

  // First-load skeleton — avoids a 0→data pop before the first fetch resolves.
  if (loading && total === 0) {
    return (
      <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-4">
        <div className={shell}>
          <div className="bg-foreground px-4 py-1.5">
            <span className="inline-block h-3 w-28 animate-pulse bg-background/40" />
          </div>
          <div className="flex gap-2 overflow-hidden p-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-16 w-56 shrink-0 animate-pulse bg-muted" />
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

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-4">
      <div className={shell}>
        {/* Board header — reversed plate, the way a station board names itself. */}
        <div className="flex items-center justify-between gap-2 bg-foreground px-4 py-1.5">
          <span
            className="truncate text-2xs uppercase tracking-wider text-background"
            role="status"
            aria-live="polite"
          >
            {countLabel}
          </span>
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            aria-expanded={!collapsed}
            aria-label={
              collapsed
                ? t('map.rail.show', { defaultValue: 'Show nearby places' })
                : t('map.rail.hide', { defaultValue: 'Hide nearby places' })
            }
            className="shrink-0 text-background hover:opacity-70 focus:outline-none focus-visible:ring-2 focus-visible:ring-background focus-visible:ring-inset"
          >
            {collapsed ? (
              <ChevronUp className="h-4 w-4" aria-hidden />
            ) : (
              <ChevronDown className="h-4 w-4" aria-hidden />
            )}
          </button>
        </div>

        {!collapsed && (
          <div
            ref={scrollRef}
            className={cn(
              'flex snap-x snap-proximity gap-2 overflow-x-auto scroll-px-2 p-2',
              !reducedMotion && 'scroll-smooth',
            )}
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
                className={cn(
                  'card-lift-sm block w-[17.5rem] shrink-0 cursor-pointer snap-start bg-card text-left rounded-container shadow-soft',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  selectedId === point.id && 'bg-foreground text-background',
                )}
                onMouseEnter={() => onHover(point.id)}
                onMouseLeave={() => onHover(null)}
                onFocus={() => {
                  setFocusIndex(i);
                  onHover(point.id);
                }}
                onBlur={() => onHover(null)}
                onClick={() => onSelect(point.id)}
              >
                {/* Departure-board grammar: bullet · time · title · status.
                    No `href` — the rail SELECTS on the map (fly-to) rather
                    than navigating, and passing one would nest a link inside
                    this button (axe nested-interactive). Omitting it also
                    drops DepartureRow's own lift, which the wrapper already
                    supplies. */}
                <DepartureRow
                  type={bulletTypeForLayer(point.type)}
                  time={departureTime(point)}
                  title={point.name}
                  {...departureStatus(point)}
                  className="bg-transparent"
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default MapRail;
