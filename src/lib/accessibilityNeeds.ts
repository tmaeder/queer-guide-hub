/**
 * Bridges the user's saved accessibility needs (profiles.travel_preferences
 * .accessibility_needs — category values like "wheelchair") to the controlled
 * accessibility vocabulary slugs stored on venues/hotels
 * (accessibility_attributes[], amenities-table kind='accessibility').
 */

export const NEED_TO_SLUGS: Record<string, string[]> = {
  wheelchair: [
    'wheelchair-accessible',
    'step-free-entrance',
    'accessible-restroom',
    'accessible-parking',
    'wide-doorways',
  ],
  mobility: [
    'step-free-entrance',
    'wheelchair-accessible',
    'accessible-parking',
    'wide-doorways',
  ],
  hearing: ['hearing-loop'],
  visual: ['braille-menu'],
  sensory: [],
};

const NEED_LABEL: Record<string, string> = {
  wheelchair: 'Wheelchair access',
  mobility: 'Step-free access',
  hearing: 'Hearing support',
  visual: 'Visual support',
  sensory: 'Low-sensory space',
};

export function needLabel(need: string): string {
  return NEED_LABEL[need] ?? need.replace(/[-_]/g, ' ');
}

/** Slugs that satisfy a need; a raw vocab slug passes through unchanged. */
export function slugsForNeed(need: string): string[] {
  return NEED_TO_SLUGS[need] ?? [need];
}

export interface NeedMatch {
  need: string;
  /** vocab slugs on this venue that satisfy the need */
  matchedSlugs: string[];
}

/**
 * Splits the user's needs into matched (venue lists a satisfying attribute)
 * and unlisted (honest absence of data — NOT a "no").
 */
export function matchNeeds(
  needs: string[],
  venueAccessibility: string[],
): { matched: NeedMatch[]; unlisted: string[] } {
  const have = new Set(venueAccessibility);
  const matched: NeedMatch[] = [];
  const unlisted: string[] = [];
  for (const need of needs) {
    const hits = slugsForNeed(need).filter((s) => have.has(s));
    if (hits.length > 0) matched.push({ need, matchedSlugs: hits });
    else unlisted.push(need);
  }
  return { matched, unlisted };
}
