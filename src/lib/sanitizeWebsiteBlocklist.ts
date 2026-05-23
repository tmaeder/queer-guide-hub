/**
 * Mirror of the Postgres `sanitize_website_field` trigger blocklist.
 * Keep in sync with supabase/migrations/00000000000000_baseline.sql.
 *
 * The trigger silently NULLs out matching URLs on venues, hotels,
 * marketplace_listings, personalities (website_url), queer_villages,
 * festivals — and a narrower list on events. We mirror the rule
 * client-side so inline edits fail loudly instead of vanishing.
 */

export const WEBSITE_BLOCKED_DOMAINS = [
  'wikipedia.org',
  'wikidata.org',
  'wikimedia.org',
  'gaytravel4u.com',
  'gaytravel4u.de',
  'spartacus.gayguide.travel',
  'tripadvisor.com',
  'tripadvisor.es',
  'tripadvisor.de',
  'tripadvisor.co.uk',
  'tripadvisor.fr',
  'tripadvisor.it',
  'eventbrite.com',
  'eventbrite.co.uk',
  'eventbrite.de',
  'yelp.com',
  'foursquare.com',
  'google.com/maps',
  'goo.gl/maps',
  'maps.google.com',
] as const;

export const EVENT_WEBSITE_BLOCKED_DOMAINS = [
  'gaytravel4u.com',
  'gaytravel4u.de',
  'spartacus.gayguide.travel',
  'tripadvisor.com',
] as const;

const TABLES_USING_FULL_BLOCKLIST = new Set([
  'venues',
  'hotels',
  'marketplace_listings',
  'personalities',
  'queer_villages',
  'festivals',
]);

const TABLES_USING_EVENT_BLOCKLIST = new Set(['events']);

/** Returns the matched blocked domain, or null if the URL is safe. */
export function matchBlockedDomain(url: string, table: string): string | null {
  if (!url) return null;
  const lower = url.toLowerCase();
  const list = TABLES_USING_EVENT_BLOCKLIST.has(table)
    ? EVENT_WEBSITE_BLOCKED_DOMAINS
    : TABLES_USING_FULL_BLOCKLIST.has(table)
      ? WEBSITE_BLOCKED_DOMAINS
      : [];
  for (const domain of list) {
    if (lower.includes(domain)) return domain;
  }
  return null;
}

/** Tables and field names that the trigger watches. */
export function isWebsiteField(table: string, field: string): boolean {
  if (table === 'personalities') return field === 'website_url';
  if (TABLES_USING_FULL_BLOCKLIST.has(table) || TABLES_USING_EVENT_BLOCKLIST.has(table)) {
    return field === 'website';
  }
  return false;
}
