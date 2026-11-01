import { useEffect, useRef, type MutableRefObject } from 'react';
import * as maplibregl from 'maplibre-gl';
import { type GeoJSONSource, type MapLayerMouseEvent } from 'maplibre-gl';
import {
  summaryFromFeature,
  type MapPointStack,
  type MapPointSummary,
} from '@/components/map/mapPoint';
import type { PointFeature, PointFeatureProps } from '@/hooks/useViewportPoints';
import { MAP_LINES, MAP_LINE_IDS, type MapLine } from '@/components/map/mapDomain';
import {
  POINTS_SOURCE,
  CLUSTERS_LAYER,
  CLUSTER_COUNT_LAYER,
  UNCLUSTERED_LAYER,
  PIN_DOT_LAYER,
  CLOUD_LAYER,
  GLYPH_LAYER,
  STATE_BADGE_LAYER,
  STACK_BADGE_LAYER,
  FEATURED_RING_LAYER,
  PULSE_LAYER,
  PIN_LAYER_IDS,
} from '@/config/mapLayers';
import { CLUSTER_MAX_ZOOM, CLUSTER_RADIUS, POINTS_SOURCE_MAX_ZOOM } from '@/utils/mapViewport';
import {
  decideClusterAction,
  shouldListStack,
  SPIDER_MAX,
  type LngLat,
} from '@/components/map/clusterClick';
import { EMPTY_FAV, mapDebug } from '@/components/map/mapDebug';
import { durationMs, imperativeDurationMs } from '@/lib/animation';
import {
  donutIconExpression,
  dominantLineExpression,
  placesExpr,
} from '@/components/map/clusterDonut';
import { collapseColocated } from '@/components/map/pointStacks';
import { declutterPins, pinPriority, pinRadiusAt } from '@/components/map/pinDeclutter';
import { ink, paper } from '@/lib/mapTokens';
import { MAP_FONT_BOLD } from '@/config/mapStyle';
import { clusterHoverHtml, pointHoverHtml } from '@/components/map/mapHoverHtml';

/** Room left around a cluster's contents when zooming to them, so edge pins
 *  are not under the map chrome. */
const CLUSTER_FIT_PADDING = 80;
/** Deepest zoom a cluster click will fly to. Street level; past this the
 *  basemap (z15 tiles) is overzoomed and nothing more becomes legible, so a
 *  cluster still unsplit here is fanned out instead. */
const CLUSTER_FIT_MAX_ZOOM = 18;

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
  /** Pin fill: the line colour, or an opaque night fade of it. Never an
   *  opacity — pins overlap, and a translucent one shows the stack beneath. */
  pinColorExpr: maplibregl.ExpressionSpecification;
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
  /** Set when the surface has a results list. A co-located stack too large
   *  for a readable ring is handed here instead of fanned out. */
  onStackSelectRef?: MutableRefObject<((stack: MapPointStack) => void) | undefined>;
  pointLayersAddedRef: MutableRefObject<boolean>;
  pulseRafRef: MutableRefObject<number | null>;
}

/** Cloud radius by zoom, exponential so it grows like an area on the map
 *  (~25 m across at z13, ~200 m at z16) rather than like a marker. */
const CLOUD_RADIUS_EXPR: maplibregl.ExpressionSpecification = [
  'interpolate',
  ['exponential', 2],
  ['zoom'],
  11,
  10,
  13,
  20,
  16,
  80,
];

/** Cloud radius at a zoom, mirroring CLOUD_RADIUS_EXPR, for hit-testing. */
function cloudRadiusAt(zoom: number): number {
  const stops: [number, number][] = [
    [11, 10],
    [13, 20],
    [16, 80],
  ];
  if (zoom <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    const [z0, r0] = stops[i - 1];
    const [z1, r1] = stops[i];
    if (zoom <= z1) {
      const t = (Math.pow(2, zoom - z0) - 1) / (Math.pow(2, z1 - z0) - 1);
      return r0 + (r1 - r0) * t;
    }
  }
  return stops[stops.length - 1][1];
}

/** A venue in the `cruising` category, drawn as a cloud (CLOUD_LAYER). */
export function isCloudFeature(f: PointFeature): boolean {
  return f.properties.pointType === 'venues' && f.properties.subtitle === 'cruising';
}

/** Drawn radius of a dot (PIN_DOT_LAYER) plus its outline, in px. */
const DOT_HIT_RADIUS = 6.5;

/**
 * The point whose DRAWN mark is under the pointer.
 *
 * MapLibre's hit-test evaluates `circle-radius` without feature-state, so it
 * treats every compact dot as a full-size pin: a click on a full pin also
 * "hits" the dots tucked underneath it, in arbitrary order, and
 * `e.features[0]` was often one of them (a stacked pin then opened some other
 * place's popup). Re-test each candidate against what is actually drawn:
 * full pins before dots, nearest centre first.
 */
function pickPointUnder(
  map: maplibregl.Map,
  e: MapLayerMouseEvent,
): maplibregl.MapGeoJSONFeature | undefined {
  let best: { f: maplibregl.MapGeoJSONFeature; full: boolean; d: number } | undefined;
  for (const f of e.features ?? []) {
    if (f.geometry.type !== 'Point') continue;
    const compact =
      map.getFeatureState({ source: POINTS_SOURCE, id: f.properties?.id }).compact === true;
    const q = map.project((f.geometry as GeoJSON.Point).coordinates as [number, number]);
    const d = Math.hypot(q.x - e.point.x, q.y - e.point.y);
    const r =
      f.properties?.cloud === 1
        ? cloudRadiusAt(map.getZoom()) * 0.7
        : compact
          ? DOT_HIT_RADIUS
          : pinRadiusAt(map.getZoom(), f.properties?.featured === true);
    if (d > r) continue;
    const full = !compact && f.properties?.cloud !== 1;
    if (!best || (full && !best.full) || (full === best.full && d < best.d)) best = { f, full, d };
  }
  return best?.f ?? e.features?.[0];
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
  pinColorExpr,
  favoriteIds,
  visitedIds,
  savedOnly,
  showPopup,
  startPulse,
  spiderfy,
  clearSpider,
  onSelectPointRef,
  onStackSelectRef,
  pointLayersAddedRef,
  pulseRafRef,
}: UsePointLayersParams) {
  const hoverPopupRef = useRef<maplibregl.Popup | null>(null);
  // Every place behind a stacked pin, keyed by the representative's id.
  const stackMembersRef = useRef<Map<string, PointFeature[]>>(new Map());
  // The features currently on the source, for the declutter pass.
  const placedFeaturesRef = useRef<PointFeature[]>([]);
  // Ids last set compact, so the next pass can clear the ones that freed up.
  const compactIdsRef = useRef<Set<string>>(new Set());
  const declutterRef = useRef<(() => void) | null>(null);

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
      if (declutterRef.current) map.off('moveend', declutterRef.current);
      declutterRef.current = null;
      compactIdsRef.current = new Set();
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

    // One feature per spot: places sharing an exact coordinate become one pin
    // carrying `stack_count`, with the rest kept aside for the click.
    //
    // Cruising spots are drawn as clouds (CLOUD_LAYER), not pins, so they stay
    // out of stacking and out of the pin layout.
    const all = filteredGeoJSON.features as unknown as PointFeature[];
    const clouds = all
      .filter(isCloudFeature)
      .map((f) => ({ ...f, properties: { ...f.properties, cloud: 1 } }));
    const collapsed = collapseColocated(all.filter((f) => !isCloudFeature(f)));
    stackMembersRef.current = collapsed.members;
    placedFeaturesRef.current = collapsed.features;
    filteredGeoJSON.features = [...collapsed.features, ...clouds] as unknown as GeoJSON.Feature[];

    // Lay pins out after the source has re-tiled the new data.
    const declutterSoon = () => map.once('idle', () => declutterRef.current?.());

    const existingSource = map.getSource(POINTS_SOURCE) as GeoJSONSource | undefined;
    if (existingSource) {
      mapDebug('setData', { features: filteredGeoJSON.features.length });
      existingSource.setData(filteredGeoJSON);
      declutterSoon();
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
      // Feature ids from `id` so the declutter pass can set feature-state.
      promoteId: 'id',
      cluster: true,
      // The default geojson maxzoom is 18, which would cap clustering at 17
      // and let co-located places stack again above it.
      maxzoom: POINTS_SOURCE_MAX_ZOOM,
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
      //
      // Counted in PLACES: a stacked pin stands for `stack_count` places.
      clusterProperties: {
        places: ['+', ['coalesce', ['get', 'stack_count'], 1]],
        ...Object.fromEntries(
          MAP_LINE_IDS.map((line) => [
            MAP_LINES[line].countProp,
            [
              '+',
              ['case', ['==', ['get', 'line'], line], ['coalesce', ['get', 'stack_count'], 1], 0],
            ],
          ]),
        ),
      },
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
        'text-field': [
          'case',
          ['>=', placesExpr(), 1000],
          ['concat', ['to-string', ['round', ['/', placesExpr(), 1000]]], 'k'],
          ['to-string', placesExpr()],
        ],
        'text-font': [MAP_FONT_BOLD],
        'text-size': 13,
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      // Ink on a track-coloured disc, paper on the ink disc of a mixed one
      // (clusterDonut renders the disc from the same dominance rule).
      paint: { 'text-color': ['case', dominantLineExpression(), ink(), paper()] },
    });

    // Live pulse — an expanding ring beneath live/open-now pins. Static at
    // first; the rAF loop below animates radius+opacity when motion is allowed.
    map.addLayer({
      id: PULSE_LAYER,
      type: 'circle',
      source: POINTS_SOURCE,
      filter: [
        'all',
        ['!', ['has', 'point_count']],
        ['!=', ['get', 'cloud'], 1],
        ['==', ['get', 'live'], true],
      ],
      paint: {
        'circle-radius': 10,
        'circle-color': ['get', 'color'],
        'circle-opacity': 0.25,
        'circle-stroke-width': 0,
      },
    });

    // Cruising spots as a CLOUD, not a pin: a soft patch in the track colour
    // that grows with the map like an area, because a cruising spot is a
    // stretch of park, shore or woods rather than a door. Below every pin, no
    // glyph and no ink edge (it is an area wash, not a mark to read a colour
    // off), still clickable and hoverable for its name and card.
    map.addLayer({
      id: CLOUD_LAYER,
      type: 'circle',
      source: POINTS_SOURCE,
      filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'cloud'], 1]],
      paint: {
        'circle-radius': CLOUD_RADIUS_EXPR,
        'circle-color': pinColorExpr,
        'circle-opacity': 0.4,
        'circle-blur': 0.85,
        'circle-stroke-width': 0,
      },
    });

    // Dots for compact pins, under every full pin. Same colour and ink edge
    // as the pin; radius 0 for a full pin, which draws above.
    map.addLayer({
      id: PIN_DOT_LAYER,
      type: 'circle',
      source: POINTS_SOURCE,
      filter: ['all', ['!', ['has', 'point_count']], ['!=', ['get', 'cloud'], 1]],
      paint: {
        'circle-radius': ['case', ['boolean', ['feature-state', 'compact'], false], 5, 0],
        'circle-color': pinColorExpr,
        'circle-stroke-width': ['case', ['boolean', ['feature-state', 'compact'], false], 1.5, 0],
        'circle-stroke-color': ink(),
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
      filter: [
        'all',
        ['!', ['has', 'point_count']],
        ['!=', ['get', 'cloud'], 1],
        ['==', ['get', 'featured'], true],
      ],
      paint: {
        // Tracks the featured pin's own radius (15→17 over z11→z16, see
        // the unclustered layer) plus 3px. It was a flat 14, so by z16 the pin
        // plus its 1.5px stroke covered it and covered the paper gap
        // entirely: the two rings fused into one thick band and the
        // interchange read as a heavier stop. MapLibre draws a circle's
        // stroke OUTSIDE its radius, so the gap here is a constant 1.5px.
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 18, 16, 20],
        // A compact (dot) pin drops the ring with the rest of the full pin.
        'circle-opacity': ['case', ['boolean', ['feature-state', 'compact'], false], 0, 1],
        'circle-color': paper(),
        // 1.5px to match the pin outline; two concentric rings of equal
        // weight are what reads as an interchange.
        'circle-stroke-width': 1.5,
        'circle-stroke-color': ink(),
        'circle-stroke-opacity': ['case', ['boolean', ['feature-state', 'compact'], false], 0, 1],
      },
    });

    map.addLayer({
      id: UNCLUSTERED_LAYER,
      type: 'circle',
      source: POINTS_SOURCE,
      filter: ['all', ['!', ['has', 'point_count']], ['!=', ['get', 'cloud'], 1]],
      paint: {
        // Larger dots host the category glyph; featured sit a touch larger.
        // Radius grows slightly with zoom so pins don't feel undersized right
        // after a cluster expands into the (larger) donuts. Was 9→11 /
        // featured 11→13; now 13→15 / 15→17, so the category glyph inside reads at a
        // glance; the glyph size, featured ring and saved-badge offset below
        // are all scaled from these numbers and must move with them.
        //
        // A COMPACT pin (one that would overlap a higher-priority pin, see
        // pinDeclutter.ts) draws nothing here: PIN_DOT_LAYER, under every full
        // pin, draws it as a 5px dot that still marks and opens the place.
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          11,
          [
            'case',
            ['boolean', ['feature-state', 'compact'], false],
            0,
            ['==', ['get', 'featured'], true],
            15,
            13,
          ],
          16,
          [
            'case',
            ['boolean', ['feature-state', 'compact'], false],
            0,
            ['==', ['get', 'featured'], true],
            17,
            15,
          ],
        ],
        'circle-color': pinColorExpr,
        // The ink border, not a halo. Blue/green/yellow measure 2.25 / 1.64
        // / 1.34 against paper and only clear WCAG 1.4.11's 3:1 against ink,
        // so a track-coloured mark is border-GATED — this stroke is what
        // makes the fill legal, not just tidy. (Was a 2.5px white halo,
        // which separated the pin from the basemap but left the fill itself
        // unmeasurable against anything.)
        //
        // 1.5px, not 2: at 2px the ring read heavier than the glyph it
        // frames once the glyph grew to ~2/3 of the dot. 1.5px is still a
        // continuous ink edge at every DPR, which is all the contrast gate
        // needs — WCAG 1.4.11 measures colour against the boundary, not its
        // thickness.
        'circle-stroke-width': ['case', ['boolean', ['feature-state', 'compact'], false], 0, 1.5],
        'circle-stroke-color': ink(),
        // Fully opaque at rest: night dimming lives in `pinColorExpr` as an
        // opaque fade, so overlapping pins never show through each other.
        'circle-opacity': 1,
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
      filter: ['all', ['!', ['has', 'point_count']], ['!=', ['get', 'cloud'], 1]],
      layout: {
        'icon-image': ['coalesce', ['image', ['get', 'iconKey']], ['image', 'type:venues']],
        // Images are rasterized at 20 logical px (mapGlyphs.ts). This used to
        // be a flat 0.42/0.50, i.e. an ~8-10px glyph inside an 18-26px dot:
        // under half the pin, too small to tell a bar from a sauna. Now ~2/3
        // of the dot's diameter at every zoom, growing with the dot (radius
        // 13→15, featured 15→17, interpolated over the same zooms). Sizes
        // above 1 upscale the raster, which is why mapGlyphs.ts renders at 3×.
        // Scaled here rather than in the rasterizer because the saved badge
        // below reuses the same 20px images at its own 0.26.
        'icon-size': [
          'interpolate',
          ['linear'],
          ['zoom'],
          11,
          ['case', ['==', ['get', 'featured'], true], 1.0, 0.86],
          16,
          ['case', ['==', ['get', 'featured'], true], 1.1, 0.98],
        ],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
      paint: { 'icon-opacity': ['case', ['boolean', ['feature-state', 'compact'], false], 0, 1] },
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
      filter: [
        'all',
        ['!', ['has', 'point_count']],
        ['!=', ['get', 'cloud'], 1],
        ['==', ['get', 'favorited'], true],
      ],
      layout: {
        'icon-image': 'state:saved',
        'icon-size': 0.26,
        // Up and to the right of the dot, in icon-size units. Scaled with the
        // pin radius (was 26 at radius 11) so the badge stays on the rim.
        'icon-offset': [36, -36],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
      paint: { 'icon-opacity': ['case', ['boolean', ['feature-state', 'compact'], false], 0, 1] },
    });

    // "+N" on a pin that stands for several places on one exact spot, at the
    // pin's upper-left (the saved badge has the upper-right). Clicking the pin
    // fans the places out, or lists them past STACK_RING_MAX.
    map.addLayer({
      id: STACK_BADGE_LAYER,
      type: 'symbol',
      source: POINTS_SOURCE,
      filter: [
        'all',
        ['!', ['has', 'point_count']],
        ['>', ['coalesce', ['get', 'stack_count'], 1], 1],
      ],
      layout: {
        'text-field': ['concat', '+', ['to-string', ['-', ['get', 'stack_count'], 1]]],
        'text-font': [MAP_FONT_BOLD],
        'text-size': 11,
        'text-offset': [-1.4, -1.4],
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      paint: {
        'text-color': ink(),
        'text-halo-color': paper(),
        'text-halo-width': 2,
        'text-opacity': ['case', ['boolean', ['feature-state', 'compact'], false], 0, 1],
      },
    });

    // Cluster click → zoom to exactly what's inside, or fan out places that
    // share one spot. The decision is pure and tested in clusterClick.ts.
    map.on('click', CLUSTERS_LAYER, async (e) => {
      const feat = e.features?.[0];
      if (!feat) return;
      clearSpider();
      const clusterId = feat.properties.cluster_id;
      const count = Number(feat.properties.point_count) || 0;
      const center = (feat.geometry as GeoJSON.Point).coordinates as [number, number];
      const src = map.getSource(POINTS_SOURCE) as GeoJSONSource;
      try {
        const leaves = (await src.getClusterLeaves(clusterId, count, 0)) as PointFeature[];
        const coords = leaves.map((l) => (l.geometry as GeoJSON.Point).coordinates as LngLat);
        let fitZoom: number | null = null;
        if (coords.length > 1) {
          const lngs = coords.map((c) => c[0]);
          const lats = coords.map((c) => c[1]);
          const cam = map.cameraForBounds(
            [
              [Math.min(...lngs), Math.min(...lats)],
              [Math.max(...lngs), Math.max(...lats)],
            ],
            { padding: CLUSTER_FIT_PADDING },
          );
          fitZoom = cam?.zoom ?? null;
        }
        const action = decideClusterAction(coords, map.getZoom(), fitZoom, CLUSTER_FIT_MAX_ZOOM);
        const onStack = onStackSelectRef?.current;
        if (action.kind === 'spiderfy' && shouldListStack(leaves.length, !!onStack)) {
          // Every place, not the first SPIDER_MAX: the ring dropped the rest.
          onStack!({ center, points: leaves.map((l) => summaryFromFeature(l)) });
        } else if (action.kind === 'spiderfy') {
          spiderfy(map, center, leaves.slice(0, SPIDER_MAX));
        } else {
          map.fitBounds(action.bounds, {
            padding: CLUSTER_FIT_PADDING,
            maxZoom: CLUSTER_FIT_MAX_ZOOM,
            duration: imperativeDurationMs(durationMs.slow),
          });
        }
      } catch {
        map.flyTo({ center, zoom: map.getZoom() + 2, speed: 1.5 });
      }
    });

    // Unclustered point click → rich popup card
    map.on('click', [UNCLUSTERED_LAYER, PIN_DOT_LAYER, CLOUD_LAYER], (e: MapLayerMouseEvent) => {
      const feat = pickPointUnder(map, e);
      if (!feat || feat.geometry.type !== 'Point') return;
      // A stacked pin: every place on this spot, fanned out or listed.
      const members = stackMembersRef.current.get(String(feat.properties?.id));
      if (members && members.length > 1) {
        clearSpider();
        const center = (feat.geometry as GeoJSON.Point).coordinates as [number, number];
        const onStack = onStackSelectRef?.current;
        if (shouldListStack(members.length, !!onStack)) {
          onStack!({ center, points: members.map((m) => summaryFromFeature(m)) });
        } else {
          spiderfy(map, center, members.slice(0, SPIDER_MAX));
        }
        return;
      }
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
    map.on('mouseenter', [UNCLUSTERED_LAYER, PIN_DOT_LAYER, CLOUD_LAYER], () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', [UNCLUSTERED_LAYER, PIN_DOT_LAYER, CLOUD_LAYER], () => {
      map.getCanvas().style.cursor = '';
      hoverPopupRef.current?.remove();
      hoverPopupRef.current = null;
    });

    // Lightweight hover preview: name + subtitle, no close button, no action
    // buttons. Click still opens the full popup with share/navigate.
    map.on(
      'mousemove',
      [UNCLUSTERED_LAYER, PIN_DOT_LAYER, CLOUD_LAYER],
      (e: MapLayerMouseEvent) => {
        const feat = pickPointUnder(map, e);
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
      },
    );

    // Entrance fade — pins ease in on first paint (skipped for reduced motion),
    // settling fully opaque.
    if (!prefersReducedMotion && map.getLayer(UNCLUSTERED_LAYER)) {
      map.setPaintProperty(UNCLUSTERED_LAYER, 'circle-opacity', 0);
      requestAnimationFrame(() => {
        const m = mapRef.current;
        if (m?.getLayer(UNCLUSTERED_LAYER))
          m.setPaintProperty(UNCLUSTERED_LAYER, 'circle-opacity', 1);
      });
    }

    // Lay pins out on every settled camera. Below the cluster range clusters
    // keep pins apart, so every pin is full-size there.
    const runDeclutter = () => {
      const m = mapRef.current;
      if (!m || !m.getSource(POINTS_SOURCE)) return;
      const zoom = m.getZoom();
      let next = new Set<string>();
      if (zoom > CLUSTER_MAX_ZOOM) {
        const b = m.getBounds();
        const pad = 0.25;
        const w = b.getWest(),
          e = b.getEast(),
          so = b.getSouth(),
          n = b.getNorth();
        const dx = (e - w) * pad,
          dy = (n - so) * pad;
        const pts = [];
        for (const f of placedFeaturesRef.current) {
          const [lng, lat] = f.geometry.coordinates as [number, number];
          if (lng < w - dx || lng > e + dx || lat < so - dy || lat > n + dy) continue;
          const q = m.project([lng, lat]);
          const featured = f.properties.featured === true;
          pts.push({
            id: String(f.properties.id),
            x: q.x,
            y: q.y,
            r: pinRadiusAt(zoom, featured),
            priority: pinPriority(
              featured,
              f.properties.live === true,
              f.properties.stack_count || 1,
            ),
          });
        }
        next = declutterPins(pts);
      }
      const prev = compactIdsRef.current;
      for (const id of prev) {
        if (!next.has(id)) m.setFeatureState({ source: POINTS_SOURCE, id }, { compact: false });
      }
      for (const id of next) {
        if (!prev.has(id)) m.setFeatureState({ source: POINTS_SOURCE, id }, { compact: true });
      }
      compactIdsRef.current = next;
    };
    declutterRef.current = runDeclutter;
    map.on('moveend', runDeclutter);
    declutterSoon();

    startPulse();
    pointLayersAddedRef.current = true;
  }, [
    pointsGeoJSON,
    activeLines,
    mapReady,
    showPopup,
    startPulse,
    prefersReducedMotion,
    pinColorExpr,
    favoriteIds,
    visitedIds,
    savedOnly,
    spiderfy,
    clearSpider,
    mapRef,
    onSelectPointRef,
    onStackSelectRef,
    pointLayersAddedRef,
    pulseRafRef,
  ]);
}
