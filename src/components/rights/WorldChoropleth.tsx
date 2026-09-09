import { useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, MapLayerMouseEvent } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { getMapStyle } from '@/config/mapStyle';
import { isWebglSupported } from '@/lib/webglSupport';
import { useCountryBoundaries } from '@/hooks/useBoundaryData';
import { applyWhenStyleReady, isMapAlive } from '@/components/map/mapStyleReady';
import { ink } from '@/lib/mapTokens';
import { tallyFeatureClasses, type ClassifiedFeatureCollection } from './rightsWorldMapModel';

/**
 * The country choropleth, with no opinion about what it is colouring.
 *
 * Extracted verbatim out of `RightsWorldMap` when `/rights/trans` needed a
 * second one for legal gender recognition. Everything here is MapLibre
 * knowledge that took a while to get right and must not be re-learned in a
 * copy — the 50m boundary set, publishing `mapRef` inside `load`, the
 * ResizeObserver, and the `h-full w-full` container rule are each load-bearing
 * and each documented below. What DOES differ between the two maps — the class
 * vocabulary, the fill ramp, the aria summary — is passed in.
 *
 * Crisis-adjacent invariant, inherited unchanged: no fly-to, no reveal
 * animation, no easing. Hover and selection read through a station-ring line
 * layer keyed on MapLibre `feature-state`, never through a camera move.
 */

const SRC = 'world-choropleth';
const FILL_LAYER = 'world-choropleth-fill';
const LINE_LAYER = 'world-choropleth-line';
const EMPTY_LINE_LAYER = 'world-choropleth-empty-line';
const RING_LAYER = 'world-choropleth-ring';

export interface WorldChoroplethProps {
  /**
   * Boundaries → features carrying a class key. The CALLER owns this, which is
   * what keeps a map and the figures printed beside it reading one classifier
   * rather than two that can drift apart.
   */
  classify: (boundaries: GeoJSON.FeatureCollection) => ClassifiedFeatureCollection;
  /** Feature property the class key is stamped on. */
  classProperty: string;
  /**
   * The tail of a MapLibre `match` expression — class, colour, class, colour,
   * …, fallback. The fallback must be the "no reading" paint: a gap in the
   * data may never render as a measured class.
   */
  fillMatch: unknown[];
  /** The class meaning "nothing recorded"; gets the second, denser hairline. */
  emptyClass: string;
  /**
   * Announced summary, built from a tally of what the canvas ACTUALLY paints
   * rather than from the caller's country list — the two diverge whenever a
   * country has no polygon at this resolution, or a polygon has no row.
   * Passing the counts rather than a finished string is what keeps that true.
   */
  buildAriaLabel: (counts: Record<string, number>) => string;
  /** Dims every other class. Null shows all. */
  activeClass: string | null;
  /** ISO_A2 of the clicked feature, uppercased. */
  onFeatureSelect: (iso: string) => void;
}

export function WorldChoropleth({
  classify,
  classProperty,
  fillMatch,
  emptyClass,
  buildAriaLabel,
  activeClass,
  onFeatureSelect,
}: WorldChoroplethProps) {
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
   * dependencies — and on a rights map that gap is not cosmetic. Painted from
   * 110m, the canvas showed 46 criminalising and 7 death-penalty
   * jurisdictions while the country table 300px below reported 66 and 12:
   * twenty criminalising countries silently absent from a map a reader opens
   * to decide whether somewhere is safe to enter, and no way to tell an
   * undrawn country from an unmeasured one.
   *
   * The cost is real and deliberate: 231 KB gzipped against 20 KB. It is
   * fetched once per hour (React Query staleTime) and the cache key is shared
   * with every other surface that asks for 50m — including the second map on
   * /rights/trans, which therefore costs nothing extra. A data map that omits
   * the data is the worse trade.
   */
  const { data: boundaries } = useCountryBoundaries(true, 5);
  const webglOk = isWebglSupported();

  const onFeatureSelectRef = useRef(onFeatureSelect);
  useEffect(() => {
    onFeatureSelectRef.current = onFeatureSelect;
  }, [onFeatureSelect]);

  const classified = useMemo(
    () => (boundaries ? classify(boundaries) : null),
    [boundaries, classify],
  );

  const ariaLabel = useMemo(
    () => buildAriaLabel(classified ? tallyFeatureClasses(classified.features, classProperty) : {}),
    [classified, classProperty, buildAriaLabel],
  );

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
      // ORDER IS LOAD-BEARING, and it used to be the other way round.
      // `Map.remove()` runs `setStyle(null)`, whose `_updateStyle(null)` branch
      // executes `delete this.style` — so between `map.remove()` and the next
      // statement the ref published a live-looking map with NO STYLE AT ALL.
      // That is the shape of the recorded production `TypeError: null is not
      // an object (evaluating 'this.style.getLayer')`. Drop every handle
      // FIRST, then destroy: the order `EntityMap` and `useMapInstance`
      // already use.
      mapRef.current = null;
      setMapReady(false);
      map.remove();
    };
  }, []);

  /**
   * Keep the canvas the size of its box.
   *
   * MapLibre measures the container once at construction and then only listens
   * to WINDOW resize — it never notices its own container growing. Measured:
   * the wrapper is 520px tall at `md`, and the canvas came out 1376×300, so
   * the map filled 58% of its box and the remaining 220px was bare
   * `bg-surface-container`. It reads as a half-loaded panel, and the countries
   * pushed off the bottom edge simply are not on the map.
   */
  useEffect(() => {
    const el = mapContainer.current;
    if (!el || !mapReady) return;
    const map = mapRef.current;
    if (!isMapAlive(map)) return;
    map.resize();
    // A resize notification can still land between `map.remove()` and this
    // observer's own disconnect, and `resize()` on a removed map reaches a
    // painter that no longer exists.
    const observer = new ResizeObserver(() => {
      if (isMapAlive(map)) map.resize();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [mapReady]);

  /**
   * Wire source + layers once; subsequent data changes go through setData.
   *
   * This runs through `applyWhenStyleReady`, NOT off `mapReady` alone.
   * `mapReady` is a React state flag latched once inside `load`: it records
   * that the style WAS loaded at some past instant, and every call below is
   * guarded by MapLibre's `Style._checkLoaded()`, which throws
   * `"Style is not done loading."` the moment that stops being true. The throw
   * happens inside a `useEffect` body, so React 18 hands it to the error
   * boundary and the whole of /rights goes to the crash screen — measured in
   * production on 2026-09-08 with this component's chunk as the top frame.
   *
   * When the style is not ready the work is DEFERRED to the next `styledata`
   * and applied then. It is never dropped: a dropped source is a permanently
   * blank map, which is the same failure by a quieter route.
   *
   * Each `addLayer` is guarded by `getLayer` so a deferred re-attempt after a
   * partial pass cannot throw "there is already a layer with this id".
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !classified) return;

    return applyWhenStyleReady(map, (m) => {
      const existing = m.getSource(SRC) as GeoJSONSource | undefined;
      if (existing) {
        existing.setData(classified);
        return;
      }

      m.addSource(SRC, { type: 'geojson', data: classified });

      // One fill layer, coloured by the pre-computed class property — never a
      // MapLibre expression over the raw jsonb.
      if (!m.getLayer(FILL_LAYER)) {
        m.addLayer({
          id: FILL_LAYER,
          type: 'fill',
          source: SRC,
          paint: {
            'fill-color': ['match', ['get', classProperty], ...fillMatch],
          } as never,
        });
      }

      // Country hairlines, everyone the same fine weight.
      if (!m.getLayer(LINE_LAYER)) {
        m.addLayer({
          id: LINE_LAYER,
          type: 'line',
          source: SRC,
          paint: { 'line-color': ink(0.25), 'line-width': 0.5 },
        });
      }

      // No-reading countries get a second, denser hairline on top so an absent
      // reading never reads as the lightest measured class — the palest fill
      // sits close enough to bare paper that a plain paper fill alone would be
      // ambiguous with "no signal at all". A MapLibre `fill-pattern` would need
      // a raster sprite, which cannot be resolved through mapTokens.ts at
      // runtime, so the hatch lives only in the legend swatch.
      if (!m.getLayer(EMPTY_LINE_LAYER)) {
        m.addLayer({
          id: EMPTY_LINE_LAYER,
          type: 'line',
          source: SRC,
          paint: { 'line-color': ink(0.45), 'line-width': 0.75 },
          filter: ['==', ['get', classProperty], emptyClass],
        });
      }

      // Station ring — hover/selection only, no animation, no easing.
      if (!m.getLayer(RING_LAYER)) {
        m.addLayer({
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
      }

      m.on('mousemove', FILL_LAYER, (e: MapLayerMouseEvent) => {
        if (!isMapAlive(m)) return;
        const feat = e.features?.[0];
        m.getCanvas().style.cursor = feat ? 'pointer' : '';
        const numId = feat?.id as number | undefined;
        if (hoveredIdRef.current !== null && hoveredIdRef.current !== numId) {
          m.setFeatureState({ source: SRC, id: hoveredIdRef.current }, { hovered: false });
        }
        if (numId != null) {
          m.setFeatureState({ source: SRC, id: numId }, { hovered: true });
          hoveredIdRef.current = numId;
        }
      });

      m.on('mouseleave', FILL_LAYER, () => {
        if (!isMapAlive(m)) return;
        m.getCanvas().style.cursor = '';
        if (hoveredIdRef.current !== null) {
          m.setFeatureState({ source: SRC, id: hoveredIdRef.current }, { hovered: false });
          hoveredIdRef.current = null;
        }
      });

      m.on('click', FILL_LAYER, (e: MapLayerMouseEvent) => {
        if (!isMapAlive(m)) return;
        const feat = e.features?.[0];
        if (!feat) return;

        const numId = feat.id as number | undefined;
        if (selectedIdRef.current !== null && selectedIdRef.current !== numId) {
          m.setFeatureState({ source: SRC, id: selectedIdRef.current }, { selected: false });
        }
        if (numId != null) {
          m.setFeatureState({ source: SRC, id: numId }, { selected: true });
          selectedIdRef.current = numId;
        }

        onFeatureSelectRef.current(String(feat.properties?.ISO_A2 ?? '').toUpperCase());
      });
    });
  }, [mapReady, classified, classProperty, emptyClass, fillMatch]);

  // Dim every feature whose class differs from the legend's active filter.
  // fill-opacity, never removing a layer — dimming must not remove data from
  // the canvas.
  //
  // Returning `false` when the fill layer is not there yet parks this on the
  // same `styledata` retry as the wiring effect above, so a dim chosen while
  // the wire is deferred is applied once the layer lands instead of being
  // silently lost — which the old `!map.getLayer(...)` early return did.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    return applyWhenStyleReady(map, (m) => {
      if (!m.getLayer(FILL_LAYER)) return false;
      m.setPaintProperty(
        FILL_LAYER,
        'fill-opacity',
        activeClass ? ['case', ['==', ['get', classProperty], activeClass], 1, 0.25] : 1,
      );
      // Explicit, not incidental: `applyWhenStyleReady` retries on exactly
      // `false`, so the applied path has to say so rather than fall off the
      // end. `noImplicitReturns` (TS7030) rejects the mixed-return shape too.
      return true;
    });
  }, [activeClass, mapReady, classified, classProperty]);

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
            Map unavailable in this browser. Every country&apos;s status is listed below.
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

export default WorldChoropleth;
