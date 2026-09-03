import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { tagSlug, TAG_DEACCENT_TABLE } from './slug.ts'

// `tagSlug` lives in ./slug.ts, not ./index.ts, because importing index.ts runs
// Deno.serve() at module load and would leave a listener open for the whole
// test run.

// Every expectation below was produced by running the same input through
// public.normalize_tag_slug on prod (project xqeacpakadqfxjxjcewc, 2026-09-02)
// — they are recorded observations, not derivations from the TS.

Deno.test('tagSlug transliterates non-ASCII rather than dropping it', () => {
  // These six are the live incident: German section headings scraped off a
  // Zurich site, whose old slugs were b-hne / preistr-ger / nonbin-r.
  assertEquals(tagSlug('Bühne'), 'buhne')
  assertEquals(tagSlug('Preisträger'), 'preistrager')
  assertEquals(tagSlug('Fußball'), 'fussball')
  assertEquals(tagSlug('Café'), 'cafe')
  assertEquals(tagSlug('Nonbinär'), 'nonbinar')
  assertEquals(tagSlug('München'), 'munchen')
})

Deno.test('tagSlug leaves ASCII alone', () => {
  assertEquals(tagSlug('Drag Queen'), 'drag-queen')
  assertEquals(tagSlug('HIV/AIDS'), 'hiv-aids')
  assertEquals(tagSlug('Ü30'), 'u30')
  assertEquals(tagSlug('lgbtiq'), 'lgbtiq')
  assertEquals(tagSlug('mat-silicone'), 'mat-silicone')
})

Deno.test('tagSlug strips leading and trailing hyphens', () => {
  assertEquals(tagSlug('  spaced  '), 'spaced')
  assertEquals(tagSlug('---'), '')
  assertEquals(tagSlug('!!!Pride!!!'), 'pride')
  assertEquals(tagSlug('- Bar -'), 'bar')
  assertEquals(tagSlug(''), '')
})

Deno.test('tagSlug matches the database on letters NFKD cannot decompose', () => {
  // The reason this is a port of tag_deaccent and not `.normalize('NFKD')`:
  // none of these carry a combining mark, so NFKD leaves them intact and the
  // character class turns each into '-'. The slug is the dedupe key, so
  // `n-rrebro` vs `norrebro` means a proposal silently fails to match its tag.
  assertEquals(tagSlug('Nørrebro'), 'norrebro')
  assertEquals(tagSlug('Łódź'), 'lodz')
  assertEquals(tagSlug('Æther'), 'aether')
  assertEquals(tagSlug('Œuvre'), 'oeuvre')
  assertEquals(tagSlug('Þór'), 'thor')
  assertEquals(tagSlug('Ðavid'), 'david')
  assertEquals(tagSlug('Ħamrun'), 'hamrun')
  assertEquals(tagSlug('Đông'), 'dong')
  assertEquals(tagSlug('ıstanbul'), 'istanbul')
})

Deno.test('tagSlug drops what the database drops', () => {
  // The other direction: NFKD is a COMPATIBILITY decomposition and would fold
  // these to `finale` / `cafe2`, where tag_deaccent — having no such character
  // in its translate table — yields '-'. Matching the database matters more
  // than matching intuition.
  assertEquals(tagSlug('ﬁnale'), 'nale')
  assertEquals(tagSlug('Café²'), 'cafe')
  // Vietnamese ệ is not in the translate table either.
  assertEquals(tagSlug('Việt'), 'vi-t')
})

Deno.test('the deaccent translate table halves stay aligned', () => {
  // translate() pairs by position. If a character is added to one half and not
  // the other, Postgres silently DELETES the surplus source characters and this
  // port silently returns undefined — the one way the copy can rot unnoticed.
  assertEquals([...TAG_DEACCENT_TABLE.from].length, [...TAG_DEACCENT_TABLE.to].length)
})
