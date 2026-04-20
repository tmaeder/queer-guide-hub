/**
 * Display helper for city names. The DB `cities.name` column is a single
 * string and mixes English/native spellings (e.g. "Zurich" vs "Zürich").
 * This is a frontend-only stopgap canonicalization until we add
 * `name_en` / `name_de` columns in a follow-up.
 */

const CITY_ALIASES: Record<string, { en: string; de: string }> = {
  zurich: { en: 'Zurich', de: 'Zürich' },
  zürich: { en: 'Zurich', de: 'Zürich' },
  munich: { en: 'Munich', de: 'München' },
  münchen: { en: 'Munich', de: 'München' },
  cologne: { en: 'Cologne', de: 'Köln' },
  köln: { en: 'Cologne', de: 'Köln' },
  vienna: { en: 'Vienna', de: 'Wien' },
  wien: { en: 'Vienna', de: 'Wien' },
  geneva: { en: 'Geneva', de: 'Genf' },
  genf: { en: 'Geneva', de: 'Genf' },
};

export function displayCityName(raw: string | null | undefined, language: string | null | undefined): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const key = trimmed.toLowerCase();
  const alias = CITY_ALIASES[key];
  if (!alias) return trimmed;
  const base = (language ?? 'en').toLowerCase().split(/[-_]/)[0];
  return base === 'de' ? alias.de : alias.en;
}
