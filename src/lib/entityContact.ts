import { normalizeSocialLinks } from '@/lib/social/registry';

/**
 * True when a social-links jsonb holds at least one usable profile URL. Shared
 * by the venue and organisation pages so a section's `when` guard and its
 * component's own null-return agree: a record whose only contact data is
 * Facebook/Instagram/X must still get a "Location & contact" section.
 */
export function hasSocialLinks(links: unknown): boolean {
  if (!links || typeof links !== 'object' || Array.isArray(links)) return false;
  return Object.keys(normalizeSocialLinks(links as Record<string, unknown>)).length > 0;
}

/** A website URL as a reader wants to see it: no scheme, no trailing slash. */
export function displayWebsite(url: string): string {
  return url.replace(/^https?:\/\//i, '').replace(/\/$/, '');
}
