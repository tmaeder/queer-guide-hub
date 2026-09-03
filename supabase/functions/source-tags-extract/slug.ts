// Tag slug derivation — a faithful port of public.normalize_tag_slug /
// public.tag_deaccent (see 20260802104650, re-verified against
// pg_get_functiondef on prod 2026-09-02).
//
// This lives in its own module, not in index.ts, so the unit test can import it
// without executing `Deno.serve(...)` at module load.
//
// WHY NOT `.normalize('NFKD')`. The obvious transliteration — NFKD then strip
// combining marks — agrees with the database on every accented Latin letter but
// disagrees in both directions on the rest, and the slug is the dedupe key, so a
// disagreement means a proposal silently fails to match an existing tag:
//   * NFKD does NOT decompose ø ł đ ħ ŧ ı æ œ þ ð (no combining mark to strip),
//     so it yields '-' where tag_deaccent yields o l d h t i ae oe th d. A
//     proposal for "Nørrebro" would be filed as `n-rrebro` while the tag reads
//     `norrebro`.
//   * NFKD is COMPATIBILITY decomposition, so it also folds ﬁ→fi, ²→2, ①→1,
//     where the database, having no such character in its translate table,
//     yields '-'.
// The translate table below is copied verbatim from tag_deaccent; the test
// asserts the two halves are the same length, which is the one way this port
// can rot silently.
const DEACCENT_FROM =
  'àáâãäåāăąçćĉċčèéêëēĕėęěìíîïĩīĭįıñńņňòóôõöøōŏőùúûüũūŭůűųýÿŷšśŝşșžźżĝğġģĥħĵķĺļľłŕŗřţťŧțŵďđ'
const DEACCENT_TO =
  'aaaaaaaaaccccceeeeeeeeeiiiiiiiiinnnnooooooooouuuuuuuuuuyyyssssszzzgggghhjkllllrrrttttwdd'

export const TAG_DEACCENT_TABLE = { from: DEACCENT_FROM, to: DEACCENT_TO }

/** Mirrors public.tag_deaccent(text). */
export function tagDeaccent(input: string): string {
  const lowered = (input ?? '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/æ/g, 'ae')
    .replace(/œ/g, 'oe')
    .replace(/þ/g, 'th')
    .replace(/ð/g, 'd')

  let out = ''
  for (const ch of lowered) {
    const i = DEACCENT_FROM.indexOf(ch)
    out += i >= 0 ? DEACCENT_TO[i] : ch
  }
  return out
}

/** Mirrors public.normalize_tag_slug(text). */
export function tagSlug(input: string): string {
  return tagDeaccent(input)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
