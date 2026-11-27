import { normalizeSocialLinks } from '@/lib/social/registry';
import { trimTrailingSlashes } from '@/lib/trimTrailingSlashes';

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
  return trimTrailingSlashes(url.replace(/^https?:\/\//i, ''));
}

const EMAIL_RE = /^[^@\s<>()"',;:]+@[^@\s<>()"',;:]+\.[a-z]{2,}$/i;

/**
 * A stored contact email as something safe to put behind `mailto:`.
 *
 * Imported rows carry two mechanical artifacts: a leading `mailto:` and a
 * trailing `mailto` glued onto the address by a scraper that read the link
 * text and its href as one string (`info@queerbooks.chmailto`, ~1,700 venue
 * and organisation rows on 2026-11-27). Those are stripped because the
 * address underneath is unambiguous. Anything else that is not a valid
 * address returns null: a guessed recipient is worse than no email link.
 */
export function contactEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let value = raw.trim().replace(/^mailto:/i, '');
  // No real TLD ends in "mailto", and `…chmailto` would otherwise pass the
  // address pattern as a TLD of its own.
  const stripped = value.replace(/mailto$/i, '');
  if (stripped !== value && EMAIL_RE.test(stripped)) value = stripped;
  value = value.trim();
  return EMAIL_RE.test(value) ? value : null;
}
