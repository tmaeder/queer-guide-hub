import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import type { GeoJSONSource, MapLayerMouseEvent } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { getMapStyle } from '@/config/mapStyle';
import { useTheme } from '@/components/theme/ThemeProvider';
import { getScoreRingColor } from '@/utils/equalityScore';
import type { DirectoryCity } from '@/hooks/useCitiesDirectory';

interface CitiesMapPaneProps {
  cities: DirectoryCity[];
  selectedCityId?: string | null;
  hoveredCityId?: string | null;
  onSelectCity: (slug: string) => void;
  onHoverCity?: (cityId: string | null) => void;
  height?: number | string;
  className?: string;
}

const SOURCE_ID = 'cities-source';
const CLUSTERS_LAYER = 'cities-clusters';
const CLUSTER_COUNT_LAYER = 'cities-cluster-count';
const POINTS_LAYER = 'cities-points';
const POINTS_RING_LAYER = 'cities-points-ring';
const POINTS_SELECTED_LAYER = 'cities-points-selected';

interface CityFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: {
    id: string;
    slug: string;
    name: string;
    score: number;
    color: string;
  };
}

function toFeatures(cities: DirectoryCity[]): CityFeature[] {
  const features: CityFeature[] = [];
  for (const c of cities) {
    if (c.latitude == null || c.longitude == null) continue;
    const score = c.countries?.equality_score ?? -1;
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [c.longitude, c.latitude] },
      properties: {
        id: c.id,
        slug: c.slug,
        name: c.name,
        score,
        color: getScoreRingColor(score >= 0 ? score : null),
      },
    });
  }
  return features;
}

function boundsOf(cities: DirectoryCity[]): maplibregl.LngLatBounds | null {
  let valid = 0;
  const bounds = new maplibregl.LngLatBounds();
  for (const c of cities) {
    if (c.latitude == null || c.longitude == null) continue;
    bounds.extend([c.longitude, c.latitude]);
    valid++;
  }
  return valid > 0 ? bounds : null;
}

export function CitiesMapPane({
  cities,
  selectedCityId,
  hoveredCityId,
  onSelectCity,
  onHoverCity,
  height = '100%',
  className,
}: CitiesMapPaneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const { resolvedTheme } = useTheme();
  const lastFitKeyRef = useRef<string>('');
  const fitTimerRef = useRef<number | null>(null);
  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Init map — recreated when the theme flips so the basemap flavor follows it.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: getMapStyle(resolvedTheme),
      center: [0, 20],
      zoom: 1.5,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      // Let the fit effect re-fit the recreated map to the current city set.
      lastFitKeyRef.current = '';
    };
  }, [resolvedTheme]);

  // Build / update features and layers whenever filtered cities change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const features = toFeatures(cities);
    const geojson = { type: 'FeatureCollection' as const, features };

    const apply = () => {
      const existing = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
      if (existing) {
        existing.setData(geojson);
        return;
      }
      map.addSource(SOURCE_ID, {
        type: 'geojson',
        data: geojson,
        cluster: true,
        clusterMaxZoom: 5,
        clusterRadius: 48,
      });

      map.addLayer({
        id: CLUSTERS_LAYER,
        type: 'circle',
        source: SOURCE_ID,
        filter: ['has', 'point_count'],
        paint: {
          'circle-radius': ['step', ['get', 'point_count'], 14, 10, 20, 50, 26, 100, 32],
          'circle-color': 'hsl(0, 0%, 10%)',
          'circle-stroke-width': 2,
          'circle-stroke-color': 'hsl(0, 0%, 100%)',
          'circle-opacity': 0.9,
        },
      });

      map.addLayer({
        id: CLUSTER_COUNT_LAYER,
        type: 'symbol',
        source: SOURCE_ID,
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-font': ['Noto Sans Medium'],
          'text-size': 12,
        },
        paint: { 'text-color': 'hsl(0, 0%, 100%)' },
      });

      // White outer ring so colored pin sits inside a halo (legible on both
      // light + dark map styles).
      map.addLayer({
        id: POINTS_RING_LAYER,
        type: 'circle',
        source: SOURCE_ID,
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-radius': 7,
          'circle-color': 'hsl(0, 0%, 100%)',
        },
      });

      map.addLayer({
        id: POINTS_LAYER,
        type: 'circle',
        source: SOURCE_ID,
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-radius': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            6,
            5,
          ],
          'circle-color': ['get', 'color'],
          'circle-stroke-width': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            2,
            0,
          ],
          'circle-stroke-color': 'hsl(0, 0%, 10%)',
        },
      });

      // Selected pin overlay — bigger ring, sits on top.
      map.addLayer({
        id: POINTS_SELECTED_LAYER,
        type: 'circle',
        source: SOURCE_ID,
        filter: ['==', ['get', 'id'], ''], // populated dynamically
        paint: {
          'circle-radius': 10,
          'circle-color': 'rgba(0, 0, 0, 0)',
          'circle-stroke-width': 2.5,
          'circle-stroke-color': 'hsl(0, 0%, 10%)',
        },
      });

      // Click: cluster → zoom; point → select.
      map.on('click', CLUSTERS_LAYER, async (e: MapLayerMouseEvent) => {
        const feat = e.features?.[0];
        if (!feat) return;
        const clusterId = feat.properties?.cluster_id;
        const src = map.getSource(SOURCE_ID) as GeoJSONSource;
        try {
          const zoom = await src.getClusterExpansionZoom(clusterId);
          map.flyTo({
            center: (feat.geometry as GeoJSON.Point).coordinates as [number, number],
            zoom: zoom + 0.5,
            speed: reducedMotion ? 4 : 1.5,
          });
        } catch {
          /* swallow */
        }
      });

      map.on('click', POINTS_LAYER, (e: MapLayerMouseEvent) => {
        const feat = e.features?.[0];
        if (!feat) return;
        const props = feat.properties as { slug: string; id: string };
        onSelectCity(props.slug || props.id);
      });

      // Cursor + hover feature-state
      let lastHoverId: string | number | null = null;
      for (const layer of [CLUSTERS_LAYER, POINTS_LAYER]) {
        map.on('mouseenter', layer, () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', layer, () => {
          map.getCanvas().style.cursor = '';
        });
      }
      map.on('mousemove', POINTS_LAYER, (e: MapLayerMouseEvent) => {
        const feat = e.features?.[0];
        if (!feat) return;
        const fid = feat.id ?? (feat.properties?.id as string | undefined);
        if (fid == null || fid === lastHoverId) return;
        if (lastHoverId != null) {
          map.setFeatureState({ source: SOURCE_ID, id: lastHoverId }, { hover: false });
        }
        lastHoverId = fid as string;
        map.setFeatureState({ source: SOURCE_ID, id: fid as string }, { hover: true });
        const cityId = feat.properties?.id as string | undefined;
        if (cityId) onHoverCity?.(cityId);
      });
      map.on('mouseleave', POINTS_LAYER, () => {
        if (lastHoverId != null) {
          map.setFeatureState({ source: SOURCE_ID, id: lastHoverId }, { hover: false });
          lastHoverId = null;
        }
        onHoverCity?.(null);
      });
    };

    if (map.isStyleLoaded()) apply();
    else map.once('load', apply);
    // resolvedTheme: re-wire sources/layers onto the recreated map after a theme flip.
  }, [cities, onSelectCity, onHoverCity, reducedMotion, resolvedTheme]);

  // Fit bounds when the filtered city set changes (debounced + de-duped).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const key = cities.map((c) => c.id).join(',');
    if (key === lastFitKeyRef.current) return;
    if (cities.length === 0) return;
    if (fitTimerRef.current) window.clearTimeout(fitTimerRef.current);
    fitTimerRef.current = window.setTimeout(() => {
      const b = boundsOf(cities);
      if (!b) return;
      if (!map.isStyleLoaded()) {
        map.once('load', () => map.fitBounds(b, { padding: 40, maxZoom: 6, duration: reducedMotion ? 0 : 600 }));
      } else {
        map.fitBounds(b, { padding: 40, maxZoom: 6, duration: reducedMotion ? 0 : 600 });
      }
      lastFitKeyRef.current = key;
    }, 200);
    return () => {
      if (fitTimerRef.current) {
        window.clearTimeout(fitTimerRef.current);
        fitTimerRef.current = null;
      }
    };
  }, [cities, reducedMotion, resolvedTheme]);

  // Sync external hover (list → map): set the new id, clear the previous
  // on cleanup. Wrapped in try/catch since the feature may not be in
  // the source yet on first render.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource(SOURCE_ID) || !hoveredCityId) return;
    try {
      map.setFeatureState({ source: SOURCE_ID, id: hoveredCityId }, { hover: true });
    } catch {
      /* feature not yet rendered */
    }
    return () => {
      try {
        map.setFeatureState({ source: SOURCE_ID, id: hoveredCityId }, { hover: false });
      } catch {
        /* swallow */
      }
    };
  }, [hoveredCityId]);

  // Highlight selected pin + fly to it.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource(SOURCE_ID)) return;
    if (!map.getLayer(POINTS_SELECTED_LAYER)) return;
    if (selectedCityId) {
      map.setFilter(POINTS_SELECTED_LAYER, ['==', ['get', 'slug'], selectedCityId] as unknown as maplibregl.FilterSpecification);
      const city = cities.find((c) => c.slug === selectedCityId || c.id === selectedCityId);
      if (city && city.latitude != null && city.longitude != null) {
        map.flyTo({
          center: [city.longitude, city.latitude],
          zoom: Math.max(map.getZoom(), 6),
          speed: reducedMotion ? 4 : 1.2,
        });
      }
    } else {
      map.setFilter(POINTS_SELECTED_LAYER, ['==', ['get', 'id'], ''] as unknown as maplibregl.FilterSpecification);
    }
  }, [selectedCityId, cities, reducedMotion]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: '100%', height }}
      role="region"
      aria-label="Cities map"
    />
  );
}
