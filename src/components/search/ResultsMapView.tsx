import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EntityMap, type EntityMapMarker } from '@/components/map/EntityMap';
import { Button } from '@/components/ui/button';
import { Navigation } from 'lucide-react';
import type { SearchResult } from '@/hooks/useSearch';

interface ResultsMapViewProps {
  results: SearchResult[];
  height?: number | string;
  onSelect?: (result: SearchResult) => void;
  /** Called with lat/lng/radius (meters) when the user clicks "Search this area". */
  onAreaSearch?: (area: { lat: number; lng: number; radius: number }) => void;
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

export function ResultsMapView({ results, height = 480, onSelect, onAreaSearch }: ResultsMapViewProps) {
  const { t } = useTranslation();
  const lastBoundsRef = useRef<{ center: [number, number]; radius: number } | null>(null);
  const initialCenterRef = useRef<[number, number] | null>(null);
  const [showAreaSearch, setShowAreaSearch] = useState(false);
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

  if (!initialCenterRef.current) initialCenterRef.current = center;

  return (
    <div
      style={{ position: 'relative', height }}
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
        center={initialCenterRef.current}
        zoom={markers.length === 1 ? 12 : 5}
        height={height}
        markers={markers}
        scrollZoom
        onMoveEnd={({ center: c, bounds }) => {
          // Radius = half the diagonal of the visible bbox (rough but adequate).
          const R = 6371000; // m
          const toRad = (d: number) => (d * Math.PI) / 180;
          const dLat = toRad(bounds.north - bounds.south);
          const dLng = toRad(bounds.east - bounds.west);
          const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(bounds.south)) * Math.cos(toRad(bounds.north)) * Math.sin(dLng / 2) ** 2;
          const diag = 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          lastBoundsRef.current = { center: c, radius: Math.round(diag / 2) };
          setShowAreaSearch(true);
        }}
      />
      {onAreaSearch && showAreaSearch && lastBoundsRef.current && (
        <Button
          size="sm"
          onClick={() => {
            if (!lastBoundsRef.current) return;
            onAreaSearch({
              lat: lastBoundsRef.current.center[1],
              lng: lastBoundsRef.current.center[0],
              radius: lastBoundsRef.current.radius,
            });
            setShowAreaSearch(false);
          }}
          style={{
            position: 'absolute',
            top: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 5,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <Navigation style={{ width: 14, height: 14 }} />
          {t('search.searchThisArea', 'Search this area')}
        </Button>
      )}
    </div>
  );
}
