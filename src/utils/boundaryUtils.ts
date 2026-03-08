import type { MapMarker } from '@/hooks/useExploreMapData';

/**
 * Merges boundary GeoJSON features with entity marker data from useExploreMapData.
 * Adds name, linkTo, color, etc. as properties and assigns numeric IDs
 * required by MapLibre's feature-state API.
 *
 * @param boundaries  Raw GeoJSON FeatureCollection (from R2 or DB)
 * @param markers     Entity markers from useExploreMapData
 * @param matchKey    Property name in GeoJSON features to match against marker meta
 *                    (e.g. 'ISO_A2' for countries matched via meta.code)
 */
/**
 * Match mode for enrichment:
 * - 'code': match GeoJSON feature property (matchKey) against marker.meta.code (countries)
 * - 'entityId': match GeoJSON feature property (matchKey) against marker.id (cities, villages)
 */
type MatchMode = 'code' | 'entityId';

export function enrichBoundaryFeatures(
  boundaries: GeoJSON.FeatureCollection,
  markers: MapMarker[],
  matchKey: string = 'ISO_A2',
  mode: MatchMode = 'code',
): GeoJSON.FeatureCollection {
  // Build lookup based on match mode
  const markerLookup = new Map<string, MapMarker>();
  for (const m of markers) {
    if (mode === 'code') {
      const code = m.meta?.code as string | undefined;
      if (code) markerLookup.set(code, m);
    } else {
      // entityId mode: strip prefix (e.g. "city-UUID" -> "UUID")
      const rawId = m.id.includes('-') ? m.id.slice(m.id.indexOf('-') + 1) : m.id;
      markerLookup.set(rawId, m);
    }
  }

  const features: GeoJSON.Feature[] = [];

  for (const feat of boundaries.features) {
    const matchValue = feat.properties?.[matchKey] as string | undefined;
    if (!matchValue) continue;

    const marker = markerLookup.get(matchValue);
    if (!marker) continue;

    features.push({
      ...feat,
      id: features.length + 1, // Numeric ID for feature-state
      properties: {
        entityId: marker.id,
        name: marker.name,
        subtitle: marker.subtitle ?? '',
        color: marker.color,
        linkTo: marker.linkTo ?? '',
        entityType: marker.type,
        precision: feat.properties?.precision ?? 'official',
        // Flatten meta for MapLibre property access
        ...Object.fromEntries(
          Object.entries(marker.meta ?? {}).map(([k, v]) => [
            `meta_${k}`,
            typeof v === 'object' ? JSON.stringify(v) : v,
          ]),
        ),
      },
    });
  }

  return { type: 'FeatureCollection', features };
}

/**
 * Generates an approximate circular polygon around a point.
 * Used as fallback when no official boundary data is available.
 */
export function generateCirclePolygon(
  lat: number,
  lng: number,
  radiusKm: number = 0.5,
  points: number = 32,
): GeoJSON.Polygon {
  const coords: [number, number][] = [];
  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * 2 * Math.PI;
    const dx = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180));
    const dy = radiusKm / 110.574;
    coords.push([lng + dx * Math.cos(angle), lat + dy * Math.sin(angle)]);
  }
  return { type: 'Polygon', coordinates: [coords] };
}
