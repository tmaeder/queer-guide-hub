// Accessibility evidence guard — does the CITED TEXT support the slug it was
// cited for? Pure. No I/O. Sibling of accessibility-vocab.ts, which answers a
// different question (can these two slugs coexist).
//
// WHY THIS MODULE EXISTS
// ----------------------
// `extractVenueAmenitiesFromText` asks an LLM for accessibility slugs plus
// `citations: [{field, quote}]`, clamps the slugs to `public.amenities`, and
// queues the result for human review. Two things were never checked: that a
// cited quote EXISTS in the text the model was given, and that the quote has
// anything to do with the slug it was cited for.
//
// Measured on the live queue (2026-10-01), 30 cited slug-claims across 22 open
// rows: 23 are not supported by their own citation. The failures are not subtle.
//
//   "especially among Chinese men"                  -> wheelchair-accessible
//   "mostly locals with some foreigners"            -> gender-neutral-restroom
//   "Japanese-style bathhouse"                      -> gender-neutral-restroom
//   "Especially popular with the leather & fetish crowd." -> gender-neutral-restroom
//   "queer-friendly"                                -> service-animals-welcome
//   "Second floor, near section I/H"                -> elevator-access
//   "hand rails" + "changing table"                 -> ramp-access, wide-doorways
//   "Located in an old warehouse built in 1910"     -> ramp-access
//   "They are gendered bathrooms but they are single stalls." -> gender-neutral-restroom
//   "Probably not wheelchair accessible"            -> gender-neutral-restroom
//
// The quotes are real — 25 of 30 are verbatim in the venue's own description.
// The model quoted correctly and then drew an unrelated conclusion. So a
// grounding check alone is NOT the fix: measured, it catches 2 of 22 rows.
// Corroboration catches 20. Both arms are needed and neither subsumes the other.
//
// THE CONFIDENCE SCORE CANNOT GATE THIS. The worst row in the set — three slugs
// whose "quotes" are the slugs themselves echoed back ("ramp-access since
// 1994", "elevator-access", "wide-doorways") — carries confidence 1.00, while
// several correct rows sit at 0.50. This repo has twice measured that a
// self-reported confidence cannot gate a write (tag prose judge: 16 of 18
// retracted, 13 wrongly; tag relation verifier: ~29% correct at confidence
// 1.000). That slug-echo row is caught by the GROUNDING arm, because a slug is
// not a phrase in the description.
//
// POLARITY: WHITELIST, AND THE REASON IS ASYMMETRIC HARM
// ------------------------------------------------------
// A slug is adopted only on positively recognised evidence; anything
// unrecognised is REFUSED and REPORTED verbatim, so a gap in this vocabulary
// surfaces as a rising count of namable (slug, quote) pairs rather than as
// silence. That inverts `tag-wiki-guard.ts` (where a miss costs a link) and
// follows `city-class-guard.ts` (where the harm is permanent) for the same
// reason stated in 20260801150524: a wrong access claim strands a disabled
// person at a door they cannot get through. A missed accessibility fact costs a
// traveller one phone call; a false one costs them the trip.
//
// Refusing is CHEAP here in a way it is not elsewhere: these proposals are
// review-gated, so a refused slug was never going to publish without a human
// anyway — it was going to sit in a queue at a ~77% junk rate, which is how a
// queue teaches its reviewers to rubber-stamp.

/** One cited quote, as the model returns it. */
export interface EvidenceCitation {
  field?: string | null
  quote?: string | null
}

export type EvidenceVerdict =
  /** A cited quote names this slug's own evidence, un-negated. Adopt. */
  | { ok: true; matched: string }
  /** No cited quote contains any evidence for this slug. */
  | { ok: false; reason: 'no_evidence'; detail: string }
  /**
   * The cited quote does not support the slug but the SOURCE TEXT does — the
   * claim is plausibly true and the model pointed at the wrong sentence.
   *
   * Still refused, because the citation is the evidence and an unevidenced
   * access claim may not publish. Named separately because the remedy is
   * different and no aggregate counter can tell the two apart: a `no_evidence`
   * refusal is a fabrication to discard, a `miscited` one is a real fact to
   * re-cite. Measured on the live queue this is 1 of 22 rows — "Probably not
   * wheelchair accessible" cited for `gender-neutral-restroom` on a venue whose
   * description continues "but gender neutral with a single, clean, restroom".
   */
  | { ok: false; reason: 'miscited'; detail: string }
  /** A quote was cited that does not appear in the text the model was given. */
  | { ok: false; reason: 'ungrounded'; detail: string }
  /** Evidence is present but negated — the quote REFUTES the slug. */
  | { ok: false; reason: 'refuted'; detail: string }
  /** No citation at all was supplied for this slug. */
  | { ok: false; reason: 'uncited'; detail: string }
  /** Slug is outside this vocabulary — reported, never silently adopted. */
  | { ok: false; reason: 'unrecognised_slug'; detail: string }

/**
 * Per-slug evidence terms, as regex source fragments (case-insensitive).
 *
 * CALIBRATED AGAINST THE CORPUS, NOT INVENTED. Every alternative below appears
 * in the 1,036 machine-approved claims on prod; a first draft written from
 * reasoning alone false-refused 157 claims (~18%) because it omitted
 * "disabled toilet", "handicapped accessible", "not gendered" and the
 * non-English spellings. The corpus is multilingual — "Los baños son unisex",
 * "Er zijn enkel genderneutrale wc", "Hay baños accesibles de un solo
 * ocupante" — so the Spanish, Dutch and German forms are load-bearing, not
 * decoration.
 *
 * DELIBERATELY ABSENT: bare "single stall" / "single occupancy" is NOT evidence
 * of a gender-neutral restroom. The corpus contains "Gendered stalls, but they
 * are singles with lockable doors." and "They are gendered bathrooms but they
 * are single stalls." — single-occupancy and gender-neutral are independent
 * properties, and conflating them is one of the live defects this guard refuses.
 */
const EVIDENCE: Record<string, string[]> = {
  // --- mobility -----------------------------------------------------------
  'wheelchair-accessible': [
    'wheel\\s?chair', 'step[-\\s]?free', '\\bada\\b', 'handicap\\w*',
    'disabled\\s+(toilet|cubicle|access|stall|wc)', 'disability\\s+accessible',
    'barrierefrei', 'rolstoel', 'accesible',
  ],
  'step-free-entrance': [
    'step[-\\s]?free', 'no\\s+steps', 'level\\s+(entrance|access)',
    'flat\\s+entrance', 'ground\\s+level', 'street\\s+level', 'roll\\s+door',
  ],
  'ramp-access': ['\\bramps?\\b', '\\brampa\\b', '\\brampe\\b'],
  'elevator-access': ['\\belevators?\\b', '\\blifts?\\b', 'ascensor', 'aufzug', 'skyway'],
  'wide-doorways': [
    'wide\\w*\\s+(door|entrance|entry|aisle)', 'door\\w*\\s+\\w{0,6}\\s?wide',
    'door\\s?way\\s+width', 'door\\s+width',
  ],
  'limited-wheelchair-access': [
    '(limited|partial|some|difficult|narrow|tight|workable)\\b[^.]{0,40}(wheel\\s?chair|power\\s?chair)',
    '(wheel\\s?chair|power\\s?chair)\\b[^.]{0,40}(limited|partial|difficult|narrow|tight|workable)',
  ],
  'accessible-parking': [
    '(accessible|disabled|handicap\\w*|blue\\s+badge)\\b[^.]{0,25}parking',
    'parking\\b[^.]{0,25}(accessible|disabled|handicap\\w*)',
  ],
  'accessible-seating': [
    '(accessible|wheel\\s?chair)\\b[^.]{0,25}(seat|seating|space)',
    '(seat|seating)\\b[^.]{0,25}accessible',
  ],
  'tactile-paving': ['tactile'],

  // --- restrooms ----------------------------------------------------------
  'accessible-restroom': [
    '(accessible|handicap\\w*|disabled|\\bada\\b|accesibles?)' +
      '\\b[^.]{0,35}(restroom|toilet|bathroom|washroom|\\bwc\\b|cubicle|ba[nñ]os?)',
    '(restroom|toilet|bathroom|washroom|\\bwc\\b|cubicle|ba[nñ]os?)' +
      '\\b[^.]{0,35}(accessible|handicap\\w*|disabled|\\bada\\b|accesibles?)',
    // Standalone because each names an accessible toilet on its own and neither
    // is ever followed by the word "toilet": a RADAR key is the UK National Key
    // Scheme key, which opens nothing else, and "Changing Places" is the
    // registered standard for a fully accessible facility. Both appear in the
    // corpus phrased as "accessible with a RADAR key" and "Changing Places
    // accessible facility", which the paired patterns above cannot reach.
    'radar\\s+key', 'changing\\s+places',
  ],
  'gender-neutral-restroom': [
    'gender[-\\s]?neutral', 'genderneutral\\w*', 'gender[-\\s]?free',
    'no[nt]?[-\\s]?gendered', 'un\\s?gendered', 'genderless',
    'all[-\\s]?gender', 'any\\s+gender', 'all[-\\s]?user',
    '\\bunisex\\b', 'family\\s+(restroom|bathroom|toilet|room)',
    'disidencias', "bathroom\\s+'?for\\s+all'?",
  ],

  // --- sensory / service --------------------------------------------------
  'service-animals-welcome': ['service\\s+(animal|dog)', '(guide|assistance|hearing)\\s+dog'],
  'braille-menu': ['braille'],
  'audio-description': ['audio[-\\s]?descri'],
  'captioning': ['caption', 'subtitle', '\\bcart\\b'],
  'hearing-loop': ['hearing\\s+loop', 'induction\\s+loop', 't[-\\s]?coil', 'assistive\\s+listening', 'hearing\\s+device'],
  'interpreter-available': ['interpret'],
  'sign-language-interpreted': ['sign\\s+language', '\\basl\\b', '\\bbsl\\b', '\\bdgs\\b', '\\blsf\\b'],
  'quiet-space': ['quiet\\s+(room|space|area)', 'sensory\\s+(room|space)'],
  'relaxed-performance': ['relaxed\\s+perform'],
  'companion-ticket': ['companion'],
}

/**
 * The three negative assertions need the OPPOSITE test: the quote must contain
 * a NEGATED access term. They share their positive twin's vocabulary and invert
 * the negation arm, so "there is no step free access" supports `not-step-free`
 * and refutes `step-free-entrance` off the same match.
 */
const NEGATIVE_TWIN: Record<string, string> = {
  'not-wheelchair-accessible': 'wheelchair-accessible',
  'not-step-free': 'step-free-entrance',
  'no-accessible-restroom': 'accessible-restroom',
}

/**
 * Negators scanned in the ~30 characters BEFORE an evidence match.
 *
 * The window is before-only on purpose, which is what lets a self-negating
 * evidence term carry its own meaning: `no steps` is matched as one term for
 * `step-free-entrance`, so the match starts at "no" and nothing precedes it.
 * The same text read for `not-step-free` finds "no" immediately before "steps"
 * only because that slug's twin vocabulary matches "steps" alone.
 */
const NEGATOR = /\b(not|no|never|without|lacks?|lacking|unlikely|cannot|can ?not|isn[’']?t|aren[’']?t|wasn[’']?t|weren[’']?t|doesn[’']?t|don[’']?t|didn[’']?t|can[’']?t|sadly|unfortunately)\b[^.]{0,30}$/i

const NEG_WINDOW = 30

/**
 * A negation does not survive a clause boundary, and this is load-bearing
 * rather than a refinement.
 *
 * The live corpus contains "Probably not wheelchair accessible BUT gender
 * neutral with a single, clean, restroom" — a sentence that denies one access
 * claim and asserts another. Scanning 30 raw characters back from "gender
 * neutral" finds the "not" belonging to the wheelchair clause and refutes a
 * claim the text plainly makes. Cutting the window at the LAST boundary keeps a
 * negator that genuinely governs the match ("...accessible but I'm not a
 * wheelchair user", where the negator sits after the "but") while dropping one
 * that does not.
 */
const CLAUSE_BOUNDARY = /.*\b(but|however|although|though)\b|.*[;:]/i

/** Lowercase, collapse whitespace, normalise curly quotes. Comparison only. */
function norm(s: string): string {
  return String(s ?? '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

interface Match { term: string; index: number }

function findEvidence(quote: string, slug: string): Match | null {
  const terms = EVIDENCE[slug]
  if (!terms) return null
  for (const term of terms) {
    const m = new RegExp(term, 'i').exec(quote)
    if (m) return { term, index: m.index }
  }
  return null
}

function isNegated(quote: string, at: number): boolean {
  const window = quote.slice(Math.max(0, at - NEG_WINDOW), at)
  // Drop everything up to and including the last clause boundary.
  const before = window.replace(CLAUSE_BOUNDARY, '')
  return NEGATOR.test(before)
}

/**
 * Is `slug` supported by at least one of `citations`, given the text the model
 * was actually shown?
 *
 * `sourceText` is the text handed to the model (description, plus tags if those
 * were in the prompt). When it is empty the grounding arm is SKIPPED rather than
 * failing everything closed — absence of the source is not evidence a quote was
 * invented, and `city-class-guard` records why those two must stay distinct.
 */
export function accessibilityEvidenceVerdict(
  slug: string,
  citations: readonly EvidenceCitation[] | null | undefined,
  sourceText?: string | null,
): EvidenceVerdict {
  const negTwin = NEGATIVE_TWIN[slug]
  const lookupSlug = negTwin ?? slug
  if (!EVIDENCE[lookupSlug]) {
    return { ok: false, reason: 'unrecognised_slug', detail: slug }
  }

  const quotes = (citations ?? [])
    .map((c) => norm(c?.quote ?? ''))
    .filter((q) => q.length > 0)
  if (quotes.length === 0) return { ok: false, reason: 'uncited', detail: slug }

  const haystack = norm(sourceText ?? '').toLowerCase()
  const checkGrounding = haystack.length > 0

  let sawEvidence = false
  let sawUngrounded = false

  for (const quote of quotes) {
    if (checkGrounding && !haystack.includes(quote.toLowerCase())) {
      // A quote the model invented cannot corroborate anything. Keep looking —
      // another citation on the same claim may be genuine.
      sawUngrounded = true
      continue
    }
    const hit = findEvidence(quote, lookupSlug)
    if (!hit) continue
    sawEvidence = true
    const negated = isNegated(quote, hit.index)
    // A negative slug is supported BY the negation and refuted without it.
    if (negTwin ? negated : !negated) {
      return { ok: true, matched: quote }
    }
  }

  if (sawEvidence) {
    return {
      ok: false,
      reason: 'refuted',
      detail: `${slug}: cited text ${negTwin ? 'asserts' : 'denies'} the opposite — ${quotes.join(' | ')}`,
    }
  }
  if (sawUngrounded) {
    return {
      ok: false,
      reason: 'ungrounded',
      detail: `${slug}: cited quote is not present in the source text — ${quotes.join(' | ')}`,
    }
  }
  // The citation failed. Ask whether the SOURCE itself would have supported the
  // claim, so a real fact the model mis-cited is distinguishable from one it
  // invented. Checked on the source only AFTER the citation has already failed,
  // so this can never widen what is adopted — both branches refuse.
  if (checkGrounding) {
    const onSource = findEvidence(haystack, lookupSlug)
    if (onSource && (negTwin ? isNegated(haystack, onSource.index) : !isNegated(haystack, onSource.index))) {
      return {
        ok: false,
        reason: 'miscited',
        detail: `${slug}: the source supports this but the cited quote does not — re-cite rather than discard; cited: ${quotes.join(' | ')}`,
      }
    }
  }
  return {
    ok: false,
    reason: 'no_evidence',
    detail: `${slug}: no cited quote names this — ${quotes.join(' | ')}`,
  }
}

export interface EvidenceFilter {
  /** Slugs whose citation holds up. Sorted. */
  kept: string[]
  /** Everything refused, with the reason and the quotes, for the run report. */
  refused: Array<{ slug: string; reason: string; detail: string }>
}

/**
 * Filter a proposed accessibility array down to the slugs their own citations
 * support. Returns the refusals so a caller can REPORT them — a refusal that is
 * only dropped is indistinguishable from a model that returned nothing, which
 * is the shape that hides a vocabulary gap.
 */
export function filterAccessibilityByEvidence(
  slugs: readonly string[] | null | undefined,
  citations: readonly EvidenceCitation[] | null | undefined,
  sourceText?: string | null,
): EvidenceFilter {
  const kept: string[] = []
  const refused: EvidenceFilter['refused'] = []
  for (const slug of slugs ?? []) {
    const v = accessibilityEvidenceVerdict(slug, citations, sourceText)
    if (v.ok) kept.push(slug)
    else refused.push({ slug, reason: v.reason, detail: v.detail })
  }
  return { kept: [...new Set(kept)].sort(), refused }
}
