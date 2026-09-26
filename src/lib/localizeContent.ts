/**
 * Read a translated value out of a `*_i18n` JSONB column.
 *
 * WHY THIS EXISTS (again). The `translate-i18n-batch` pipeline has been
 * writing `name_i18n` / `title_i18n` / `description_i18n` across ten entity
 * tables for months. Measured on prod 2026-09-19, NOTHING RENDERED ANY OF IT
 * except news titles (`newsTitle.ts`) and the kink taxonomy: a previous
 * `src/lib/localizeContent.ts` had been deleted, and the eight server-side
 * `*_localized_*` RPCs are granted to anon and called from nowhere — they
 * appear only in the generated `types.ts`. 35k translated rows, invisible.
 *
 * The fallback chain deliberately mirrors the SQL RPCs
 * (`venue_localized_name`, `event_localized_title`, …) so a row reads the same
 * whether it is resolved in Postgres or here:
 *
 *     requested locale  →  the `en` entry, if the map carries one  →  base column
 *
 * Note the middle rung is NOT the same as the base column. For marketplace
 * listings the pipeline stores the ORIGINAL German in `title_i18n.de` and
 * promotes the English translation into `title` (see `marketplace-translate`),
 * so `*_i18n.en` and the base column can legitimately differ. Preferring the
 * map's own `en` keeps that path consistent with the server.
 *
 * ## The `<Editable>` trap
 *
 * `<Editable>` renders its CHILDREN as the display value in both view and edit
 * mode; `value` only seeds the editor. So localize the children and leave
 * `value` pointing at the base column — a viewer sees their locale, an admin
 * still edits the English source of record. Localizing `value` instead would
 * have admins silently overwrite the English column with a translation.
 */

/** A row carrying a translation map alongside its base column. */
export type I18nMap = Record<string, string> | null | undefined;

/**
 * Normalise a UI locale to the key the pipeline writes: lowercase, primary
 * subtag only. i18next hands back `de-CH` / `pt_BR`; the columns are keyed
 * `de` / `pt`.
 */
export function contentLocaleKey(locale: string | null | undefined): string {
  return (locale || 'en').toLowerCase().split(/[-_]/)[0];
}

function pick(i18n: I18nMap, key: string): string | null {
  if (!i18n || typeof i18n !== 'object' || Array.isArray(i18n)) return null;
  const candidate = i18n[key];
  // A whitespace-only translation is absence, not content — the batch writer
  // has produced empty strings when a model returned nothing usable, and
  // rendering one blanks the field instead of falling back.
  if (typeof candidate === 'string' && candidate.trim() !== '') return candidate;
  return null;
}

/**
 * Resolve one field. `base` is the English source column, `i18n` its map.
 *
 * Returns `base` unchanged when there is no usable translation, so a caller
 * can substitute this at a render site without adding a null branch.
 */
export function localizedField(
  base: string | null | undefined,
  i18n: I18nMap,
  locale: string | null | undefined,
): string {
  const original = base ?? '';
  const key = contentLocaleKey(locale);
  if (key === 'en') return pick(i18n, 'en') ?? original;
  return pick(i18n, key) ?? pick(i18n, 'en') ?? original;
}

/**
 * Resolve several fields on one row at once, returning a shallow copy with the
 * base columns replaced by their localized values.
 *
 * `localizeEntity(venue, ['name', 'description'], lang)` reads `name_i18n` and
 * `description_i18n` by convention. Pass an explicit map when the column does
 * not follow it — `news_articles.description_i18n` is fed from `excerpt`, not
 * from a `description` column, which is exactly the kind of mismatch that
 * silently returns the base value forever if it is assumed instead of checked.
 */
export function localizeEntity<T extends Record<string, unknown>>(
  row: T | null | undefined,
  fields: readonly string[],
  locale: string | null | undefined,
  i18nColumnFor: (field: string) => string = (f) => `${f}_i18n`,
): T | null | undefined {
  if (!row) return row;
  const out = { ...row } as Record<string, unknown>;
  for (const field of fields) {
    const base = row[field];
    if (typeof base !== 'string' && base != null) continue;
    const map = row[i18nColumnFor(field)] as I18nMap;
    if (!map) continue;
    out[field] = localizedField(base as string | null | undefined, map, locale);
  }
  return out as T;
}

/**
 * True when a translation exists for this locale — for surfaces that want to
 * say so (a "translated" affordance, or a reason to suppress a language badge).
 * Deliberately NOT the same as "the rendered string differs from English": a
 * translation can legitimately equal the source (proper nouns, "OK").
 */
export function hasTranslation(i18n: I18nMap, locale: string | null | undefined): boolean {
  return pick(i18n, contentLocaleKey(locale)) !== null;
}
