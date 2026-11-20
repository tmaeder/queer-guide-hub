// Relative imports: functions/ (the edge preload) reads this file and has no
// `@/` path alias.
import { isValidImageUrl } from '../../lib/images/resolveEntityImage';
import { venueClosureLabel } from '../../lib/venueClosureLabel';

/**
 * Which featured venues the /venues hero may show, and which photo it shows.
 * Shared by VenuesHero and the edge preload, so both pick the same image.
 */
export interface VenueHeroCandidate {
  id: string;
  images?: string[] | null;
  safety_gated?: boolean | null;
  closure_status?: string | null;
  closed_at?: string | null;
}

export function isVenueHeroEligible(v: VenueHeroCandidate): boolean {
  return !v.safety_gated && !venueClosureLabel(v) && Boolean(v.images?.some(isValidImageUrl));
}

export function venueHeroPhoto(v: Pick<VenueHeroCandidate, 'images'>): string | undefined {
  return v.images?.find(isValidImageUrl);
}
