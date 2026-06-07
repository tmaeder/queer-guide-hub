/**
 * Content localization — resolves the per-entity translation JSONB columns
 * (`name_i18n`, `title_i18n`, `description_i18n`, …) populated by the
 * `translate-i18n-batch` edge function down to a single string for the active
 * UI locale, with English-base fallback.
 *
 * The DB stores `{ "<locale>": "<translated text>" }` keyed by the same 2-letter
 * codes as SUPPORTED_LOCALES. English is the base column itself (en is never a
 * key), so for the default locale we always return the base value.
 *
 * Usage in a component:
 *   const lang = useContentLang();
 *   <h1>{localizedField(venue, 'name', lang)}</h1>
 *   <p>{localizedField(venue, 'description', lang)}</p>
 */
import { useTranslation } from 'react-i18next';
import { DEFAULT_LOCALE, isSupportedLocale } from '@/i18n/languages';

type I18nMap = Record<string, unknown> | null | undefined;

/** Normalize an i18next language tag (e.g. `de-DE`) to a supported 2-letter code. */
export function normalizeContentLang(lang: string | null | undefined): string {
  const base = (lang ?? DEFAULT_LOCALE).toLowerCase().split('-')[0];
  return isSupportedLocale(base) ? base : DEFAULT_LOCALE;
}

/**
 * Pick the localized value from an i18n JSONB map, falling back to the English
 * base string. Safe against null/non-object maps and non-string slots.
 */
export function pickLocalized(
  i18nMap: I18nMap,
  base: string | null | undefined,
  lang: string,
): string {
  const normalized = normalizeContentLang(lang);
  if (normalized !== DEFAULT_LOCALE && i18nMap && typeof i18nMap === 'object') {
    const value = (i18nMap as Record<string, unknown>)[normalized];
    if (typeof value === 'string' && value.trim() !== '') return value;
  }
  return base ?? '';
}

/**
 * Resolve `<field>` on an entity to its localized value, reading the sibling
 * `<field>_i18n` JSONB column. Returns the base value when no translation
 * exists for `lang`.
 */
export function localizedField(
  entity: Record<string, unknown> | null | undefined,
  field: string,
  lang: string,
): string {
  if (!entity) return '';
  return pickLocalized(entity[`${field}_i18n`] as I18nMap, entity[field] as string, lang);
}

/**
 * Return a shallow clone of `entity` with the given base fields overwritten by
 * their localized values. Lets a data hook localize rows once so every consumer
 * that reads `entity.name` gets the translated text for free.
 */
export function localizeEntity<T extends Record<string, unknown>>(
  entity: T | null | undefined,
  fields: readonly string[],
  lang: string,
): T {
  if (!entity) return entity as T;
  const normalized = normalizeContentLang(lang);
  if (normalized === DEFAULT_LOCALE) return entity;
  let next: T | null = null;
  for (const field of fields) {
    const localized = pickLocalized(
      entity[`${field}_i18n`] as I18nMap,
      entity[field] as string,
      normalized,
    );
    if (localized && localized !== entity[field]) {
      if (!next) next = { ...entity };
      (next as Record<string, unknown>)[field] = localized;
    }
  }
  return next ?? entity;
}

/** Hook returning the active content locale (normalized 2-letter code). */
export function useContentLang(): string {
  const { i18n } = useTranslation();
  return normalizeContentLang(i18n.resolvedLanguage || i18n.language);
}
