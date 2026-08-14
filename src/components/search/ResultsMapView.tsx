/* eslint-disable react-hooks/refs -- this component threads the initial-center ref through props during render; MapShell subscribes to .current itself. */
import { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { EntityMapMarker } from '@/components/map/EntityMap';
import { MapShell } from '@/components/map/MapShell';
import type { SearchResult } from '@/hooks/useSearch';

interface ResultsMapViewProps {
  results: SearchResult[];
  height?: number | string;
}

/** Upper bound on markers rendered at once — protects MapLibre on huge result sets. */
const MAX_MARKERS = 300;

const TYPE_TO_MAP_KIND: Record<string, EntityMapMarker['type']> = {
  venue: 'venues',
  venues: 'venues',
  event: 'events',
  events: 'events',
  city: 'cities',
  cities: 'cities',
  country: 'countries',
  countries: 'countries',
};

/**
 * Map view for search results.
 *
 * `results` sets the opening camera and decides whether there is anything to
 * show at all; the pins themselves come from MapShell, which fetches by
 * viewport. Selection and "search this area" are MapShell's too (the `search`
 * preset sets `enableSearchThisArea`) — the old `onSelect` / `onAreaSearch`
 * props were dropped 2026-08-10 because the MapShell branch had never called
 * them, so SearchResults was passing two callbacks into a void.
 */
export function ResultsMapView({ results, height = 480 }: ResultsMapViewProps) {
  const { t } = useTranslation();
  const initialCenterRef = useRef<[number, number] | null>(null);
  const markers: EntityMapMarker[] = useMemo(() => {
    const out: EntityMapMarker[] = [];
    for (const r of results) {
      const geo = r._geoloc;
      if (!geo || typeof geo.lat !== 'number' || typeof geo.lng !== 'number') continue;
      out.push({
        id: r.objectID,
        lat: geo.lat,
        lng: geo.lng,
        name: r.title,
        subtitle: r.location || undefined,
        type: TYPE_TO_MAP_KIND[r.type],
      });
    }
    // Cap markers to keep MapLibre geometry cheap. `results` already arrives in
    // rank/distance order, so we keep the strongest hits and drop the tail.
    // No silent truncation: log how many were dropped.
    if (out.length > MAX_MARKERS) {
      const dropped = out.length - MAX_MARKERS;
      console.info(
        `[ResultsMapView] capped map markers: showing ${MAX_MARKERS}, dropped ${dropped}`,
      );
      return out.slice(0, MAX_MARKERS);
    }
    return out;
  }, [results]);

  const center: [number, number] = useMemo(() => {
    if (markers.length === 0) return [0, 20];
    let lat = 0;
    let lng = 0;
    for (const m of markers) {
      lat += m.lat;
      lng += m.lng;
    }
    return [lng / markers.length, lat / markers.length];
  }, [markers]);

  if (markers.length === 0) {
    return (
      <div
        className="flex items-center justify-center bg-muted text-muted-foreground text-sm"
        style={{ height }}
      >
        {t('search.noMappable', 'No mappable results in this view.')}
      </div>
    );
  }

  if (!initialCenterRef.current) initialCenterRef.current = center;

  return (
    <MapShell
      surface="search"
      height={height}
      initialCenter={initialCenterRef.current}
      initialZoom={markers.length === 1 ? 12 : 5}
      skipAutoFly
    />
  );
}
