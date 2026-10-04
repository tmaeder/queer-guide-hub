import { useEffect, useRef, type MutableRefObject } from 'react';
import * as maplibregl from 'maplibre-gl';
import { type GeoJSONSource, type MapLayerMouseEvent } from 'maplibre-gl';
import { summaryFromFeature, type MapPointSummary } from '@/components/map/mapPoint';
import type { PointFeature, PointFeatureProps } from '@/hooks/useViewportPoints';
import { MAP_LINES, MAP_LINE_IDS, type MapLine } from '@/components/map/mapDomain';
import {
  POINTS_SOURCE,
  CLUSTERS_LAYER,
  CLUSTER_COUNT_LAYER,
  UNCLUSTERED_LAYER,
  GLYPH_LAYER,
  STATE_BADGE_LAYER,
  FEATURED_RING_LAYER,
  PULSE_LAYER,
  PIN_LAYER_IDS,
} from '@/config/mapLayers';
import { CLUSTER_MAX_ZOOM, CLUSTER_RADIUS } from '@/utils/mapViewport';
import { EMPTY_FAV, mapDebug } from '@/components/map/mapDebug';
import { durationMs, imperativeDurationMs } from '@/lib/animation';
import { donutIconExpression } from '@/components/map/clusterDonut';
import { ink, paper } from '@/lib/mapTokens';
import { MAP_FONT_BOLD } from '@/config/mapStyle';
import { clusterHoverHtml, pointHoverHtml } from '@/components/map/mapHoverHtml';

interface UsePointLayersParams {
  mapRef: MutableRefObject<maplibregl.Map | null>;
  mapReady: boolean;
  /** Narrowed to the collection `useViewportPoints` actually returns. The old
   *  loose `GeoJSON.FeatureCollection` made `properties` nullable, so every
   *  read of it needed a non-null assertion or carried a TS18047. */
  pointsGeoJSON: GeoJSON.FeatureCollection<GeoJSON.Point, PointFeatureProps>;
  /** Lines currently drawn. Replaces `pointEnabledLayers` — the render filter
   *  is now line-keyed, so toggling a line narrows what is drawn without
   *  changing the fetch set (M, C and T all need `venues`). */
  activeLines: MapLine[];
  prefersReducedMotion: boolean;
  pinOpacityExpr: maplibregl.ExpressionSpecification | number;
  favoriteIds?: Set<string>;
  /** The viewer's own place marks. Never another person's. */
  visitedIds?: Set<string>;
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
  activeLines,
  prefersReducedMotion,
  pinOpacityExpr,
  favoriteIds,
  visitedIds,
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

    // Teardown keys off the active LINES, not the fetch list. That decoupling
    // is load-bearing: an explicit (non-viewport) data source leaves the fetch
    // list empty by design, and keying teardown off it would dismantle the
    // renderer for a surface that has stations to draw.
    if (activeLines.length === 0) {
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
    const visitedSet = visitedIds ?? EMPTY_FAV;
    const baseFeatures = pointsGeoJSON.features.filter((f) =>
      activeLines.includes(f.properties.line as MapLine),
    );
    const filteredGeoJSON: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: (savedOnly
        ? baseFeatures.filter((f) => favSet.has(String(f.properties.id)))
        : baseFeatures
      ).map((f) => ({
        ...f,
        properties: {
          ...f.properties,
          favorited: favSet.has(String(f.properties.id)),
          // Numeric, not boolean: a MapLibre `case` on a boolean property
          // round-trips fine, but the badge layer's icon expression reads this
          // alongside `favorited` and 0/1 keeps both arms the same shape.
          visited: visitedSet.has(String(f.properties.id)) ? 1 : 0,
        },
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
      // Aggregated by LINE, generated from the registry. These names were
      // previously spelled out here, again in `clusterDonut`, and a third time
      // in the cluster hover handler below — three literal lists that had to
      // agree or a donut segment silently vanished.
      //
      // Note these are fixed at SOURCE-CREATION time. `line` is a static
      // per-feature property, so that is fine — but it does mean a
      // reclassification needs a source rebuild, not a `setData`. `lineFor`
      // must therefore never depend on runtime state.
      clusterProperties: Object.fromEntries(
        MAP_LINE_IDS.map((line) => [
          MAP_LINES[line].countProp,
          ['+', ['case', ['==', ['get', 'line'], line], 1, 0]],
        ]),
      ),
    });

    // Segmented donut clusters — ring segments proportional to the cluster's
    // composition (what's inside, not just how much). Same layer id as the
    // old circle layer, so PIN_LAYER_IDS, the heatmap beforeId, and every
    // click/hover handler keep working. Icons come from the map's
    // missing-image resolver (registered in useMapInstance).
    map.addLayer({
      id: CLUSTERS_LAYER,
      type: 'symbol',
      source: POINTS_SOURCE,
      filter: ['has', 'point_count'],
      layout: {
        'icon-image': donutIconExpression(),
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
    });

    map.addLayer({
      id: CLUSTER_COUNT_LAYER,
      type: 'symbol',
      source: POINTS_SOURCE,
      filter: ['has', 'point_count'],
      layout: {
        'text-field': ['get', 'point_count_abbreviated'],
        'text-font': [MAP_FONT_BOLD],
        'text-size': 13,
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      // Ink on the interchange symbol's paper centre disc.
      paint: { 'text-color': ink() },
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

    // Featured ring — the INTERCHANGE treatment. A second concentric ink
    // ring outside the station's own ink border, the way a transit map marks
    // an interchange apart from an ordinary stop. It used to be a single
    // ring in the pin's own colour, which read as a slightly fatter pin
    // rather than a different class of thing.
    map.addLayer({
      id: FEATURED_RING_LAYER,
      type: 'circle',
      source: POINTS_SOURCE,
      filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'featured'], true]],
      paint: {
        'circle-radius': 14,
        'circle-color': paper(),
        'circle-stroke-width': 2,
        'circle-stroke-color': ink(),
        'circle-stroke-opacity': 1,
      },
    });

    map.addLayer({
      id: UNCLUSTERED_LAYER,
      type: 'circle',
      source: POINTS_SOURCE,
      filter: ['!', ['has', 'point_count']],
      paint: {
        // Larger dots host the category glyph; featured sit a touch larger.
        // Radius grows slightly with zoom so pins don't feel undersized right
        // after a cluster expands into the (larger) donuts.
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          11,
          ['case', ['==', ['get', 'featured'], true], 11, 9],
          16,
          ['case', ['==', ['get', 'featured'], true], 13, 11],
        ],
        'circle-color': ['get', 'color'],
        // The ink border, not a halo. Blue/green/yellow measure 2.25 / 1.64
        // / 1.34 against paper and only clear WCAG 1.4.11's 3:1 against ink,
        // so a track-coloured mark is border-GATED — this stroke is what
        // makes the fill legal, not just tidy. (Was a 2.5px white halo,
        // which separated the pin from the basemap but left the fill itself
        // unmeasurable against anything.)
        'circle-stroke-width': 2,
        'circle-stroke-color': ink(),
        // Steady-state opacity = time-of-day expression (dims closed at night).
        'circle-opacity': pinOpacityExpr,
        // Entrance fade — opacity transitions in on first paint / data swap.
        'circle-opacity-transition': {
          duration: imperativeDurationMs(durationMs.normal),
          delay: 0,
        },
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

    // Saved badge, offset to the pin's upper-right.
    //
    // `favorited` has been carried on the feature since the saved layer
    // shipped and NOTHING painted it — `savedOnly` filtered the collection
    // but a saved pin was indistinguishable from any other.
    //
    // A glyph, not a colour: the four tracks are spoken for by the lines, and
    // WCAG 1.4.1 forbids encoding a state in hue alone. The `LineKey` legend
    // carries the matching label.
    //
    // Saved only — see `STATE_BADGE_ICONS` for why `visited` is carried on the
    // feature but not painted here.
    map.addLayer({
      id: STATE_BADGE_LAYER,
      type: 'symbol',
      source: POINTS_SOURCE,
      filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'favorited'], true]],
      layout: {
        'icon-image': 'state:saved',
        'icon-size': 0.26,
        // Up and to the right of the dot, in icon-size units.
        'icon-offset': [26, -26],
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
      const html = clusterHoverHtml({
        ...Object.fromEntries(
          MAP_LINE_IDS.map((line) => [line, Number(p[MAP_LINES[line].countProp]) || 0]),
        ),
        total: Number(p.point_count) || 0,
      });
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
      let imageUrl = '';
      try {
        const meta = JSON.parse(String(props.meta ?? '{}'));
        // Prefer the reachable R2-mirrored copy over the raw external hotlink.
        const best = [meta.thumbImage, meta.optimizedImage, meta.image].find(
          (u) => typeof u === 'string' && /^https?:\/\//.test(u),
        );
        if (best) imageUrl = best as string;
      } catch {
        /* ignore */
      }
      const html = pointHoverHtml({ name, subtitle, imageUrl: imageUrl || undefined });
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
    activeLines,
    mapReady,
    showPopup,
    startPulse,
    prefersReducedMotion,
    pinOpacityExpr,
    favoriteIds,
    visitedIds,
    savedOnly,
    spiderfy,
    clearSpider,
    mapRef,
    onSelectPointRef,
    pointLayersAddedRef,
    pulseRafRef,
  ]);
}
