/**
 * Bridges a user's followed interests (profiles.interests — tag slugs/names) to
 * an entity's own tags. Mirrors the accessibility `matchNeeds` idea: a positive
 * match is a signal we surface; a non-match is silent (no "doesn't fit you").
 */

function norm(s: string): string {
  return s.toLowerCase().trim().replace(/[\s_]+/g, '-');
}

export function humanizeInterest(s: string): string {
  return s.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Coerce the loose `profiles.interests` jsonb into a clean string list. */
export function readInterests(interests: unknown): string[] {
  return Array.isArray(interests)
    ? interests.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    : [];
}

/**
 * Returns the user interests that this entity's tags satisfy (deduped, original
 * label preserved for display). Empty when there's no overlap.
 */
export function matchInterests(entityTags: string[], userInterests: string[]): string[] {
  const have = new Set(entityTags.map(norm));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const interest of userInterests) {
    const n = norm(interest);
    if (have.has(n) && !seen.has(n)) {
      seen.add(n);
      out.push(interest);
    }
  }
  return out;
}
