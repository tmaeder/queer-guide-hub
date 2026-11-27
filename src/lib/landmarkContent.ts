/**
 * Minimum useful content for a landmark page.
 *
 * A landmark earns a full page when it tells the reader either why it matters
 * (a description) or where it is (an address or coordinates). With neither,
 * the page is a name and a category badge, so it renders an honest
 * incomplete-entry state instead of an empty panel. Measured 2026-11-27: all
 * six landmarks in `geo_places` fail this, and all six are seo_indexable.
 */
export interface LandmarkContentInput {
  description?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  address?: string | null;
  website?: string | null;
  accessibility_notes?: string | null;
}

export type LandmarkGap = 'significance' | 'location';

const filled = (v: unknown) => typeof v === 'string' && v.trim().length > 0;

export function hasCoordinates(p: LandmarkContentInput): boolean {
  return (
    p.latitude != null &&
    p.longitude != null &&
    p.latitude !== '' &&
    p.longitude !== '' &&
    Number.isFinite(Number(p.latitude)) &&
    Number.isFinite(Number(p.longitude))
  );
}

/** What a visitor would need and the record does not have. */
export function landmarkGaps(p: LandmarkContentInput): LandmarkGap[] {
  const gaps: LandmarkGap[] = [];
  if (!filled(p.description)) gaps.push('significance');
  if (!filled(p.address) && !hasCoordinates(p)) gaps.push('location');
  return gaps;
}

/** Publishable: says why it matters OR where it is. */
export function landmarkIsUseful(p: LandmarkContentInput): boolean {
  return landmarkGaps(p).length < 2;
}

/** Anything at all for the detail panel below the hero. */
export function landmarkHasOverview(p: LandmarkContentInput): boolean {
  return filled(p.website) || filled(p.accessibility_notes) || hasCoordinates(p);
}
