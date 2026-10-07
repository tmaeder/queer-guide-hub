import { useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { Map as MaplibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { LocateFixed, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { getMapStyle } from '@/config/mapStyle';
import { applyWhenStyleReady } from '@/components/map/mapStyleReady';
import { isWebglSupported } from '@/lib/webglSupport';
import { paper, trackColor } from '@/lib/mapTokens';
import type { CruisingBounds, CruisingPresenceArea, CruisingSpot } from '@/hooks/useCruisingGuide';

export type CruisingLayer = 'both' | 'people' | 'spots';

export interface CruisingMapProps {
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
  const [mapReady, setMapReady] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
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
    let map: MaplibreMap;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: getMapStyle(),
        center: [8.5, 47.2],
        zoom: 3,
        attributionControl: { compact: true },
        cooperativeGestures: true,
      });
    } catch (error) {
      console.error('[cruising-map] renderer initialization failed', error);
      const failureFrame = window.requestAnimationFrame(() => setMapFailed(true));
      return () => window.cancelAnimationFrame(failureFrame);
    }
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

    const stopReadyWait = applyWhenStyleReady(map, () => {
      setMapReady(true);
      onSearchArea(currentBounds(map));
    });

    return () => {
      stopReadyWait();
      map.off('moveend', handleMoveEnd);
      map.remove();
      mapRef.current = null;
    };
  }, [onSearchArea, onSelectArea, onSelectSpot, webgl]);

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
    return applyWhenStyleReady(map, apply);
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

  if (!webgl || mapFailed) {
    return (
      <div className="flex h-full min-h-80 items-center justify-center bg-surface-container px-6 text-center text-sm text-muted-foreground">
        {t('cruising.map.unavailable')}
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-[26rem] overflow-hidden bg-surface-container">
      {/* `h-full w-full` is LOAD-BEARING, not belt-and-braces alongside
          `inset-0`. MapLibre adds `.maplibregl-map` to this element, and
          `maplibre-gl.css` sets `.maplibregl-map { position: relative }`
          UNLAYERED — Tailwind v4 emits its utilities inside
          `@layer utilities`, and an unlayered rule beats a layered one at any
          specificity. So `absolute` loses, `inset-0` stops applying to a
          `position: relative` box, and the element computes to height 0: the
          map mounts, the canvas exists at MapLibre's 300px fallback, and the
          page shows an empty grey panel with no basemap and no pins.

          Measured on prod at both 390px and 1440px: `.maplibregl-map` resolved
          to `position: relative`, `height: 0px` inside a 692px parent.

          Every other map in this codebase already survives that rule by
          carrying its own height — `ExploreMap` ships `absolute inset-0 w-full
          h-full`, `EntityMap` and `PersonalitiesMap` use inline
          `style={{ height }}`, which beats an unlayered rule outright. This
          was the one container with no height of its own. Matching
          ExploreMap's class list rather than inventing a third spelling. */}
      <div
        ref={containerRef}
        className="absolute inset-0 h-full w-full"
        aria-label={t('cruising.map.ariaLabel')}
        data-map-state={mapReady ? 'ready' : 'loading'}
        data-map-spots={spotGeoJson.features.length}
      />
      {!mapReady ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-surface-container text-sm text-muted-foreground">
          {t('cruising.map.loading', 'Loading interactive map…')}
        </div>
      ) : null}
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
