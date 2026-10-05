/* eslint-disable react-hooks/refs -- this component threads the initial-center ref through props during render; MapShell subscribes to .current itself. */
import { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ENTITY_BULLET,
  areaColor,
  lineColor,
  lineFor,
  layerForEntityKey,
  type MapStation,
} from '@/components/map/mapDomain';
import { glyphKeyFor } from '@/components/map/mapIcons';
import { MapShell } from '@/components/map/MapShell';
import type { SearchResult } from '@/hooks/useSearch';

interface ResultsMapViewProps {
  results: SearchResult[];
  height?: number | string;
}

/** Upper bound on markers rendered at once — protects MapLibre on huge result sets. */
const MAX_MARKERS = 300;

// The singular→plural join lives in `mapDomain.layerForEntityKey`, which takes
// either spelling. The partial table that used to sit here covered four of the
// seven layers, so a hotel / restroom / village hit resolved to `undefined`.

/**
 * Map view for search results.
 *
 * **The results are now what the map DRAWS.** Until this change the memo below
 * built the markers correctly and then threw them away: `MapShell` had no data
 * prop, so it always fetched by viewport and `/search?q=sauna&view=map`
 * rendered generic unfiltered venues — a map that looked like it was answering
 * the query and was not.
 *
 * `ordered: true` is load-bearing. `results` arrives in RELEVANCE order, and
 * the rail's default ranking (featured → live → nearest → alphabetical) is
 * wrong for that set: it would put a featured bar above the thing the reader
 * actually searched for.
 *
 * `SURFACE_PRESETS.search` declares `filters: []` for the same reason — on an
 * explicit source the client-side narrowing in `useViewportPoints` never runs,
 * so a filter chip would claim to narrow and not narrow. These stations are
 * already filtered; that is what owning the set means.
 */
export function ResultsMapView({ results, height = 480 }: ResultsMapViewProps) {
  const { t } = useTranslation();
  const initialCenterRef = useRef<[number, number] | null>(null);
  const stations: MapStation[] = useMemo(() => {
    const out: MapStation[] = [];
    for (const r of results) {
      const geo = r._geoloc;
      if (!geo || typeof geo.lat !== 'number' || typeof geo.lng !== 'number') continue;
      const layer = layerForEntityKey(r.type);
      // A hit whose type has no map layer (a tag, a personality) cannot be a
      // station. Dropped rather than drawn at [0,0], which is the Atlantic.
      if (!layer) continue;
      const line = lineFor(layer, r.category);
      out.push({
        // The feature-id convention every hover / selection / saved lookup is
        // built on. `objectID` is the bare uuid, so it has to be prefixed or
        // nothing matches.
        id: `${r.type}-${r.objectID}`,
        type: layer,
        entity: ENTITY_BULLET[layer],
        line,
        lat: geo.lat,
        lng: geo.lng,
        name: r.title,
        subtitle: r.location || undefined,
        linkTo: r.slug ? `/${r.type}/${r.slug}` : undefined,
        color: line ? lineColor(line) : areaColor(),
        iconKey: glyphKeyFor(layer, r.category),
        category: r.category,
        image: r.imageUrl,
        // Search does not report either, and a default of `true` would ring
        // every pin as featured or pulse it as live.
        featured: false,
        live: false,
        distanceKm: r._distance_m != null ? r._distance_m / 1000 : undefined,
      });
    }
    // Cap markers to keep MapLibre geometry cheap. `results` already arrives in
    // rank/distance order, so we keep the strongest hits and drop the tail.
    // No silent truncation: log how many were dropped.
    if (out.length > MAX_MARKERS) {
      const dropped = out.length - MAX_MARKERS;
      console.info(
        `[ResultsMapView] capped map markers: showing ${MAX_MARKERS}, dropped ${dropped}`,
      );
      return out.slice(0, MAX_MARKERS);
    }
    return out;
  }, [results]);

  const center: [number, number] = useMemo(() => {
    if (stations.length === 0) return [0, 20];
    let lat = 0;
    let lng = 0;
    for (const m of stations) {
      lat += m.lat;
      lng += m.lng;
    }
    return [lng / stations.length, lat / stations.length];
  }, [stations]);

  if (stations.length === 0) {
    return (
      <div
        className="flex items-center justify-center bg-muted text-muted-foreground text-sm"
        style={{ height }}
      >
        {t('search.noMappable', 'No mappable results in this view.')}
      </div>
    );
  }

  if (!initialCenterRef.current) initialCenterRef.current = center;

  return (
    <MapShell
      surface="search"
      height={height}
      initialCenter={initialCenterRef.current}
      initialZoom={stations.length === 1 ? 12 : 5}
      skipAutoFly
      source={{ kind: 'points', stations, ordered: true }}
    />
  );
}
