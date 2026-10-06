import { useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { Map as MaplibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { LocateFixed, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { getMapStyle } from '@/config/mapStyle';
import { isWebglSupported } from '@/lib/webglSupport';
import { paper, trackColor } from '@/lib/mapTokens';
import type { CruisingBounds, CruisingPresenceArea, CruisingSpot } from '@/hooks/useCruisingGuide';

export type CruisingLayer = 'both' | 'people' | 'spots';

interface CruisingMapProps {
  spots: CruisingSpot[];
  presenceAreas: CruisingPresenceArea[];
  layer: CruisingLayer;
  focusSpot?: CruisingSpot | null;
  onSelectSpot: (spot: CruisingSpot) => void;
  onSelectArea: (area: CruisingPresenceArea) => void;
  onSearchArea: (bounds: CruisingBounds) => void;
}

function currentBounds(map: MaplibreMap): CruisingBounds {
  const bounds = map.getBounds();
  return {
    west: bounds.getWest(),
    south: bounds.getSouth(),
    east: bounds.getEast(),
    north: bounds.getNorth(),
  };
}

export function CruisingMap({
  spots,
  presenceAreas,
  layer,
  focusSpot,
  onSelectSpot,
  onSelectArea,
  onSearchArea,
}: CruisingMapProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const spotsRef = useRef(spots);
  const areasRef = useRef(presenceAreas);
  const [pendingBounds, setPendingBounds] = useState<CruisingBounds | null>(null);
  const [webgl] = useState(() => isWebglSupported());

  useEffect(() => {
    spotsRef.current = spots;
    areasRef.current = presenceAreas;
  }, [presenceAreas, spots]);

  const spotGeoJson = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features: spots
        .filter(
          (spot): spot is CruisingSpot & { latitude: number; longitude: number } =>
            typeof spot.latitude === 'number' && typeof spot.longitude === 'number',
        )
        .map((spot) => ({
          type: 'Feature',
          id: spot.id,
          geometry: { type: 'Point', coordinates: [spot.longitude, spot.latitude] },
          properties: { id: spot.id, name: spot.name },
        })),
    }),
    [spots],
  );

  const presenceGeoJson = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features: presenceAreas.map((area) => ({
        type: 'Feature',
        id: area.city_id,
        geometry: { type: 'Point', coordinates: [area.longitude, area.latitude] },
        properties: {
          id: area.city_id,
          name: area.city_name,
          count: area.active_count,
        },
      })),
    }),
    [presenceAreas],
  );

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !webgl) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: getMapStyle(),
      center: [8.5, 47.2],
      zoom: 3,
      attributionControl: { compact: true },
      cooperativeGestures: true,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    const handleMoveEnd = () => setPendingBounds(currentBounds(map));
    map.on('moveend', handleMoveEnd);

    const selectSpot = (event: maplibregl.MapLayerMouseEvent) => {
      const id = String(event.features?.[0]?.properties?.id ?? '');
      const spot = spotsRef.current.find((item) => item.id === id);
      if (spot) onSelectSpot(spot);
    };
    const selectArea = (event: maplibregl.MapLayerMouseEvent) => {
      const id = String(event.features?.[0]?.properties?.id ?? '');
      const area = areasRef.current.find((item) => item.city_id === id);
      if (area) onSelectArea(area);
    };
    const pointerOn = () => {
      map.getCanvas().style.cursor = 'pointer';
    };
    const pointerOff = () => {
      map.getCanvas().style.cursor = '';
    };

    map.on('click', 'cruising-spots-circle', selectSpot);
    map.on('click', 'cruising-presence-circle', selectArea);
    map.on('mouseenter', 'cruising-spots-circle', pointerOn);
    map.on('mouseleave', 'cruising-spots-circle', pointerOff);
    map.on('mouseenter', 'cruising-presence-circle', pointerOn);
    map.on('mouseleave', 'cruising-presence-circle', pointerOff);

    return () => {
      map.off('moveend', handleMoveEnd);
      map.remove();
      mapRef.current = null;
    };
  }, [onSelectArea, onSelectSpot, webgl]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const spotSource = map.getSource('cruising-spots') as maplibregl.GeoJSONSource | undefined;
      if (spotSource) {
        spotSource.setData(spotGeoJson);
      } else {
        map.addSource('cruising-spots', { type: 'geojson', data: spotGeoJson });
        map.addLayer({
          id: 'cruising-spots-circle',
          type: 'circle',
          source: 'cruising-spots',
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 4, 10, 7, 15, 10],
            'circle-color': trackColor('pink'),
            'circle-stroke-color': paper(),
            'circle-stroke-width': 1.5,
            'circle-opacity': 0.94,
          },
        });
      }

      const presenceSource = map.getSource('cruising-presence') as
        maplibregl.GeoJSONSource | undefined;
      if (presenceSource) {
        presenceSource.setData(presenceGeoJson);
      } else {
        map.addSource('cruising-presence', { type: 'geojson', data: presenceGeoJson });
        map.addLayer({
          id: 'cruising-presence-circle',
          type: 'circle',
          source: 'cruising-presence',
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['get', 'count'], 1, 13, 10, 21, 50, 30],
            'circle-color': trackColor('blue'),
            'circle-stroke-color': paper(),
            'circle-stroke-width': 2,
            'circle-opacity': 0.88,
          },
        });
        map.addLayer({
          id: 'cruising-presence-count',
          type: 'symbol',
          source: 'cruising-presence',
          layout: {
            'text-field': ['to-string', ['get', 'count']],
            'text-size': 12,
          },
          paint: { 'text-color': paper() },
        });
      }
    };
    if (map.isStyleLoaded()) apply();
    else map.once('load', apply);
  }, [presenceGeoJson, spotGeoJson]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer('cruising-spots-circle')) return;
    const spotsVisible = layer !== 'people' ? 'visible' : 'none';
    const peopleVisible = layer !== 'spots' ? 'visible' : 'none';
    map.setLayoutProperty('cruising-spots-circle', 'visibility', spotsVisible);
    if (map.getLayer('cruising-presence-circle')) {
      map.setLayoutProperty('cruising-presence-circle', 'visibility', peopleVisible);
    }
    if (map.getLayer('cruising-presence-count')) {
      map.setLayoutProperty('cruising-presence-count', 'visibility', peopleVisible);
    }
  }, [layer, spotGeoJson, presenceGeoJson]);

  useEffect(() => {
    const map = mapRef.current;
    if (
      !map ||
      typeof focusSpot?.latitude !== 'number' ||
      typeof focusSpot.longitude !== 'number'
    ) {
      return;
    }
    map.flyTo({ center: [focusSpot.longitude, focusSpot.latitude], zoom: 14 });
  }, [focusSpot]);

  const locate = () => {
    const map = mapRef.current;
    if (!map || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((position) => {
      map.flyTo({
        center: [position.coords.longitude, position.coords.latitude],
        zoom: 13,
      });
    });
  };

  if (!webgl) {
    return (
      <div className="flex h-full min-h-80 items-center justify-center bg-surface-container px-6 text-center text-sm text-muted-foreground">
        {t('cruising.map.unavailable')}
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-[26rem] overflow-hidden bg-surface-container">
      <div
        ref={containerRef}
        className="absolute inset-0"
        aria-label={t('cruising.map.ariaLabel')}
      />
      <div className="absolute left-4 top-4 z-10 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" className="gap-2 shadow-sm" onClick={locate}>
          <LocateFixed size={14} aria-hidden />
          {t('cruising.map.nearMe')}
        </Button>
        {pendingBounds ? (
          <Button
            size="sm"
            className="gap-2 shadow-sm"
            onClick={() => {
              onSearchArea(pendingBounds);
              setPendingBounds(null);
            }}
          >
            <Search size={14} aria-hidden />
            {t('cruising.map.searchArea')}
          </Button>
        ) : null}
      </div>
      <div className="absolute bottom-4 left-4 z-10 rounded-badge bg-background/90 px-4 py-1.5 text-xs shadow-sm backdrop-blur">
        {t('cruising.map.legend')}
      </div>
    </div>
  );
}
