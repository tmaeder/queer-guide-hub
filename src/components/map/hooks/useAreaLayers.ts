import { useEffect, useRef, type MutableRefObject } from 'react';
import maplibregl, { type GeoJSONSource, type MapLayerMouseEvent } from 'maplibre-gl';
import {
  type LayerType,
  type MapMarker,
  LAYER_COLORS,
} from '@/hooks/useExploreMapData';
import { AREA_LAYERS, AREA_RADIUS, AREA_STYLE } from '@/config/mapLayers';

interface UseAreaLayersParams {
  mapRef: MutableRefObject<maplibregl.Map | null>;
  mapReady: boolean;
  areaMarkers: MapMarker[];
  countryBoundaries: GeoJSON.FeatureCollection | undefined;
  onPopup: (map: maplibregl.Map, lngLat: maplibregl.LngLat, marker: MapMarker) => void;
}

/**
 * Area layer rendering (circles + labels for cities/countries/neighbourhoods,
 * with hover feature-state + click popups). Extracted verbatim from ExploreMap —
 * behavior-preserving. `areaLayerIdsRef` is touched only here so it's hook-owned.
 */
export function useAreaLayers({
  mapRef,
  mapReady,
  areaMarkers,
  countryBoundaries,
  onPopup,
}: UseAreaLayersParams) {
  const areaLayerIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    // Skip circles for types that have polygon boundaries
    const skipCircleTypes: string[] = [];
    if (countryBoundaries) skipCircleTypes.push('countries');
    const activeAreaLayers = AREA_LAYERS.filter((t) => !skipCircleTypes.includes(t));

    const onlyArea = areaMarkers.filter((m) => activeAreaLayers.includes(m.type));
    const grouped: Record<string, MapMarker[]> = {};
    for (const type of AREA_LAYERS) grouped[type] = onlyArea.filter((m) => m.type === type);

    const activeIds = new Set<string>();

    for (const type of AREA_LAYERS) {
      const items = grouped[type] ?? [];
      const sourceId = `area-source-${type}`;
      const circleLayerId = `area-circle-${type}`;
      const labelLayerId = `area-label-${type}`;

      if (items.length === 0) {
        if (map.getLayer(labelLayerId)) map.removeLayer(labelLayerId);
        if (map.getLayer(circleLayerId)) map.removeLayer(circleLayerId);
        if (map.getSource(sourceId)) map.removeSource(sourceId);
        areaLayerIdsRef.current.delete(sourceId);
        continue;
      }

      activeIds.add(sourceId);

      const geojson: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: items.map((m) => ({
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [m.lng, m.lat] },
          properties: {
            id: m.id,
            name: m.name,
            subtitle: m.subtitle ?? '',
            color: m.color,
            linkTo: m.linkTo ?? '',
            markerType: m.type,
            ...Object.fromEntries(
              Object.entries(m.meta ?? {}).map(([k, v]) => [
                `meta_${k}`,
                typeof v === 'object' ? JSON.stringify(v) : v,
              ]),
            ),
          },
        })),
      };

      const style = AREA_STYLE[type] ?? AREA_STYLE.cities;
      const radii = AREA_RADIUS[type] ?? AREA_RADIUS.cities;
      const color = LAYER_COLORS[type as LayerType] ?? '#888';

      const radiusExpr: unknown[] = ['interpolate', ['linear'], ['zoom']];
      for (const [z, r] of radii) radiusExpr.push(z, r);

      const existingSource = map.getSource(sourceId) as GeoJSONSource | undefined;
      if (existingSource) {
        existingSource.setData(geojson);
      } else {
        map.addSource(sourceId, { type: 'geojson', data: geojson, promoteId: 'id' });

        map.addLayer({
          id: circleLayerId,
          type: 'circle',
          source: sourceId,
          paint: {
            'circle-radius': radiusExpr as maplibregl.ExpressionSpecification,
            'circle-color': color,
            'circle-opacity': [
              'case',
              ['boolean', ['feature-state', 'hovered'], false],
              style.opacityHover,
              style.opacity,
            ],
            'circle-stroke-color': color,
            'circle-stroke-width': 1.25,
            'circle-stroke-opacity': style.strokeOpacity,
            'circle-opacity-transition': { duration: 200 },
          },
        });

        map.addLayer({
          id: labelLayerId,
          type: 'symbol',
          source: sourceId,
          minzoom: style.minLabelZoom,
          layout: {
            'text-field': ['get', 'name'],
            'text-size': ['interpolate', ['linear'], ['zoom'], 2, 10, 6, 12, 10, 14],
            'text-font': ['Noto Sans Medium'],
            'text-allow-overlap': false,
            'text-ignore-placement': false,
            'text-anchor': 'center',
          },
          paint: {
            'text-color': '#18181b',
            'text-halo-color': '#ffffff',
            'text-halo-width': 1.25,
            'text-opacity': [
              'interpolate',
              ['linear'],
              ['zoom'],
              style.minLabelZoom,
              0,
              style.minLabelZoom + 0.5,
              1,
            ],
          },
        });

        // Hover feature-state deepens the fill (mirrors the boundary-polygon
        // hover). `promoteId: 'id'` above makes feat.id === properties.id.
        let hoveredAreaId: string | number | null = null;
        map.on('mousemove', circleLayerId, (e: MapLayerMouseEvent) => {
          map.getCanvas().style.cursor = 'pointer';
          const id = e.features?.[0]?.id as string | number | undefined;
          if (id == null || id === hoveredAreaId) return;
          if (hoveredAreaId != null) {
            map.setFeatureState({ source: sourceId, id: hoveredAreaId }, { hovered: false });
          }
          map.setFeatureState({ source: sourceId, id }, { hovered: true });
          hoveredAreaId = id;
        });
        map.on('mouseleave', circleLayerId, () => {
          map.getCanvas().style.cursor = '';
          if (hoveredAreaId != null) {
            map.setFeatureState({ source: sourceId, id: hoveredAreaId }, { hovered: false });
            hoveredAreaId = null;
          }
        });
        map.on('click', circleLayerId, (e: MapLayerMouseEvent) => {
          const feat = e.features?.[0];
          if (!feat || feat.geometry.type !== 'Point') return;
          const props = feat.properties as Record<string, unknown>;
          const meta: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(props)) {
            if (k.startsWith('meta_')) {
              try {
                meta[k.slice(5)] = JSON.parse(v);
              } catch {
                meta[k.slice(5)] = v;
              }
            }
          }
          onPopup(map, e.lngLat, {
            id: props.id,
            type: props.markerType as LayerType,
            lat: (feat.geometry as GeoJSON.Point).coordinates[1],
            lng: (feat.geometry as GeoJSON.Point).coordinates[0],
            name: props.name,
            subtitle: props.subtitle || undefined,
            color: props.color,
            linkTo: props.linkTo || undefined,
            meta,
          });
        });

        areaLayerIdsRef.current.add(sourceId);
      }
    }

    // Clean up stale area layers
    for (const oldId of [...areaLayerIdsRef.current]) {
      if (!activeIds.has(oldId)) {
        const t = oldId.replace('area-source-', '');
        if (map.getLayer(`area-label-${t}`)) map.removeLayer(`area-label-${t}`);
        if (map.getLayer(`area-circle-${t}`)) map.removeLayer(`area-circle-${t}`);
        if (map.getSource(oldId)) map.removeSource(oldId);
        areaLayerIdsRef.current.delete(oldId);
      }
    }
  }, [areaMarkers, mapReady, onPopup, countryBoundaries, mapRef]);
}
