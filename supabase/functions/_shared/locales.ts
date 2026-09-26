/**
 * Locale vocabulary for edge functions — the single source of truth on the
 * Deno side.
 *
 * WHY THIS FILE EXISTS. The locale list was declared in four places and two of
 * them drifted. `translate-i18n-batch` carried a hardcoded set left over from
 * the pipeline's first shape (`de fr es it pt nl pl ru tr uk sv`) while the
 * dispatcher seeded the frontend's set (`de fr es it pt ru zh ja ko ar`).
 * Measured on prod 2026-09-19: 60 of 150 dispatch targets returned 400 on
 * every fire — zh/ja/ko/ar had never been translatable at all — and because
 * `run_i18n_translation_dispatch` fires `net.http_post` without reading the
 * response, `last_run_at` still advanced and the cron reported `succeeded`
 * 5,562 times out of 5,562. Coverage told the story: 12k-16k rows per European
 * locale against 250-1,100 for the four that 400'd, and 0 venue descriptions in
 * any of them.
 *
 * Edge functions cannot import from `src/`, so this list is a COPY by
 * necessity. It is kept honest by `locales.test.ts`, which parses
 * `src/i18n/languages.ts` and fails on disagreement in either direction — do
 * not "fix" a drift failure by editing only one side.
 *
 * nl/pl/tr/uk/sv were in the old set and are deliberately NOT here: no UI
 * strings, no `i18n_translation_targets` rows, no route. A request for one now
 * 400s, which is correct — it would write a translation nothing can display.
 */

/** Every locale the site serves, English included. Mirrors SUPPORTED_LOCALES. */
export const SUPPORTED_LOCALES = [
  'en', 'es', 'fr', 'de', 'pt', 'it', 'ru', 'zh', 'ja', 'ko', 'ar',
] as const

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]

/** Source language. Never a translation target — en->en is not work. */
export const DEFAULT_LOCALE: SupportedLocale = 'en'

/**
 * Valid targets for the translation pipeline: every supported locale except
 * the source. Derived, never retyped — the two lists cannot disagree.
 */
export const TRANSLATION_LOCALES: readonly string[] = SUPPORTED_LOCALES.filter(
  (l) => l !== DEFAULT_LOCALE,
)

export function isSupportedLocale(value: string): value is SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value)
}

/** True for a locale the pipeline may write into a `*_i18n` column. */
export function isTranslationLocale(value: string): boolean {
  return TRANSLATION_LOCALES.includes(value)
}
