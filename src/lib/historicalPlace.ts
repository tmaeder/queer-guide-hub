export interface HistoricalNameEntry {
  name_de: string;
  name_en: string;
  country_name_de: string;
  country_name_en: string;
  country_code: string;
  valid_from: string;
  valid_to: string;
  region?: string;
}

export interface ResolveHistoricalPlaceArgs {
  historicalNames?: HistoricalNameEntry[] | null;
  rawPlace?: string | null;
  birthDate?: string | null;
  currentName?: string | null;
  currentNameDe?: string | null;
  currentNameEn?: string | null;
  currentCountry?: string | null;
  locale?: 'de' | 'en';
}

export interface ResolvedPlace {
  name: string | null;
  country: string | null;
  historical: boolean;
}

function pick(entry: HistoricalNameEntry, locale: 'de' | 'en'): ResolvedPlace {
  const name = locale === 'en' ? entry.name_en || entry.name_de : entry.name_de || entry.name_en;
  const country =
    locale === 'en'
      ? entry.country_name_en || entry.country_name_de
      : entry.country_name_de || entry.country_name_en;
  return { name: name || null, country: country || null, historical: true };
}

function withinInterval(date: Date, entry: HistoricalNameEntry): boolean {
  const from = new Date(entry.valid_from);
  const to = new Date(entry.valid_to);
  return date >= from && date <= to;
}

/**
 * Mirror of SQL `resolve_historical_place()` for client-side rendering.
 * Resolution order:
 *   1. Exact-name match constrained by birth date validity
 *   2. Date-interval match (skips regional entries that need explicit name)
 *   3. Current city + country (today's value)
 */
export function resolveHistoricalPlace(args: ResolveHistoricalPlaceArgs): ResolvedPlace {
  const locale: 'de' | 'en' = args.locale === 'en' ? 'en' : 'de';
  const entries = Array.isArray(args.historicalNames) ? args.historicalNames : [];
  const raw = args.rawPlace?.trim() ?? '';
  const date = args.birthDate ? new Date(args.birthDate) : null;

  if (raw && entries.length > 0) {
    const needle = raw.toLowerCase();
    for (const e of entries) {
      const nameMatches =
        needle === (e.name_de || '').toLowerCase() ||
        needle === (e.name_en || '').toLowerCase();
      if (!nameMatches) continue;
      if (date && !withinInterval(date, e)) continue;
      return pick(e, locale);
    }
  }

  if (date && entries.length > 0) {
    for (const e of entries) {
      if (e.region) continue;
      if (withinInterval(date, e)) return pick(e, locale);
    }
  }

  const currentName =
    (locale === 'en' ? args.currentNameEn : args.currentNameDe) ||
    args.currentName ||
    args.rawPlace ||
    null;
  return {
    name: currentName,
    country: args.currentCountry ?? null,
    historical: false,
  };
}
