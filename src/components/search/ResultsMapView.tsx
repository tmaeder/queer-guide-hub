import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { EntityMap, type EntityMapMarker } from '@/components/map/EntityMap';
import type { SearchResult } from '@/hooks/useSearch';

interface ResultsMapViewProps {
  results: SearchResult[];
  height?: number | string;
  onSelect?: (result: SearchResult) => void;
}

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

export function ResultsMapView({ results, height = 480, onSelect }: ResultsMapViewProps) {
  const { t } = useTranslation();
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
        className="flex items-center justify-center bg-muted"
        style={{ height, color: 'hsl(var(--muted-foreground))', fontSize: '0.875rem' }}
      >
        {t('search.noMappable', 'No mappable results in this view.')}
      </div>
    );
  }

  // EntityMap handles its own clicks via linkTo; we override using onSelect via DOM event delegation.
  return (
    <div
      style={{ height }}
      onClickCapture={(e) => {
        if (!onSelect) return;
        const el = (e.target as HTMLElement | null)?.closest('[data-marker-id]') as HTMLElement | null;
        const id = el?.getAttribute('data-marker-id');
        if (!id) return;
        const hit = results.find((r) => r.objectID === id);
        if (hit) onSelect(hit);
      }}
    >
      <EntityMap
        center={center}
        zoom={markers.length === 1 ? 12 : 5}
        height={height}
        markers={markers}
        scrollZoom
      />
    </div>
  );
}
