/**
 * Drift guard: the edge-side locale list must equal the frontend's.
 *
 * Edge functions cannot import from `src/`, so `_shared/locales.ts` is a copy.
 * A copy that nobody compares is how `translate-i18n-batch` spent months
 * rejecting zh/ja/ko/ar while the dispatcher kept sending them — 60 of 150
 * targets 400-ing on every fire, invisible because the dispatcher never read
 * the response.
 *
 * The comparison is ORDER-INSENSITIVE but MEMBERSHIP-EXACT in both directions:
 * a locale added to one side and not the other fails, whichever side moved.
 */

import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  SUPPORTED_LOCALES,
  TRANSLATION_LOCALES,
  DEFAULT_LOCALE,
  isTranslationLocale,
} from './locales.ts'

const FRONTEND_SOURCE = new URL('../../../src/i18n/languages.ts', import.meta.url)

/** Parse `SUPPORTED_LOCALES = [...] as const` out of the frontend module. */
function parseFrontendLocales(src: string): string[] {
  const block = src.match(/export const SUPPORTED_LOCALES\s*=\s*\[([\s\S]*?)\]/)
  if (!block) throw new Error('SUPPORTED_LOCALES array not found in src/i18n/languages.ts')
  return [...block[1].matchAll(/'([a-z]{2})'/g)].map((m) => m[1])
}

Deno.test('edge locale list equals the frontend SUPPORTED_LOCALES', async () => {
  const src = await Deno.readTextFile(FRONTEND_SOURCE)
  const frontend = parseFrontendLocales(src)

  // Positive control. An empty or near-empty parse also satisfies "the two
  // sets agree" against a broken regex, which would turn this file green while
  // the drift went unchecked — the vacuous-assertion class.
  assert(
    frontend.length >= 5,
    `parsed only ${frontend.length} locales from languages.ts — the regex stopped matching`,
  )

  assertEquals(
    [...frontend].sort(),
    [...SUPPORTED_LOCALES].sort(),
    'src/i18n/languages.ts and supabase/functions/_shared/locales.ts disagree — ' +
      'update BOTH, not whichever one the failure points at',
  )
})

Deno.test('translation targets are every supported locale except the source', () => {
  assertEquals(
    [...TRANSLATION_LOCALES].sort(),
    SUPPORTED_LOCALES.filter((l) => l !== DEFAULT_LOCALE).sort(),
  )
  assert(!isTranslationLocale(DEFAULT_LOCALE), 'en must never be a translation target')
})

Deno.test('the four locales the old allowlist dropped are translatable', () => {
  // The regression this module exists for. Named individually rather than
  // asserted as a count, so a future edit that drops one is not masked by
  // another being added.
  for (const locale of ['zh', 'ja', 'ko', 'ar']) {
    assert(isTranslationLocale(locale), `${locale} must be a valid translation target`)
  }
})

Deno.test('retired locales with no UI are rejected', () => {
  // nl/pl/tr/uk/sv were in the pre-2026-09 allowlist. They have no UI strings,
  // no route and no targets row; accepting them writes data nothing can show.
  for (const locale of ['nl', 'pl', 'tr', 'uk', 'sv']) {
    assert(!isTranslationLocale(locale), `${locale} has no UI and must be rejected`)
  }
})
