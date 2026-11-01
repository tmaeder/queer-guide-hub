import type { EventListItem } from '@/api/events';

/** Events → GeoJSON for the same clustered source the venue layer uses. */
export function eventsToGeoJSON(events: EventListItem[]): GeoJSON.FeatureCollection<GeoJSON.Point, { slug: string; name: string }> {
  return {
    type: 'FeatureCollection',
    features: events
      .filter(
        (e) =>
          typeof e.latitude === 'number' &&
          typeof e.longitude === 'number' &&
          Math.abs(e.latitude) <= 90 &&
          Math.abs(e.longitude) <= 180,
      )
      .map((e) => ({
        type: 'Feature',
        id: e.id,
        geometry: { type: 'Point', coordinates: [e.longitude!, e.latitude!] },
        properties: { slug: e.slug, name: e.title },
      })),
  };
}
