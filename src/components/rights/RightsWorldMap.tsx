// src/components/rights/RightsWorldMap.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, MapLayerMouseEvent } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { getMapStyle } from '@/config/mapStyle';
import { isWebglSupported } from '@/lib/webglSupport';
import { useCountryBoundaries } from '@/hooks/useBoundaryData';
import { ink, paper, tokenColor } from '@/lib/mapTokens';
import {
  mapClassFor,
  MAP_CLASS_ORDER,
  MAP_CLASS_LABEL,
  MAP_CLASS_INK,
  type MapClass,
} from '@/lib/rights/rightsMapModel';
import type { RightTopic } from '@/lib/rights/rightsCatalog';
import type { RightsLens } from '@/lib/rights/rightsClassify';
import type { RightsCountry } from '@/hooks/useIntentData';

/**
 * Task C of docs/plans/2026-08-22-rights-world-map-design.md — the choropleth
 * itself. `RightsMapControls` (built in parallel) owns the line/station
 * selector and the trans-lens toggle; this component only paints the world
 * for whatever `topic`/`lens` it is handed and reports clicks back up.
 *
 * Pattern lifted from `src/components/footprint/AtlasMap.tsx`, the one map in
 * the repo that already does country-polygon fills correctly: the MapLibre
 * instance is constructed in a mount-once effect, `mapRef` is published
 * inside `map.on('load')` (never at construction — `addSource`/`addLayer`
 * against a still-loading style throws), and the boundary source/layers are
 * wired in a second effect gated on `mapReady`.
 *
 * Crisis-adjacent invariant (design doc §Invariants): no fly-to, no reveal
 * animation, no easing. Hover/selection reads through a station-ring line
 * layer keyed on MapLibre `feature-state`, never through a camera move.
 */

const SRC = 'rights-world-map';
const FILL_LAYER = 'rights-world-fill';
const LINE_LAYER = 'rights-world-line';
const NODATA_LINE_LAYER = 'rights-world-nodata-line';
const RING_LAYER = 'rights-world-ring';

type RightsFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Geometry,
  GeoJSON.GeoJsonProperties
>;

const EMPTY_CLASS_COUNTS: Record<MapClass, number> = {
  protected: 0,
  partial: 0,
  restricted: 0,
  criminalised: 0,
  death: 0,
  deathPossible: 0,
  nodata: 0,
};

/**
 * Join boundary polygons to `countries` by `ISO_A2` ⇄ `code` (uppercased both
 * sides) and stamp each feature's classification for the current topic/lens
 * as `rightsClass`. A boundary feature with no matching country row reads
 * `'nodata'` — never silently dropped, never guessed into a measured class.
 *
 * Pure and exported so the join/classification behaviour — the part that
 * must never disagree with what the map paints — can be unit-tested without
 * constructing a MapLibre instance (jsdom has no WebGL).
 */
export function classifyBoundaries(
  boundaries: GeoJSON.FeatureCollection,
  countries: readonly RightsCountry[],
  topic: RightTopic,
  lens: RightsLens,
): RightsFeatureCollection {
  const byCode = new Map<string, RightsCountry>();
  for (const c of countries) {
    if (c.code) byCode.set(c.code.toUpperCase(), c);
  }
  return {
    ...boundaries,
    features: boundaries.features.map((feature) => {
      const iso = String(feature.properties?.ISO_A2 ?? '').toUpperCase();
      const country = byCode.get(iso);
      const rightsClass: MapClass = country
        ? mapClassFor(country as unknown as Record<string, unknown>, topic, lens)
        : 'nodata';
      return {
        ...feature,
        properties: { ...feature.properties, rightsClass },
      };
    }),
  };
}

/** Tally `rightsClass` across already-joined features — what the fill layer
 *  is actually painting, as opposed to a count over the raw country list
 *  (which can diverge when a country has no boundary geometry or vice versa). */
export function summariseFeatureClasses(
  features: readonly GeoJSON.Feature[],
): Record<MapClass, number> {
  const counts: Record<MapClass, number> = { ...EMPTY_CLASS_COUNTS };
  for (const f of features) {
    const cls = f.properties?.rightsClass as MapClass | undefined;
    if (cls && cls in counts) counts[cls] += 1;
  }
  return counts;
}

/**
 * "World map: {topic}. {n} protected, {n} partial, …" — every non-zero class
 * in `MAP_CLASS_ORDER` (most-restrictive first), so the announced summary can
 * never drift from what `MAP_CLASS_ORDER`/`MAP_CLASS_LABEL` say the map means.
 * Exported for direct testing and reused for both the live map and every
 * fallback state — a reader must get the same information whichever renders.
 */
export function buildMapAriaLabel(topicLabel: string, counts: Record<MapClass, number>): string {
  const parts = MAP_CLASS_ORDER.filter((cls) => counts[cls] > 0).map(
    (cls) => `${counts[cls]} ${MAP_CLASS_LABEL[cls].toLowerCase()}`,
  );
  const body = parts.length > 0 ? parts.join(', ') : 'no countries measured yet';
  return `World map: ${topicLabel}. ${body}.`;
}

export interface RightsWorldMapProps {
  countries: RightsCountry[];
  topic: RightTopic;
  lens: RightsLens;
  /** Set by clicking a route-strip legend station; dims every other class. */
  activeClass: MapClass | null;
  onCountrySelect: (country: RightsCountry) => void;
}

export function RightsWorldMap({
  countries,
  topic,
  lens,
  activeClass,
  onCountrySelect,
}: RightsWorldMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const hoveredIdRef = useRef<number | null>(null);
  const selectedIdRef = useRef<number | null>(null);

  const { data: boundaries } = useCountryBoundaries(true, 1);
  const webglOk = isWebglSupported();

  // Refs for values the click/hover handlers need fresh, without re-running
  // the layer-creation effect (which must run exactly once per map instance —
  // calling addLayer twice on the same id throws).
  const byCodeRef = useRef(new Map<string, RightsCountry>());
  useEffect(() => {
    const m = new Map<string, RightsCountry>();
    for (const c of countries) if (c.code) m.set(c.code.toUpperCase(), c);
    byCodeRef.current = m;
  }, [countries]);
  const onCountrySelectRef = useRef(onCountrySelect);
  useEffect(() => {
    onCountrySelectRef.current = onCountrySelect;
  }, [onCountrySelect]);

  const classified = useMemo(
    () => (boundaries ? classifyBoundaries(boundaries, countries, topic, lens) : null),
    [boundaries, countries, topic, lens],
  );

  const counts = classified ? summariseFeatureClasses(classified.features) : EMPTY_CLASS_COUNTS;
  const ariaLabel = buildMapAriaLabel(topic.labelDefault, counts);

  // Init map — mount-once. `mapRef` publishes inside `load` so the wiring
  // effect below never touches a style that is still loading.
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;
    if (!isWebglSupported()) return;
    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: getMapStyle(),
      center: [10, 25],
      zoom: 0.9,
      attributionControl: false,
      dragRotate: false,
    });
    map.touchZoomRotate.disableRotation();
    map.on('load', () => {
      mapRef.current = map;
      setMapReady(true);
    });
    return () => {
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  // Wire source + layers once; subsequent data changes go through setData.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !classified) return;

    const existing = map.getSource(SRC) as GeoJSONSource | undefined;
    if (existing) {
      existing.setData(classified);
      return;
    }

    map.addSource(SRC, { type: 'geojson', data: classified });

    // One fill layer, coloured by the pre-computed `rightsClass` property —
    // never a MapLibre expression over the raw jsonb. `nodata` is not a
    // branch here: it falls through to the match expression's fallback
    // value, which is `paper()` — a gap in the data must never read as a
    // filled class.
    map.addLayer({
      id: FILL_LAYER,
      type: 'fill',
      source: SRC,
      paint: {
        'fill-color': [
          'match',
          ['get', 'rightsClass'],
          'protected',
          ink(MAP_CLASS_INK.protected),
          'partial',
          ink(MAP_CLASS_INK.partial),
          'restricted',
          ink(MAP_CLASS_INK.restricted),
          'criminalised',
          ink(MAP_CLASS_INK.criminalised),
          'death',
          tokenColor('--destructive', 0.9),
          'deathPossible',
          tokenColor('--destructive', 0.62),
          paper(),
        ],
      },
    });

    // Country hairlines, everyone the same fine weight.
    map.addLayer({
      id: LINE_LAYER,
      type: 'line',
      source: SRC,
      paint: { 'line-color': ink(0.25), 'line-width': 0.5 },
    });

    // No-data countries get a second, denser hairline on top so an absent
    // reading never reads as the lightest measured class — `protected` sits
    // at ink(0.12), close enough to bare paper that a plain paper fill alone
    // would be ambiguous with "no signal at all". This is the "visibly
    // different treatment" the design calls for in place of a diagonal hatch:
    // a MapLibre `fill-pattern` needs a raster sprite, which cannot be
    // resolved through mapTokens.ts at runtime, so it is out of scope for a
    // token-only canvas. The route-strip legend (built in parallel) still
    // owns the literal hatch swatch for the key.
    map.addLayer({
      id: NODATA_LINE_LAYER,
      type: 'line',
      source: SRC,
      paint: { 'line-color': ink(0.45), 'line-width': 0.75 },
      filter: ['==', ['get', 'rightsClass'], 'nodata'],
    });

    // Station ring — hover/selection only, no animation, no easing.
    map.addLayer({
      id: RING_LAYER,
      type: 'line',
      source: SRC,
      paint: {
        'line-color': ink(),
        'line-width': 2,
        'line-opacity': [
          'case',
          ['boolean', ['feature-state', 'selected'], false],
          1,
          ['boolean', ['feature-state', 'hovered'], false],
          1,
          0,
        ],
      },
    });

    map.on('mousemove', FILL_LAYER, (e: MapLayerMouseEvent) => {
      const feat = e.features?.[0];
      map.getCanvas().style.cursor = feat ? 'pointer' : '';
      const numId = feat?.id as number | undefined;
      if (hoveredIdRef.current !== null && hoveredIdRef.current !== numId) {
        map.setFeatureState({ source: SRC, id: hoveredIdRef.current }, { hovered: false });
      }
      if (numId != null) {
        map.setFeatureState({ source: SRC, id: numId }, { hovered: true });
        hoveredIdRef.current = numId;
      }
    });

    map.on('mouseleave', FILL_LAYER, () => {
      map.getCanvas().style.cursor = '';
      if (hoveredIdRef.current !== null) {
        map.setFeatureState({ source: SRC, id: hoveredIdRef.current }, { hovered: false });
        hoveredIdRef.current = null;
      }
    });

    map.on('click', FILL_LAYER, (e: MapLayerMouseEvent) => {
      const feat = e.features?.[0];
      if (!feat) return;
      const iso = String(feat.properties?.ISO_A2 ?? '').toUpperCase();
      const country = byCodeRef.current.get(iso);

      const numId = feat.id as number | undefined;
      if (selectedIdRef.current !== null && selectedIdRef.current !== numId) {
        map.setFeatureState({ source: SRC, id: selectedIdRef.current }, { selected: false });
      }
      if (numId != null) {
        map.setFeatureState({ source: SRC, id: numId }, { selected: true });
        selectedIdRef.current = numId;
      }

      if (country) onCountrySelectRef.current(country);
    });
  }, [mapReady, classified]);

  // Dim every feature whose class differs from the legend's active filter.
  // fill-opacity, never removing a layer — the design doc is explicit that
  // dimming must not remove data from the canvas.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !map.getLayer(FILL_LAYER)) return;
    map.setPaintProperty(
      FILL_LAYER,
      'fill-opacity',
      activeClass ? ['case', ['==', ['get', 'rightsClass'], activeClass], 1, 0.25] : 1,
    );
  }, [activeClass, mapReady, classified]);

  const loading = !classified;

  return (
    <div
      className="relative h-[380px] md:h-[520px] rounded-container overflow-hidden bg-surface-container"
      role="img"
      aria-label={ariaLabel}
    >
      <div ref={mapContainer} className="absolute inset-0" />
      {!webglOk ? (
        <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
          <p className="text-13 text-muted-foreground">
            Map unavailable in this browser. Every country&apos;s status is in the table below.
          </p>
        </div>
      ) : loading ? (
        <div className="absolute inset-0 flex items-center justify-center bg-background/40">
          <TrackLoader size={24} label="Loading map" />
        </div>
      ) : null}
    </div>
  );
}

export default RightsWorldMap;
