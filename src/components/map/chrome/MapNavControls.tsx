import { useEffect, useState } from 'react';
import { Compass, Locate, LocateFixed, Minus, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import type { ExploreMapHandle } from '../ExploreMap';

export interface MapNavControlsProps {
  handle: ExploreMapHandle | null;
  className?: string;
}

/**
 * Design-system replacement for the native MapLibre NavigationControl +
 * GeolocateControl buttons on MapShell surfaces. Zoom is desktop-only (pinch
 * covers touch), the compass appears only when the view is rotated/pitched,
 * and geolocate sits in the bottom-right thumb zone on mobile. The native
 * GeolocateControl stays mounted (hidden) inside ExploreMap — it owns the
 * blue tracking dot; this cluster just triggers it.
 */
export const MapNavControls = ({ handle, className }: MapNavControlsProps) => {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const [rotated, setRotated] = useState(false);
  const [bearing, setBearing] = useState(0);
  const [tracking, setTracking] = useState(false);

  const map = handle?.map ?? null;

  useEffect(() => {
    if (!map) return;
    const sync = () => {
      setBearing(map.getBearing());
      setRotated(Math.abs(map.getBearing()) > 0.5 || Math.abs(map.getPitch()) > 0.5);
    };
    sync();
    map.on('rotate', sync);
    map.on('pitch', sync);
    return () => {
      map.off('rotate', sync);
      map.off('pitch', sync);
    };
  }, [map]);

  useEffect(() => {
    const geo = handle?.geolocateControl;
    if (!geo) return;
    const onStart = () => setTracking(true);
    const onEnd = () => setTracking(false);
    geo.on('trackuserlocationstart', onStart);
    geo.on('trackuserlocationend', onEnd);
    return () => {
      geo.off('trackuserlocationstart', onStart);
      geo.off('trackuserlocationend', onEnd);
    };
  }, [handle]);

  if (!map) return null;

  const btn =
    'flex h-11 w-11 items-center justify-center text-foreground hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset md:h-9 md:w-9';

  return (
    <div
      className={cn(
        'absolute right-3 z-10 flex flex-col overflow-hidden rounded-element border border-border bg-background/95 backdrop-blur-md divide-y divide-border',
        // Mobile: bottom-right thumb zone, lifted above the spotlight rail.
        'bottom-[calc(var(--map-rail-clearance,4.5rem)+0.75rem)] md:bottom-auto md:top-16',
        className,
      )}
    >
      <button
        type="button"
        aria-label={t('map.nav.zoomIn', { defaultValue: 'Zoom in' })}
        onClick={() => map.zoomIn({ duration: reducedMotion ? 0 : 300 })}
        className={cn(btn, 'hidden md:flex')}
      >
        <Plus size={16} aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label={t('map.nav.zoomOut', { defaultValue: 'Zoom out' })}
        onClick={() => map.zoomOut({ duration: reducedMotion ? 0 : 300 })}
        className={cn(btn, 'hidden md:flex')}
      >
        <Minus size={16} aria-hidden="true" />
      </button>
      {rotated && (
        <button
          type="button"
          aria-label={t('map.nav.resetNorth', { defaultValue: 'Reset bearing to north' })}
          onClick={() => map.easeTo({ bearing: 0, pitch: 0, duration: reducedMotion ? 0 : 300 })}
          className={btn}
        >
          <Compass
            size={16}
            aria-hidden="true"
            style={{ transform: `rotate(${-45 - bearing}deg)` }}
          />
        </button>
      )}
      <button
        type="button"
        aria-label={t('map.nav.geolocate', { defaultValue: 'Show my location' })}
        aria-pressed={tracking}
        onClick={() => handle?.triggerGeolocate()}
        className={btn}
      >
        {tracking ? (
          <LocateFixed size={16} aria-hidden="true" />
        ) : (
          <Locate size={16} aria-hidden="true" />
        )}
      </button>
    </div>
  );
};

export default MapNavControls;
