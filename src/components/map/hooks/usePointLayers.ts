import { useEffect, useRef, type MutableRefObject } from 'react';
import maplibregl, { type GeoJSONSource, type MapLayerMouseEvent } from 'maplibre-gl';
import { summaryFromFeature, type MapPointSummary } from '@/components/map/mapPoint';
import type { PointFeature } from '@/hooks/useViewportPoints';
import type { LayerType } from '@/hooks/useExploreMapData';
import {
  POINTS_SOURCE,
  CLUSTERS_LAYER,
  CLUSTER_COUNT_LAYER,
  UNCLUSTERED_LAYER,
  GLYPH_LAYER,
  FEATURED_RING_LAYER,
  PULSE_LAYER,
  PIN_LAYER_IDS,
} from '@/config/mapLayers';
import { CLUSTER_MAX_ZOOM, CLUSTER_RADIUS } from '@/utils/mapViewport';
import { EMPTY_FAV, mapDebug } from '@/components/map/mapDebug';

interface UsePointLayersParams {
  mapRef: MutableRefObject<maplibregl.Map | null>;
  mapReady: boolean;
  pointsGeoJSON: GeoJSON.FeatureCollection;
  pointEnabledLayers: LayerType[];
  prefersReducedMotion: boolean;
  pinOpacityExpr: maplibregl.ExpressionSpecification | number;
  favoriteIds?: Set<string>;
  savedOnly: boolean;
  showPopup: (
    map: maplibregl.Map,
    lngLat: maplibregl.LngLat | [number, number],
    point: MapPointSummary,
  ) => void;
  startPulse: () => void;
  spiderfy: (map: maplibregl.Map, center: [number, number], leaves: PointFeature[]) => void;
  clearSpider: () => void;
  onSelectPointRef: MutableRefObject<((id: string) => void) | undefined>;
  pointLayersAddedRef: MutableRefObject<boolean>;
  pulseRafRef: MutableRefObject<number | null>;
}

/**
 * Native MapLibre clustered-point rendering: source + cluster/count/pulse/
 * featured/unclustered/glyph layers, cluster click→zoom-or-spiderfy, and the
 * hover/click handlers (rich popup on click, lightweight preview on hover).
 * Extracted verbatim from ExploreMap — behavior-preserving. `hoverPopupRef` is
 * single-consumer so it's hook-owned; the coordination refs stay component-owned
 * (the init teardown + sibling hooks also touch them). MUST stay declared BEFORE
 * useHeatmapLayer (load-bearing `beforeId` z-order).
 */
export function usePointLayers({
  mapRef,
  mapReady,
  pointsGeoJSON,
  pointEnabledLayers,
  prefersReducedMotion,
  pinOpacityExpr,
  favoriteIds,
  savedOnly,
  showPopup,
  startPulse,
  spiderfy,
  clearSpider,
  onSelectPointRef,
  pointLayersAddedRef,
  pulseRafRef,
}: UsePointLayersParams) {
  const hoverPopupRef = useRef<maplibregl.Popup | null>(null);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (pointEnabledLayers.length === 0) {
      if (pulseRafRef.current) {
        cancelAnimationFrame(pulseRafRef.current);
        pulseRafRef.current = null;
      }
      clearSpider();
      for (const id of PIN_LAYER_IDS) {
        if (map.getLayer(id)) map.removeLayer(id);
      }
      if (map.getSource(POINTS_SOURCE)) map.removeSource(POINTS_SOURCE);
      pointLayersAddedRef.current = false;
      return;
    }

    // Tag each feature with `favorited` (saved layer) and, when savedOnly is on,
    // keep only saved points. Clone properties so the hook's cached features
    // aren't mutated across map instances.
    const favSet = favoriteIds ?? EMPTY_FAV;
    const baseFeatures = pointsGeoJSON.features.filter((f) =>
      pointEnabledLayers.includes(f.properties.pointType),
    );
    const filteredGeoJSON: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: (savedOnly
        ? baseFeatures.filter((f) => favSet.has(String(f.properties.id)))
        : baseFeatures
      ).map((f) => ({
        ...f,
        properties: { ...f.properties, favorited: favSet.has(String(f.properties.id)) },
      })),
    };

    const existingSource = map.getSource(POINTS_SOURCE) as GeoJSONSource | undefined;
    if (existingSource) {
      mapDebug('setData', { features: filteredGeoJSON.features.length });
      existingSource.setData(filteredGeoJSON);
      return;
    }

    // Defer source + layer creation until we actually have features.
    // Adding a clustered source with `data: []` and then calling
    // `setData()` after the map's initial flyTo settle has been observed
    // to leave the cluster index empty — markers never appear even
    // though the data arrived. Waiting for non-empty data fixes that.
    if (filteredGeoJSON.features.length === 0) {
      mapDebug('skip-empty-source-create');
      return;
    }

    mapDebug('addSource', { features: filteredGeoJSON.features.length });
    map.addSource(POINTS_SOURCE, {
      type: 'geojson',
      data: filteredGeoJSON,
      cluster: true,
      clusterMaxZoom: CLUSTER_MAX_ZOOM,
      clusterRadius: CLUSTER_RADIUS,
      clusterProperties: {
        venue_count: ['+', ['case', ['==', ['get', 'pointType'], 'venues'], 1, 0]],
        event_count: ['+', ['case', ['==', ['get', 'pointType'], 'events'], 1, 0]],
        restroom_count: ['+', ['case', ['==', ['get', 'pointType'], 'restrooms'], 1, 0]],
      },
    });

    map.addLayer({
      id: CLUSTERS_LAYER,
      type: 'circle',
      source: POINTS_SOURCE,
      filter: ['has', 'point_count'],
      paint: {
        'circle-radius': ['step', ['get', 'point_count'], 16, 10, 20, 50, 26, 100, 32, 500, 40],
        // Monochrome cluster ramp. Density encoded by alpha on the
        // foreground token, not by hue — matches the heatmap ramp and
        // the rest of the design system's no-color rule.
        'circle-color': 'hsl(0 0% 4%)',
        'circle-opacity': [
          'step',
          ['get', 'point_count'],
          0.55,
          10,
          0.65,
          50,
          0.75,
          100,
          0.85,
          500,
          0.95,
        ],
        'circle-stroke-width': 2,
        'circle-stroke-color': 'hsl(0 0% 100%)',
      },
    });

    map.addLayer({
      id: CLUSTER_COUNT_LAYER,
      type: 'symbol',
      source: POINTS_SOURCE,
      filter: ['has', 'point_count'],
      layout: {
        'text-field': ['get', 'point_count_abbreviated'],
        'text-font': ['Noto Sans Medium'],
        'text-size': 13,
        'text-allow-overlap': true,
      },
      paint: { 'text-color': '#ffffff' },
    });

    // Live pulse — an expanding ring beneath live/open-now pins. Static at
    // first; the rAF loop below animates radius+opacity when motion is allowed.
    map.addLayer({
      id: PULSE_LAYER,
      type: 'circle',
      source: POINTS_SOURCE,
      filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'live'], true]],
      paint: {
        'circle-radius': 10,
        'circle-color': ['get', 'color'],
        'circle-opacity': 0.25,
        'circle-stroke-width': 0,
      },
    });

    // Featured outer ring — makes editorially-chosen spots read first.
    map.addLayer({
      id: FEATURED_RING_LAYER,
      type: 'circle',
      source: POINTS_SOURCE,
      filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'featured'], true]],
      paint: {
        'circle-radius': 12,
        'circle-color': 'rgba(0,0,0,0)',
        'circle-stroke-width': 2,
        'circle-stroke-color': ['get', 'color'],
        'circle-stroke-opacity': 0.9,
      },
    });

    map.addLayer({
      id: UNCLUSTERED_LAYER,
      type: 'circle',
      source: POINTS_SOURCE,
      filter: ['!', ['has', 'point_count']],
      paint: {
        // Larger dots host the category glyph; featured sit a touch larger.
        'circle-radius': ['case', ['==', ['get', 'featured'], true], 11, 9],
        'circle-color': ['get', 'color'],
        // Thicker white halo so pins separate cleanly from the colored
        // basemap and the (now softened) density heat beneath them.
        'circle-stroke-width': 2.5,
        'circle-stroke-color': '#ffffff',
        // Steady-state opacity = time-of-day expression (dims closed at night).
        'circle-opacity': pinOpacityExpr,
        // Entrance fade — opacity transitions in on first paint / data swap.
        'circle-opacity-transition': { duration: 350, delay: 0 },
      },
    });

    // Category glyph on top of the dot. Falls back to the venue glyph, then to
    // nothing (colored circle still shows) if an image failed to rasterize.
    map.addLayer({
      id: GLYPH_LAYER,
      type: 'symbol',
      source: POINTS_SOURCE,
      filter: ['!', ['has', 'point_count']],
      layout: {
        'icon-image': ['coalesce', ['image', ['get', 'iconKey']], ['image', 'type:venues']],
        'icon-size': ['case', ['==', ['get', 'featured'], true], 0.5, 0.42],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
    });

    // Cluster click → zoom to expand, OR spiderfy when zooming won't separate
    // the points (they share ~identical coordinates).
    map.on('click', CLUSTERS_LAYER, async (e) => {
      const feat = e.features?.[0];
      if (!feat) return;
      clearSpider();
      const clusterId = feat.properties.cluster_id;
      const center = (feat.geometry as GeoJSON.Point).coordinates as [number, number];
      const src = map.getSource(POINTS_SOURCE) as GeoJSONSource;
      try {
        const zoom = await src.getClusterExpansionZoom(clusterId);
        // If the breakpoint zoom is barely beyond where we are, zooming won't
        // visually separate the pins — fan them out instead.
        if (zoom - map.getZoom() <= 0.5 || zoom >= 18) {
          const leaves = (await src.getClusterLeaves(clusterId, 24, 0)) as PointFeature[];
          spiderfy(map, center, leaves);
        } else {
          map.flyTo({ center, zoom: zoom + 0.5, speed: 1.5 });
        }
      } catch {
        map.flyTo({ center, zoom: map.getZoom() + 2, speed: 1.5 });
      }
    });

    // Unclustered point click → rich popup card
    map.on('click', UNCLUSTERED_LAYER, (e: MapLayerMouseEvent) => {
      const feat = e.features?.[0];
      if (!feat || feat.geometry.type !== 'Point') return;
      const summary = summaryFromFeature(feat as unknown as PointFeature);
      showPopup(map, e.lngLat, summary);
      onSelectPointRef.current?.(summary.id);
    });

    map.on('mouseenter', CLUSTERS_LAYER, () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', CLUSTERS_LAYER, () => {
      map.getCanvas().style.cursor = '';
      hoverPopupRef.current?.remove();
      hoverPopupRef.current = null;
    });

    // Cluster preview — break the aggregate down by type from clusterProperties
    // so a dense blob reads as "12 venues · 3 events" instead of just a number.
    map.on('mousemove', CLUSTERS_LAYER, (e: MapLayerMouseEvent) => {
      const feat = e.features?.[0];
      if (!feat) return;
      const p = feat.properties as Record<string, number>;
      const parts: string[] = [];
      const add = (n: number, one: string, many: string) => {
        if (n > 0) parts.push(`${n} ${n === 1 ? one : many}`);
      };
      add(Number(p.venue_count) || 0, 'venue', 'venues');
      add(Number(p.event_count) || 0, 'event', 'events');
      add(Number(p.restroom_count) || 0, 'restroom', 'restrooms');
      const total = Number(p.point_count) || 0;
      const label = parts.length ? parts.join(' · ') : `${total} places`;
      const html = `<div style="font:13px system-ui;padding:2px 4px"><div style="font-weight:600">${label}</div><div style="color:rgba(0,0,0,.6);font-size:11px;margin-top:2px">Click to zoom in</div></div>`;
      if (!hoverPopupRef.current) {
        hoverPopupRef.current = new maplibregl.Popup({
          closeButton: false,
          closeOnClick: false,
          offset: 12,
          maxWidth: '220px',
          className: 'venue-hover-popup',
        });
      }
      hoverPopupRef.current.setLngLat(e.lngLat).setHTML(html).addTo(map);
    });
    map.on('mouseenter', UNCLUSTERED_LAYER, () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', UNCLUSTERED_LAYER, () => {
      map.getCanvas().style.cursor = '';
      hoverPopupRef.current?.remove();
      hoverPopupRef.current = null;
    });

    // Lightweight hover preview: name + subtitle, no close button, no action
    // buttons. Click still opens the full popup with share/navigate.
    map.on('mousemove', UNCLUSTERED_LAYER, (e: MapLayerMouseEvent) => {
      const feat = e.features?.[0];
      if (!feat || feat.geometry.type !== 'Point') return;
      const props = feat.properties as Record<string, unknown>;
      const name = String(props.name ?? '');
      const subtitle = props.subtitle ? String(props.subtitle) : '';
      const safeName = name.replace(
        /[&<>"]/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c,
      );
      const safeSub = subtitle.replace(
        /[&<>"]/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c,
      );
      let imageUrl = '';
      try {
        const meta = JSON.parse(String(props.meta ?? '{}'));
        // Prefer the reachable R2-mirrored copy over the raw external hotlink.
        const best = [meta.thumbImage, meta.optimizedImage, meta.image].find(
          (u) => typeof u === 'string' && /^https?:\/\//.test(u),
        );
        if (best) imageUrl = encodeURI(best as string);
      } catch {
        /* ignore */
      }
      // referrerpolicy=no-referrer dodges publisher-CDN hotlink walls; onerror
      // removes the node so a dead URL collapses cleanly (no broken-image glyph).
      const thumb = imageUrl
        ? `<img src="${imageUrl}" alt="" referrerpolicy="no-referrer" onerror="this.remove()" style="width:36px;height:36px;border-radius:8px;object-fit:cover;flex:0 0 auto"/>`
        : '';
      const html = `<div style="display:flex;gap:8px;align-items:center;font:13px system-ui;line-height:1.3;padding:2px 4px;max-width:220px">${thumb}<div style="min-width:0"><div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${safeName}</div>${
        safeSub
          ? `<div style="color:rgba(0,0,0,.6);font-size:11px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${safeSub}</div>`
          : ''
      }</div></div>`;
      if (!hoverPopupRef.current) {
        hoverPopupRef.current = new maplibregl.Popup({
          closeButton: false,
          closeOnClick: false,
          offset: 12,
          maxWidth: '220px',
          className: 'venue-hover-popup',
        });
      }
      hoverPopupRef.current.setLngLat(e.lngLat).setHTML(html).addTo(map);
    });

    // Entrance fade — pins ease in on first paint (skipped for reduced motion),
    // settling on the time-of-day opacity expression.
    if (!prefersReducedMotion && map.getLayer(UNCLUSTERED_LAYER)) {
      map.setPaintProperty(UNCLUSTERED_LAYER, 'circle-opacity', 0);
      requestAnimationFrame(() => {
        const m = mapRef.current;
        if (m?.getLayer(UNCLUSTERED_LAYER))
          m.setPaintProperty(UNCLUSTERED_LAYER, 'circle-opacity', pinOpacityExpr);
      });
    }

    startPulse();
    pointLayersAddedRef.current = true;
  }, [
    pointsGeoJSON,
    pointEnabledLayers,
    mapReady,
    showPopup,
    startPulse,
    prefersReducedMotion,
    pinOpacityExpr,
    favoriteIds,
    savedOnly,
    spiderfy,
    clearSpider,
    mapRef,
    onSelectPointRef,
    pointLayersAddedRef,
    pulseRafRef,
  ]);
}
