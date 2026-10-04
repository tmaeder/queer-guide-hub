import type { PointFeature } from '@/hooks/useViewportPoints';
import { ENTITY_BULLET, lineFor, type MapStation } from './mapDomain';

/**
 * Flattened, render-ready view of a map point — consumed by the rich popup
 * card, the hover preview, and the departures board. Built once from a GeoJSON
 * feature so the UI layers don't each re-parse the `meta` JSON blob.
 *
 * @deprecated Prefer `MapStation` from `./mapDomain`, which this now aliases.
 * The interface moved there so a station has ONE shape across viewport
 * discovery, search results, trip stops and route stops — a parallel type was
 * the alternative, and two types that must agree eventually don't. The alias
 * keeps the ~10 existing readers unedited.
 */
export type MapPointSummary = MapStation;

function parseMeta(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'string' || !raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Build a MapStation from a clustered-source GeoJSON point feature. */
export function summaryFromFeature(f: PointFeature): MapStation {
  const p = f.properties;
  const meta = parseMeta(p.meta);
  const [lng, lat] = f.geometry.coordinates;
  const category = typeof meta.category === 'string' ? meta.category : undefined;
  return {
    id: String(p.id),
    type: p.pointType,
    // Derived here rather than read off the feature: the producer does not tag
    // `line` yet, and the GL-expression side (cluster aggregates, the render
    // filter) is what actually needs it ON the feature, since a MapLibre
    // expression cannot call into JS. Until then every JS consumer — popup,
    // hover card, departures board — gets a correctly-lined station for free.
    entity: ENTITY_BULLET[p.pointType],
    line: lineFor(p.pointType, category),
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
    category,
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
