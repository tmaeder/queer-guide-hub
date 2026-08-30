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
import { MAP_CLASS_INK, type MapClass } from '@/lib/rights/rightsMapModel';
import type { RightTopic } from '@/lib/rights/rightsCatalog';
import type { RightsLens } from '@/lib/rights/rightsClassify';
import type { RightsCountry } from '@/hooks/useIntentData';
import {
  buildMapAriaLabel,
  classifyBoundaries,
  summariseFeatureClasses,
  EMPTY_CLASS_COUNTS,
} from './rightsWorldMapModel';

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

  /**
   * 50m boundaries, NOT the 110m set every other map surface uses.
   *
   * Measured against the live worker: 110m carries 175 country polygons, 50m
   * carries 237. The 62 it adds are small states and territories — Singapore,
   * Saint Lucia, Saint Vincent, Samoa, Tonga, the Caribbean and Pacific
   * dependencies — and on THIS map that gap is not cosmetic. Painted from
   * 110m, the canvas showed 46 criminalising and 7 death-penalty
   * jurisdictions while the country table 300px below reported 66 and 12:
   * twenty criminalising countries silently absent from a map a reader opens
   * to decide whether somewhere is safe to enter, and no way to tell an
   * undrawn country from an unmeasured one.
   *
   * The cost is real and deliberate: 231 KB gzipped against 20 KB. It is
   * fetched once per hour (React Query staleTime) on a single route, and the
   * cache key is shared with every other surface that asks for 50m. A
   * data map that omits the data is the worse trade.
   *
   * 13 of our 250 rows still have no polygon at this resolution; the section's
   * coverage note says so rather than letting the two counts disagree in
   * silence.
   */
  const { data: boundaries } = useCountryBoundaries(true, 5);
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

  /**
   * Keep the canvas the size of its box.
   *
   * MapLibre measures the container once at construction and then only listens
   * to WINDOW resize — it never notices its own container growing. Measured
   * here: the wrapper is 520px tall at `md`, and the canvas came out 1376×300,
   * so the map filled 58% of its box and the remaining 220px was bare
   * `bg-surface-container`. It reads as a half-loaded panel, and the countries
   * pushed off the bottom edge simply are not on the map.
   *
   * The height is a breakpoint (`h-[380px] md:h-[520px]`), so a window resize
   * across `md` changes the box without the window handler helping — the
   * observer covers both that and the first layout settling after mount.
   */
  useEffect(() => {
    const el = mapContainer.current;
    if (!el || !mapReady) return;
    const map = mapRef.current;
    if (!map) return;
    map.resize();
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(el);
    return () => observer.disconnect();
  }, [mapReady]);

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
      {/* `h-full w-full`, NOT `absolute inset-0`.
          MapLibre stamps `.maplibregl-map` on whatever container it is given,
          and its stylesheet sets `position: relative` on that class. Same
          specificity as Tailwind's `absolute`, later in the cascade, so it
          wins — the div stops being positioned, collapses to zero height, and
          MapLibre falls back to its 400×300 default. Measured: wrapper 520px,
          `.maplibregl-map` clientHeight 0, canvas 1376×300, and a 220px band
          of empty `bg-surface-container` under a map missing everything below
          its own bottom edge. A percentage height survives the override. */}
      <div ref={mapContainer} className="h-full w-full" />
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
