/**
 * Shared geospatial utilities.
 */

/** Haversine distance in km between two lat/lng points. */
export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Normalize common country name variants, 2-letter codes, and demonyms. */
export const COUNTRY_ALIASES: Record<string, string> = {
  us: 'United States', usa: 'United States', 'united states of america': 'United States',
  gb: 'United Kingdom', uk: 'United Kingdom', 'great britain': 'United Kingdom',
  england: 'United Kingdom', scotland: 'United Kingdom', wales: 'United Kingdom',
  de: 'Germany', fr: 'France', es: 'Spain', it: 'Italy',
  nl: 'Netherlands', holland: 'Netherlands', 'the netherlands': 'Netherlands',
  ch: 'Switzerland', at: 'Austria', au: 'Australia', ca: 'Canada',
  br: 'Brazil', mx: 'Mexico', jp: 'Japan', za: 'South Africa',
  nz: 'New Zealand', il: 'Israel', th: 'Thailand', pt: 'Portugal',
  be: 'Belgium', se: 'Sweden', dk: 'Denmark', no: 'Norway', fi: 'Finland',
  ie: 'Ireland', cz: 'Czech Republic', czechia: 'Czech Republic',
  tw: 'Taiwan', ar: 'Argentina', co: 'Colombia', cl: 'Chile', pe: 'Peru',
  in: 'India', cn: 'China', kr: 'South Korea', ru: 'Russia',
  tr: 'Turkey', gr: 'Greece', pl: 'Poland', ro: 'Romania', hu: 'Hungary',
  ph: 'Philippines', id: 'Indonesia', ng: 'Nigeria', ke: 'Kenya',
  eg: 'Egypt', ma: 'Morocco',
  // Demonyms
  american: 'United States', british: 'United Kingdom', german: 'Germany',
  french: 'France', spanish: 'Spain', italian: 'Italy', dutch: 'Netherlands',
  swiss: 'Switzerland', austrian: 'Austria', australian: 'Australia',
  canadian: 'Canada', brazilian: 'Brazil', mexican: 'Mexico', japanese: 'Japan',
  irish: 'Ireland', swedish: 'Sweden', danish: 'Denmark', norwegian: 'Norway',
  finnish: 'Finland', polish: 'Poland', greek: 'Greece', turkish: 'Turkey',
  russian: 'Russia', indian: 'India', chinese: 'China', korean: 'South Korea',
};

/** Resolve a raw country name string to its canonical form. */
export function resolveCountryName(raw: string): string {
  return COUNTRY_ALIASES[raw.trim().toLowerCase()] || raw.trim();
}

/** Clean HTML entities from content text. */
export function cleanContentText(raw: string): string {
  if (!raw) return '';
  let text = raw;
  text = text
    .replace(/&#8217;|&#x2019;/g, '\u2019')
    .replace(/&#8216;|&#x2018;/g, '\u2018')
    .replace(/&#8220;|&#x201C;/g, '\u201C')
    .replace(/&#8221;|&#x201D;/g, '\u201D')
    .replace(/&#8230;|&#x2026;/g, '\u2026')
    .replace(/&#8211;|&#x2013;/g, '\u2013')
    .replace(/&#8212;|&#x2014;/g, '\u2014')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/\u00A0/g, ' ')
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(parseInt(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, code) => String.fromCharCode(parseInt(code, 16)));
  text = text.replace(/\n*The post\s.+appeared first on\s.+\.?\s*$/i, '');
  text = text.replace(/\s*…?\s*Continue reading\s.+[→\u2192]?\s*$/i, '');
  text = text
    .split('\n')
    .map((l) => l.trim())
    .join('\n');
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}
