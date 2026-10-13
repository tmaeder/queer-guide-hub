// "Is this citation really OUR OWN number handed back to us?"
//
// `city-agentic-enrich` injects a one-line safety context built from
// `countries.equality_score` — a number computed by `_shared/equality-score.ts` and
// published by nobody. The model routinely returns it as a verbatim `quote`
// attributed to an external authority (usually ilga.org, which publishes no such
// score), which is how the "a rating MUST be cited" gate came to be satisfied by our
// own derived data wearing an external URL.
//
// `20261004`'s fix caught the exact spelling we inject (`equality_score=`). The model
// then stopped reproducing that spelling and started re-rendering the same number as
// prose. Measured on prod 2026-10-13 over the 87 rating rows created since that fix:
// 0 are caught by the `=` test and 8 rest ONLY on a prose restatement — every quoted
// figure matching `countries.equality_score` for that row's own country EXACTLY
// (Estonia 96, France 100, India 77, Italy 78, Japan 71, Netherlands 100).
//
// The sharpest instance is not even a country: "Alabama has a state-level equality
// score of 86 out of 100" — 86 is the UNITED STATES score in our own table and there
// is no Alabama score anywhere in it, so our national number was relabelled as a
// state's and then cited.
//
// KEYED ON OUR OWN VALUE, never on any score-shaped figure. ILGA-Europe's Rainbow Map
// genuinely publishes country percentages, so a blanket ban on "scored N" would throw
// away real citations — measured, "Malta scored 89% on the ILGA-Europe Rainbow Index"
// survives for a row whose stored score is 100. The accepted cost is that a genuine
// external figure COINCIDING with ours is also refused: at that point the two are
// indistinguishable from the row, and refusing withholds a rating while accepting
// publishes one.

export interface SelfQuoteInput {
  quote?: unknown
}

/**
 * True when the quote carries no independent evidence because it is our own injected
 * context or our own equality score restated.
 *
 * @param x              the citation object (only `quote` is read)
 * @param ourScore       `countries.equality_score` for THIS row's country, or null
 * @param safetyContext  the exact string this run injected, if any
 */
export function isSelfQuote(
  x: SelfQuoteInput,
  ourScore: number | null | undefined,
  safetyContext?: string,
): boolean {
  const q = String(x?.quote ?? '').trim()
  if (!q) return false

  // the exact string we injected
  if (!!safetyContext && q === safetyContext.trim()) return true

  // the spelling we inject it in
  if (/equality_score=/.test(q)) return true

  // The same number re-rendered as prose. TWO arms, one per observed word order;
  // BOTH require the phrase "equality score" NEAR our own figure.
  //
  // A bare `N/100` arm was written first and removed: it fires on any fraction in any
  // context, and it was redundant anyway — "France: 100/100 equality score" is already
  // caught by the number-then-phrase arm. Requiring the phrase is what keeps this from
  // refusing a legitimate external percentage.
  if (typeof ourScore === 'number' && Number.isFinite(ourScore)) {
    const n = String(ourScore)
    // "Equality score: 96" / "equality score of 77" / "equality score 100;"
    const phraseThenScore = new RegExp('equality\\s*score[^0-9]{0,20}' + n + '\\b', 'i')
    // "100/100 equality score" / "96 out of 100 on the equality score"
    const scoreThenPhrase = new RegExp('\\b' + n + '\\b[^.]{0,30}equality\\s*score', 'i')
    if (phraseThenScore.test(q) || scoreThenPhrase.test(q)) return true
  }

  return false
}
