import type { LayerType } from '@/hooks/useExploreMapData';
import type { PointFeature } from '@/hooks/useViewportPoints';

/**
 * Flattened, render-ready view of a map point — consumed by the rich popup
 * card, the hover preview, and the spotlight rail. Built once from a GeoJSON
 * feature so the UI layers don't each re-parse the `meta` JSON blob.
 */
export interface MapPointSummary {
  id: string;
  type: LayerType;
  name: string;
  subtitle?: string;
  lng: number;
  lat: number;
  linkTo?: string;
  color: string;
  featured: boolean;
  live: boolean;
  image?: string;
  /** R2-mirrored optimized copy (always reachable) — preferred over `image`. */
  optimizedImage?: string;
  /** R2-mirrored thumbnail copy. */
  thumbImage?: string;
  /** True when `image` is a brand logo — render contained, not cropped. */
  isLogo?: boolean;
  category?: string;
  city?: string;
  openNow?: boolean | null;
  priceRange?: number | null;
  startDate?: string;
  venueName?: string;
  trustScore?: number;
  /** Going-count for events (social proof). */
  attendeeCount?: number;
  /** Distance from the viewer in km, filled in by the consumer when known. */
  distanceKm?: number;
  /** True when this point is in the viewer's saved set (favorites layer). */
  favorited?: boolean;
}

function parseMeta(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'string' || !raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Build a MapPointSummary from a clustered-source GeoJSON point feature. */
export function summaryFromFeature(f: PointFeature): MapPointSummary {
  const p = f.properties;
  const meta = parseMeta(p.meta);
  const [lng, lat] = f.geometry.coordinates;
  return {
    id: String(p.id),
    type: p.pointType,
    name: p.name || 'Untitled',
    subtitle: p.subtitle || undefined,
    lng,
    lat,
    linkTo: p.linkTo || undefined,
    color: p.color,
    featured: Boolean(p.featured),
    live: Boolean(p.live),
    image: typeof meta.image === 'string' ? meta.image : undefined,
    optimizedImage: typeof meta.optimizedImage === 'string' ? meta.optimizedImage : undefined,
    thumbImage: typeof meta.thumbImage === 'string' ? meta.thumbImage : undefined,
    isLogo: meta.isLogo === true,
    category: typeof meta.category === 'string' ? meta.category : undefined,
    city: typeof meta.city === 'string' ? meta.city : undefined,
    openNow: typeof meta.openNow === 'boolean' ? meta.openNow : null,
    priceRange: typeof meta.priceRange === 'number' ? meta.priceRange : null,
    startDate: typeof meta.startDate === 'string' ? meta.startDate : undefined,
    venueName: typeof meta.venueName === 'string' ? meta.venueName : undefined,
    trustScore: typeof meta.trustScore === 'number' ? meta.trustScore : undefined,
    attendeeCount: typeof meta.attendeeCount === 'number' ? meta.attendeeCount : undefined,
    favorited: Boolean(p.favorited),
  };
}
