type JsonMap = Record<string, unknown>;

export interface CountryEditorialInput {
  name: string;
  name_i18n?: unknown;
  description: string | null;
  description_i18n?: unknown;
  editorial_hook: string | null;
  enrichment_status?: unknown;
}

function asMap(value: unknown): JsonMap {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonMap)
    : {};
}

/** BCP-47 fallback: exact locale, base language, then the English source. */
export function localizedCountryField(
  source: string | null,
  translations: unknown,
  locale: string | undefined,
): string | null {
  const map = asMap(translations);
  const normalized = (locale ?? 'en').replace('_', '-');
  const candidates = [normalized, normalized.split('-')[0], 'en'];
  for (const candidate of candidates) {
    const value = map[candidate];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return source?.trim() || null;
}

export function countryEditorialState(country: CountryEditorialInput): string | null {
  const status = asMap(country.enrichment_status);
  const editorial = asMap(status.editorial);
  return typeof editorial.state === 'string' ? editorial.state : null;
}

/** Public prose is deliberately fail-closed: only an explicit publish action exposes it. */
export function publishedCountryEditorial(
  country: CountryEditorialInput,
  locale: string | undefined,
): { name: string; hook: string | null; description: string | null; published: boolean } {
  const name = localizedCountryField(country.name, country.name_i18n, locale) ?? country.name;
  const published = countryEditorialState(country) === 'published';
  return {
    name,
    published,
    hook: published ? country.editorial_hook?.trim() || null : null,
    description: published
      ? localizedCountryField(country.description, country.description_i18n, locale)
      : null,
  };
}
