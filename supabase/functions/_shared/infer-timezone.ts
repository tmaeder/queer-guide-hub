/**
 * inferTimezone — Deno port of the city/country-to-timezone heuristic in
 * scraper/src/utils/dates.ts. Used by edge functions that produce events
 * (bulk-scrape-events, …) to populate events.timezone before staging.
 *
 * Conscious duplication: the scraper package is Node, edge functions are
 * Deno. The map is small, pure, and slow-changing — keeping a copy here
 * avoids cross-runtime build plumbing for what is effectively a constant.
 * If the map grows or diverges, the source of truth is the scraper copy
 * and this file should be updated in the same PR.
 *
 * Returns 'UTC' when no key matches — the same fallback the scraper uses.
 */

const TZ_MAP: Record<string, string> = {
  'united states': 'America/New_York',
  'usa': 'America/New_York',
  'united kingdom': 'Europe/London',
  'uk': 'Europe/London',
  'london': 'Europe/London',
  'france': 'Europe/Paris',
  'paris': 'Europe/Paris',
  'germany': 'Europe/Berlin',
  'berlin': 'Europe/Berlin',
  'spain': 'Europe/Madrid',
  'madrid': 'Europe/Madrid',
  'barcelona': 'Europe/Madrid',
  'italy': 'Europe/Rome',
  'rome': 'Europe/Rome',
  'netherlands': 'Europe/Amsterdam',
  'amsterdam': 'Europe/Amsterdam',
  'australia': 'Australia/Sydney',
  'sydney': 'Australia/Sydney',
  'canada': 'America/Toronto',
  'toronto': 'America/Toronto',
  'japan': 'Asia/Tokyo',
  'tokyo': 'Asia/Tokyo',
  'brazil': 'America/Sao_Paulo',
  'thailand': 'Asia/Bangkok',
  'bangkok': 'Asia/Bangkok',
  'new york': 'America/New_York',
  'los angeles': 'America/Los_Angeles',
  'san francisco': 'America/Los_Angeles',
  'chicago': 'America/Chicago',
};

export function inferTimezone(city?: string | null, country?: string | null): string {
  const loc = `${city ?? ''} ${country ?? ''}`.toLowerCase();
  for (const [key, tz] of Object.entries(TZ_MAP)) {
    if (loc.includes(key)) return tz;
  }
  return 'UTC';
}
