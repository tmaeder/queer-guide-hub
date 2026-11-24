import { useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { Map as MaplibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { LocateFixed, Search } from '@/components/icons';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { getMapStyle } from '@/config/mapStyle';
import { applyWhenStyleReady } from '@/components/map/mapStyleReady';
import { isWebglSupported } from '@/lib/webglSupport';
import { paper, tokenColor, trackColor } from '@/lib/mapTokens';
import type { CruisingBounds, CruisingPresenceArea, CruisingSpot } from '@/hooks/useCruisingGuide';

/** Which of the three layers are drawn. */
export interface MapLayers {
  /** Cities where members are live to Everyone or Friends. */
  people: boolean;
  /** Cities where opted-in members are live for dating. */
  dating: boolean;
  /** Listed cruising places. */
  spots: boolean;
}

export type AreaKind = 'people' | 'dating';

export interface CruisingMapProps {
  spots: CruisingSpot[];
  datingAreas: CruisingPresenceArea[];
  peopleAreas: CruisingPresenceArea[];
  layers: MapLayers;
  focusSpot?: CruisingSpot | null;
  onSelectSpot: (spot: CruisingSpot) => void;
  onSelectArea: (area: CruisingPresenceArea, kind: AreaKind) => void;
  onSearchArea: (bounds: CruisingBounds) => void;
}

function areasGeoJson(areas: CruisingPresenceArea[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: areas.map((area) => ({
      type: 'Feature',
      id: area.city_id,
      geometry: { type: 'Point', coordinates: [area.longitude, area.latitude] },
      properties: { id: area.city_id, name: area.city_name, count: area.active_count },
    })),
  };
}

/** Source id, circle colour and click kind for each area layer. Dating keeps
 *  its original 'cruising-presence' ids. */
const AREA_LAYERS = [
  { kind: 'dating' as const, source: 'cruising-presence', track: 'blue' as const },
  { kind: 'people' as const, source: 'nearby-presence', track: 'green' as const },
];

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
  datingAreas,
  peopleAreas,
  layers,
  focusSpot,
  onSelectSpot,
  onSelectArea,
  onSearchArea,
}: CruisingMapProps) {
  const { t } = useTranslation();
  const { people: showPeople, dating: showDating, spots: showSpots } = layers;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const spotsRef = useRef(spots);
  const areasRef = useRef({ dating: datingAreas, people: peopleAreas });
  const fittedInitialSpotsRef = useRef(false);
  const [pendingBounds, setPendingBounds] = useState<CruisingBounds | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const [renderedSpotCount, setRenderedSpotCount] = useState(0);
  const [webgl] = useState(() => isWebglSupported());

  useEffect(() => {
    spotsRef.current = spots;
    areasRef.current = { dating: datingAreas, people: peopleAreas };
  }, [datingAreas, peopleAreas, spots]);

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

  const datingGeoJson = useMemo(() => areasGeoJson(datingAreas), [datingAreas]);
  const peopleGeoJson = useMemo(() => areasGeoJson(peopleAreas), [peopleAreas]);

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

    const updateRenderedSpotCount = () => {
      if (!map.getLayer('cruising-spots-circle')) return;
      setRenderedSpotCount(map.queryRenderedFeatures({ layers: ['cruising-spots-circle'] }).length);
    };
    map.on('idle', updateRenderedSpotCount);

    const selectSpot = (event: maplibregl.MapLayerMouseEvent) => {
      const id = String(event.features?.[0]?.properties?.id ?? '');
      const spot = spotsRef.current.find((item) => item.id === id);
      if (spot) onSelectSpot(spot);
    };
    const selectArea = (kind: AreaKind) => (event: maplibregl.MapLayerMouseEvent) => {
      const id = String(event.features?.[0]?.properties?.id ?? '');
      const area = areasRef.current[kind].find((item) => item.city_id === id);
      if (area) onSelectArea(area, kind);
    };
    const pointerOn = () => {
      map.getCanvas().style.cursor = 'pointer';
    };
    const pointerOff = () => {
      map.getCanvas().style.cursor = '';
    };

    map.on('click', 'cruising-spots-circle', selectSpot);
    map.on('mouseenter', 'cruising-spots-circle', pointerOn);
    map.on('mouseleave', 'cruising-spots-circle', pointerOff);
    for (const { kind, source } of AREA_LAYERS) {
      map.on('click', `${source}-circle`, selectArea(kind));
      map.on('mouseenter', `${source}-circle`, pointerOn);
      map.on('mouseleave', `${source}-circle`, pointerOff);
    }

    const stopReadyWait = applyWhenStyleReady(map, () => {
      setMapReady(true);
    });

    return () => {
      stopReadyWait();
      map.off('moveend', handleMoveEnd);
      map.off('idle', updateRenderedSpotCount);
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

      if (!fittedInitialSpotsRef.current && spotGeoJson.features.length > 0) {
        const bounds = new maplibregl.LngLatBounds();
        for (const feature of spotGeoJson.features) {
          if (feature.geometry.type === 'Point') {
            bounds.extend(feature.geometry.coordinates as [number, number]);
          }
        }
        if (!bounds.isEmpty()) {
          fittedInitialSpotsRef.current = true;
          map.fitBounds(bounds, { padding: 64, maxZoom: 12, duration: 0 });
        }
      }

      for (const { kind, source, track } of AREA_LAYERS) {
        const data = kind === 'dating' ? datingGeoJson : peopleGeoJson;
        const existing = map.getSource(source) as maplibregl.GeoJSONSource | undefined;
        if (existing) {
          existing.setData(data);
          continue;
        }
        map.addSource(source, { type: 'geojson', data });
        map.addLayer({
          id: `${source}-circle`,
          type: 'circle',
          source,
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['get', 'count'], 1, 13, 10, 21, 50, 30],
            'circle-color': trackColor(track),
            'circle-stroke-color': paper(),
            'circle-stroke-width': 2,
            'circle-opacity': 0.88,
          },
        });
        map.addLayer({
          id: `${source}-count`,
          type: 'symbol',
          source,
          layout: {
            'text-field': ['to-string', ['get', 'count']],
            'text-size': 12,
          },
          // Ink on every track fill (paper-on-blue/green fails contrast); --track-ring stays ink in dark mode.
          paint: { 'text-color': tokenColor('--track-ring') },
        });
      }
    };
    return applyWhenStyleReady(map, apply);
  }, [datingGeoJson, peopleGeoJson, spotGeoJson]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer('cruising-spots-circle')) return;
    const show = (on: boolean) => (on ? 'visible' : 'none');
    const on = { people: showPeople, dating: showDating };
    map.setLayoutProperty('cruising-spots-circle', 'visibility', show(showSpots));
    for (const { kind, source } of AREA_LAYERS) {
      for (const id of [`${source}-circle`, `${source}-count`]) {
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', show(on[kind]));
      }
    }
  }, [showSpots, showDating, showPeople, mapReady, spotGeoJson, datingGeoJson, peopleGeoJson]);

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
        data-map-rendered-spots={renderedSpotCount}
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
        {t('nearby.map.legend', 'Green: people live · Blue: dating · Pink: spots')}
      </div>
    </div>
  );
}
