import type { VenueListItem } from '@/api/venues';

export interface VenueFeatureProps {
  slug: string;
  name: string;
  category: string;
  featured: boolean;
}

/**
 * Venues → a GeoJSON FeatureCollection for a clustered native source.
 * Pins are GL features, never React views: per-pin views are what makes a
 * map stutter on mid-range Android.
 */
export function venuesToGeoJSON(
  venues: VenueListItem[],
): GeoJSON.FeatureCollection<GeoJSON.Point, VenueFeatureProps> {
  return {
    type: 'FeatureCollection',
    features: venues
      .filter(
        (v) =>
          typeof v.latitude === 'number' &&
          typeof v.longitude === 'number' &&
          Math.abs(v.latitude) <= 90 &&
          Math.abs(v.longitude) <= 180,
      )
      .map((v) => ({
        type: 'Feature',
        id: v.id,
        geometry: { type: 'Point', coordinates: [v.longitude!, v.latitude!] },
        properties: { slug: v.slug, name: v.name, category: v.category, featured: v.is_featured },
      })),
  };
}
