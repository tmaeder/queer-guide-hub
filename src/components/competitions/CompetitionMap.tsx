import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, MapLayerMouseEvent } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import { getMapStyle, MAP_FONT_BOLD } from '@/config/mapStyle';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { ink, inkMuted, paper, trackColor } from '@/lib/mapTokens';
import { isWebglSupported } from '@/lib/webglSupport';
import type { RosterEntry } from '@/types/competition';

/**
 * Where the entrants come from.
 *
 * COVERAGE IS PARTIAL BY CONSTRUCTION AND THE MISSING COUNT IS STATED, NOT
 * HIDDEN. Coordinates ride in from the linked personality's city, so an
 * entrant with no public personality row — or one whose city we never resolved
 * — has no point. A map that silently drops those reads as "these are all the
 * queens", which is a claim about the corpus rather than about what we hold.
 * `unmappedCount` is rendered underneath in words, the same way
 * `PersonalitiesMap` does it.
 *
 * THE JITTER IS DETERMINISTIC, WHICH `PersonalitiesMap`'S IS NOT. Many entrants
 * share one city — New York carries dozens — and without a spread they stack
 * into a single pin that can only ever open one popup. The reference jitters
 * with `Math.random()`, so a point lands somewhere new on every re-render and a
 * reader who scrolls away and back finds the map rearranged. Here the offset is
 * derived from the entrant's position within its own coincident group: same
 * input, same map, every time. The ring radius grows with the group so a large
 * city spreads further than a pair.
 *
 * The offsets are small (a fraction of a degree) and exist to separate marks,
 * so a pin is "in this city", never "at this address" — which is all the
 * underlying city-centroid data ever supported anyway.
 *
 * NOT IMPORTED EAGERLY. `maplibre-` is HEAVY_UNREACHABLE in
 * `check-bundle-shape.mjs`; this file is the default export so the page can
 * `lazy(() => import(...))` it behind a `<Suspense>`, and none of the other
 * competition components import it.
 */

const SOURCE_ID = 'competition-entrants-source';
const CLUSTERS_LAYER = 'competition-entrants-clusters';
const CLUSTER_COUNT_LAYER = 'competition-entrants-cluster-count';
const POINTS_LAYER = 'competition-entrants-points';

/** Degrees. Small enough to stay inside a metro, large enough to separate marks. */
const JITTER_BASE = 0.06;

interface EntrantFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: {
    name: string;
    /** Empty string, never undefined — MapLibre drops undefined properties. */
    slug: string;
    competition: string;
    edition: string;
    place: string;
  };
}

/** Group key for coincident points. Rounded so near-identical centroids share a ring. */
function coincidenceKey(lat: number, lng: number): string {
  return `${lat.toFixed(4)} ${lng.toFixed(4)}`;
}

/**
 * Offset the i-th member of a coincident group onto a ring. Index 0 stays on
 * the true centroid so a city with one entrant is never displaced.
 */
function ringOffset(index: number, size: number): [number, number] {
  if (index === 0 || size <= 1) return [0, 0];
  // Ring 1 holds 6, ring 2 holds 12, and so on, so a 26-way pile-up stays
  // legible instead of becoming one dense circle.
  const ring = Math.ceil((-3 + Math.sqrt(9 + 12 * index)) / 6) || 1;
  const perRing = ring * 6;
  const firstOfRing = 1 + 3 * ring * (ring - 1);
  const angle = ((index - firstOfRing) / perRing) * Math.PI * 2;
  const radius = JITTER_BASE * ring;
  // Longitude degrees shrink with latitude; a flat offset would draw an ellipse
  // near the poles. Kept simple — the widening factor is capped.
  return [Math.cos(angle) * radius * 1.6, Math.sin(angle) * radius];
}

export function CompetitionMap({
  entries,
  height = 600,
}: {
  entries: RosterEntry[];
  height?: number | string;
}) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const navigate = useLocalizedNavigate();

  // Lazy initializer, not an effect: this never changes after first paint, and
  // setting it from an effect would be a `set-state-in-effect` for a value the
  // very first render already knows.
  const [webgl] = useState(() => isWebglSupported());

  const { features, unmappedCount } = useMemo(() => {
    const groups = new Map<string, number>();
    const out: EntrantFeature[] = [];
    let unmapped = 0;

    for (const e of entries) {
      const { lat, lng } = e;
      if (
        lat == null ||
        lng == null ||
        !Number.isFinite(lat) ||
        !Number.isFinite(lng) ||
        Math.abs(lat) > 90 ||
        Math.abs(lng) > 180
      ) {
        unmapped += 1;
        continue;
      }
      const key = coincidenceKey(lat, lng);
      const seen = groups.get(key) ?? 0;
      groups.set(key, seen + 1);
      out.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lng, lat] },
        properties: {
          name: e.name,
          // A null slug means no public page exists. It is carried as an empty
          // string and the popup checks it — never synthesised from the name.
          slug: e.personality_slug ?? '',
          competition: e.competition,
          edition: e.edition,
          place: [e.hometown ?? e.city, e.country].filter(Boolean).join(', '),
        },
      });
    }

    // Second pass: the ring size is only known once the whole group is counted.
    const placed = new Map<string, number>();
    for (const f of out) {
      const [lng, lat] = f.geometry.coordinates;
      const key = coincidenceKey(lat, lng);
      const size = groups.get(key) ?? 1;
      const index = placed.get(key) ?? 0;
      placed.set(key, index + 1);
      const [dLng, dLat] = ringOffset(index, size);
      f.geometry.coordinates = [lng + dLng, lat + dLat];
    }

    return { features: out, unmappedCount: unmapped };
  }, [entries]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    if (!webgl) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: getMapStyle(),
      center: [0, 30],
      zoom: 1.5,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [webgl]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

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
        clusterMaxZoom: 8,
        clusterRadius: 50,
      });

      map.addLayer({
        id: CLUSTERS_LAYER,
        type: 'circle',
        source: SOURCE_ID,
        filter: ['has', 'point_count'],
        paint: {
          'circle-radius': ['step', ['get', 'point_count'], 16, 10, 22, 50, 28, 100, 36],
          'circle-color': ink(),
          'circle-stroke-width': 2,
          'circle-stroke-color': paper(),
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
          'text-font': [MAP_FONT_BOLD],
          'text-size': 12,
        },
        paint: { 'text-color': paper() },
      });

      map.addLayer({
        id: POINTS_LAYER,
        type: 'circle',
        source: SOURCE_ID,
        filter: ['!', ['has', 'point_count']],
        paint: {
          // A track fill is border-gated by the ink ring, exactly as it is in
          // the UI — the pink alone does not clear 3:1 against the basemap.
          'circle-radius': 6,
          'circle-color': trackColor('pink'),
          'circle-stroke-width': 2,
          'circle-stroke-color': ink(),
        },
      });

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
            speed: 1.5,
          });
        } catch {
          /* the cluster went away between click and resolve — nothing to do */
        }
      });

      map.on('click', POINTS_LAYER, (e: MapLayerMouseEvent) => {
        const feat = e.features?.[0];
        if (!feat) return;
        const props = feat.properties as {
          name: string;
          slug: string;
          competition: string;
          edition: string;
          place: string;
        };
        const coords = (feat.geometry as GeoJSON.Point).coordinates as [number, number];

        // Built as DOM with textContent, never innerHTML: these strings are
        // scraped entrant names and go straight into the document. There is no
        // escaping step to get wrong because there is no HTML parsing.
        const node = document.createElement('div');
        node.style.maxWidth = '220px';

        const nameEl = document.createElement('div');
        nameEl.textContent = props.name;
        nameEl.style.fontWeight = '700';
        nameEl.style.fontSize = '13px';
        node.appendChild(nameEl);

        const whereEl = document.createElement('div');
        whereEl.textContent = `${props.competition} · ${props.edition}`;
        whereEl.style.fontSize = '11px';
        whereEl.style.color = inkMuted();
        node.appendChild(whereEl);

        if (props.place) {
          const placeEl = document.createElement('div');
          placeEl.textContent = props.place;
          placeEl.style.fontSize = '11px';
          placeEl.style.color = inkMuted();
          node.appendChild(placeEl);
        }

        // Clickable ONLY when a public page exists. An entrant with no slug
        // gets a plain, inert popup rather than a link that 404s or, worse,
        // resolves to a draft person.
        if (props.slug) {
          const linkEl = document.createElement('button');
          linkEl.type = 'button';
          linkEl.textContent = t('competitions.map.viewProfile', 'View profile');
          linkEl.style.marginTop = '8px';
          linkEl.style.fontSize = '11px';
          linkEl.style.fontWeight = '700';
          linkEl.style.textDecoration = 'underline';
          linkEl.style.cursor = 'pointer';
          linkEl.style.color = ink();
          linkEl.style.background = 'transparent';
          linkEl.style.border = 'none';
          linkEl.style.padding = '0';
          linkEl.addEventListener('click', () => {
            navigate(`/personalities/${props.slug}`);
          });
          node.appendChild(linkEl);
        }

        new maplibregl.Popup({ closeButton: true, offset: 12 })
          .setLngLat(coords)
          .setDOMContent(node)
          .addTo(map);
      });

      for (const layer of [CLUSTERS_LAYER, POINTS_LAYER]) {
        map.on('mouseenter', layer, () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', layer, () => {
          map.getCanvas().style.cursor = '';
        });
      }
    };

    if (map.isStyleLoaded()) apply();
    else map.once('load', apply);
  }, [features, navigate, t]);

  if (!webgl) {
    return (
      <p className="text-muted-foreground">
        {t(
          'competitions.map.noWebgl',
          'The map needs WebGL, which this browser does not have. The roster below lists every entrant.',
        )}
      </p>
    );
  }

  return (
    <div>
      <div
        ref={containerRef}
        className="rounded-element"
        style={{ width: '100%', height }}
        role="region"
        aria-label={t('competitions.map.label', 'Map of entrants by hometown')}
      />
      <p className="mt-2 text-13 tabular-nums text-muted-foreground">
        {t('competitions.map.shown', '{{n}} entrants on the map', {
          n: features.length,
        })}
        {unmappedCount > 0
          ? ` · ${t(
              'competitions.map.unmapped',
              '{{n}} not shown — no hometown coordinates on file',
              { n: unmappedCount },
            )}`
          : null}
      </p>
    </div>
  );
}

export default CompetitionMap;
