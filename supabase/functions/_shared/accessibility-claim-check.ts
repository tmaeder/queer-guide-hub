// TypeSafe (Jev) judge for accessibility claims — EXPERIMENTAL, wired to nothing.
//
// Same question as accessibility-evidence.ts — does the text a model cited
// actually support the accessibility slug it was cited for? — answered by
// asking TypeSafe instead of matching a regex vocabulary. It exists so the two
// can be compared on the same hand-read cases
// (scripts/data-quality/compare-accessibility-typesafe.ts) before anyone
// decides to replace, combine or drop either. Nothing in production imports it.
//
// JUDGMENTS FROM THE MODEL, DECISIONS IN CODE
// -------------------------------------------
// TypeSafe answers ONE judgment per question: how does this quote (or the whole
// description) relate to this one claim — supports / contradicts / says nothing.
// Everything else is code, in `decideClaim`:
//   - grounding (is the quote really in the text?) is a string match, never a
//     question — no model is needed to see that a quote is absent;
//   - the thresholds and the order of the verdicts mirror the regex guard, so
//     the two produce the same verdict vocabulary and can be scored side by side;
//   - a probability in the unsettled band gets its own verdict (`unsettled`)
//     instead of being rounded to a yes or a no.
//
// The polarity stays a WHITELIST for the reason given in accessibility-
// evidence.ts: a wrong access claim strands a disabled person at a door they
// cannot get through. Only `kept` may ever be adopted; every other verdict is a
// refusal.
//
// Negative slugs (`not-step-free`, ...) need no twin logic here, unlike the
// regex guard: their claim is simply phrased as the negative statement.

import type { EvidenceCitation } from './accessibility-evidence.ts'

export const TYPESAFE_ENDPOINT = 'https://api.typesafe.ai/v1/systemone'

/** Pinned rather than `jev-latest`, so a comparison is reproducible. */
export const TYPESAFE_MODEL = 'jev-1.14.0'

/**
 * Starting thresholds from the TypeSafe guidance (0.7 / 0.3). NOT fitted to the
 * fixtures — tuning them on the 22 recorded rows would over-fit a sample that
 * small, and the comparison script reports the raw probabilities so a change
 * here can be argued from the distribution rather than from one case.
 */
export const SUPPORTS_MIN = 0.7
export const CONTRADICTS_MIN = 0.7
export const UNSETTLED_MIN = 0.3

/**
 * One plain statement per slug — what a yes would assert about the venue.
 * Covers exactly the vocabulary of accessibility-evidence.ts (its EVIDENCE keys
 * plus its three negative twins); the test asserts the two stay in step.
 *
 * Where two properties are routinely confused, the claim says which one it is
 * about. That is a definition of the slug, not a patch for a test row.
 */
export const CLAIMS: Record<string, string> = {
  'wheelchair-accessible': 'A wheelchair user can get into and use this venue.',
  'step-free-entrance': 'The entrance can be used without climbing any steps.',
  'ramp-access': 'The venue has a ramp for getting in.',
  'elevator-access': 'The venue has an elevator (lift) to reach its other floors.',
  'wide-doorways': 'The doorways are wide enough for a wheelchair.',
  'limited-wheelchair-access': 'A wheelchair user can get into part of this venue, or only with difficulty.',
  'accessible-parking': 'The venue has parking spaces reserved for disabled people.',
  'accessible-seating': 'The venue has seating or spaces set aside for wheelchair users.',
  'tactile-paving': 'The venue has tactile paving for blind or low-vision visitors.',
  'accessible-restroom': 'The venue has a restroom built for disabled people to use.',
  'gender-neutral-restroom':
    'The venue has a restroom that people of any gender can use. A single-occupancy room that is still labelled for men or for women does not count.',
  'service-animals-welcome': 'Service animals such as guide dogs are allowed in this venue.',
  'braille-menu': 'The venue offers a menu or information in braille.',
  'audio-description': 'Performances or screenings here offer audio description.',
  'captioning': 'Performances or screenings here offer captions or subtitles.',
  'hearing-loop': 'The venue has a hearing loop or other assistive listening system.',
  'interpreter-available': 'An interpreter is available at this venue.',
  'sign-language-interpreted': 'Events here are interpreted into a sign language.',
  'quiet-space': 'The venue has a quiet or sensory room people can withdraw to.',
  'relaxed-performance': 'The venue offers relaxed performances.',
  'companion-ticket': 'A disabled visitor can bring a companion free or at a reduced price.',
  'not-wheelchair-accessible': 'A wheelchair user cannot get into or use this venue.',
  'not-step-free': 'The entrance cannot be used without climbing steps.',
  'no-accessible-restroom': 'The venue has no restroom built for disabled people to use.',
}

/** The one question type used. Option names are sent to the model, so they describe. */
const RELATION_CRITERIA = {
  supports: 'The text states, as a fact about this venue, that the claim is true',
  contradicts: 'The text states, as a fact about this venue, that the claim is false',
  says_nothing:
    'The text is about something else, or only guesses (for example "seems to be" from someone who says they are not sure)',
} as const

export type Relation = keyof typeof RELATION_CRITERIA
export type RelationProbs = Record<Relation, number>

/** Question ids are never sent to the model; they only route answers back. */
export function quoteQuestionId(slug: string, i: number): string {
  return `quote__${slug}__${i}`
}
export function sourceQuestionId(slug: string): string {
  return `source__${slug}`
}

/** Same normalisation as the regex guard, so grounding is decided identically. */
function norm(s: string): string {
  return String(s ?? '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

export interface ClaimRequestInput {
  venueName: string
  /** The text the extracting model was shown. Grounding is checked against it. */
  sourceText: string
  slugs: readonly string[]
  citations: readonly EvidenceCitation[]
}

export interface PreparedRequest {
  /** The exact JSON body to POST, kept so any result can be rerun. */
  body: {
    model: string
    state: { venue_name: string; venue_description: string }
    questions: Record<string, unknown>
  }
  /** Normalised quotes, index-aligned with `quoteQuestionId(slug, i)`. */
  quotes: string[]
  /** Per quote: is it present in the source text? Decided here, not asked. */
  grounded: boolean[]
  /** Slugs outside the vocabulary — reported, never asked about. */
  unrecognised: string[]
}

/**
 * Build ONE request per venue: the description is shared state, read and paid
 * for once, and every (slug × grounded quote) plus one (slug × description)
 * question rides in the same call. The description question is asked
 * speculatively — code reads it only when the citations fail, to tell
 * `miscited` from `no_evidence`.
 */
export function buildClaimRequest(input: ClaimRequestInput): PreparedRequest {
  const quotes = input.citations.map((c) => norm(c?.quote ?? '')).filter((q) => q.length > 0)
  const haystack = norm(input.sourceText).toLowerCase()
  // Empty source: skip grounding rather than failing everything closed, as the
  // regex guard does — absence of the source is not evidence of invention.
  const grounded = quotes.map((q) => haystack.length === 0 || haystack.includes(q.toLowerCase()))

  const questions: Record<string, unknown> = {}
  const unrecognised: string[] = []
  for (const slug of new Set(input.slugs)) {
    const claim = CLAIMS[slug]
    if (!claim) {
      unrecognised.push(slug)
      continue
    }
    quotes.forEach((quote, i) => {
      if (!grounded[i]) return
      questions[quoteQuestionId(slug, i)] = {
        type: 'choice',
        instructions: {
          task: 'How does this quoted passage from `venue_description` relate to the claim?',
          quote,
          claim,
        },
        criteria: RELATION_CRITERIA,
      }
    })
    questions[sourceQuestionId(slug)] = {
      type: 'choice',
      instructions: { task: 'How does `venue_description` relate to the claim?', claim },
      criteria: RELATION_CRITERIA,
    }
  }

  return {
    body: {
      model: TYPESAFE_MODEL,
      state: { venue_name: input.venueName, venue_description: input.sourceText },
      questions,
    },
    quotes,
    grounded,
    unrecognised,
  }
}

export type ClaimVerdict =
  | { ok: true; reason: 'supported'; matched: string }
  | {
    ok: false
    reason: 'refuted' | 'ungrounded' | 'miscited' | 'unsettled' | 'no_evidence' | 'uncited' | 'unrecognised_slug'
    detail: string
  }

/**
 * The truth table. Order matches accessibility-evidence.ts so the two judges'
 * reasons are comparable: a supporting citation wins, then a contradicting one,
 * then "every citation was invented", then the description fallback.
 *
 * `answers` maps question id → relation probabilities. A question that was not
 * asked or not answered is simply absent; it is never read as a "no".
 */
export function decideClaim(
  slug: string,
  prepared: Pick<PreparedRequest, 'quotes' | 'grounded'>,
  answers: Record<string, RelationProbs | undefined>,
): ClaimVerdict {
  if (!CLAIMS[slug]) return { ok: false, reason: 'unrecognised_slug', detail: slug }
  const { quotes, grounded } = prepared
  if (quotes.length === 0) return { ok: false, reason: 'uncited', detail: slug }

  let bestSupport = 0
  for (let i = 0; i < quotes.length; i++) {
    const p = answers[quoteQuestionId(slug, i)]
    if (!grounded[i] || !p) continue
    if (p.supports >= SUPPORTS_MIN) return { ok: true, reason: 'supported', matched: quotes[i] }
    bestSupport = Math.max(bestSupport, p.supports)
  }
  for (let i = 0; i < quotes.length; i++) {
    const p = answers[quoteQuestionId(slug, i)]
    if (grounded[i] && p && p.contradicts >= CONTRADICTS_MIN) {
      return { ok: false, reason: 'refuted', detail: `${slug}: cited text states the opposite — ${quotes[i]}` }
    }
  }
  if (grounded.every((g) => !g)) {
    return { ok: false, reason: 'ungrounded', detail: `${slug}: no cited quote is present in the source text` }
  }
  const src = answers[sourceQuestionId(slug)]
  if (src && src.supports >= SUPPORTS_MIN) {
    return { ok: false, reason: 'miscited', detail: `${slug}: the description supports this but no cited quote does` }
  }
  if (bestSupport >= UNSETTLED_MIN) {
    return {
      ok: false,
      reason: 'unsettled',
      detail: `${slug}: best citation support ${bestSupport.toFixed(2)} is between ${UNSETTLED_MIN} and ${SUPPORTS_MIN}`,
    }
  }
  return { ok: false, reason: 'no_evidence', detail: `${slug}: no cited quote supports this` }
}

/** Pull `probabilities` out of a choice answer; anything malformed is absent. */
export function relationProbs(answer: unknown): RelationProbs | undefined {
  const p = (answer as { type?: string; probabilities?: Record<string, unknown> } | null)?.probabilities
  if (!p || (answer as { type?: string }).type !== 'choice') return undefined
  const num = (k: Relation) => (typeof p[k] === 'number' ? (p[k] as number) : NaN)
  const out = { supports: num('supports'), contradicts: num('contradicts'), says_nothing: num('says_nothing') }
  return Object.values(out).every(n => Number.isFinite(n) && n >= 0 && n <= 1)
    && Math.abs(Object.values(out).reduce((a, b) => a + b, 0) - 1) <= 0.02 ? out : undefined
}

// Plain fields rather than constructor parameter properties: the comparison
// script runs this file under Node's type stripping, which rejects them.
export class TypeSafeError extends Error {
  status: number
  body: string
  constructor(message: string, status: number, body: string) {
    super(message)
    this.status = status
    this.body = body
  }
}

/** Count actual HTTP attempts, including retries, across the whole comparison. */
export function createRequestBudget(maxRequests: number, fetchImpl: typeof fetch = fetch) {
  if (!Number.isSafeInteger(maxRequests) || maxRequests < 0) throw new RangeError('Request budget must be a nonnegative safe integer')
  let used = 0
  const budgeted: typeof fetch = (...args) => {
    if (used >= maxRequests) throw new TypeSafeError('TypeSafe HTTP request budget exhausted', 0, '')
    used++
    return fetchImpl(...args)
  }
  return { fetchImpl: budgeted, used: () => used }
}

/**
 * POST one prepared request. A failed call THROWS — it is never turned into an
 * empty answer set, because an empty answer set decides every slug as
 * `no_evidence`, which is a confident-looking result built on no evidence.
 * Retries a 429 (rate limit, honouring retry-after) and a 5xx; nothing else.
 */
export async function callTypeSafe(
  body: PreparedRequest['body'],
  apiKey: string,
  opts: { fetchImpl?: typeof fetch; maxAttempts?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<{ model: string; answers: Record<string, unknown>; usage?: { input_tokens: number } }> {
  const doFetch = opts.fetchImpl ?? fetch
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)))
  const maxAttempts = opts.maxAttempts ?? 4
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 4) throw new RangeError('maxAttempts must be between 1 and 4')
  for (let attempt = 1; ; attempt++) {
    const res = await doFetch(TYPESAFE_ENDPOINT, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    })
    const text = await res.text()
    if (res.ok) {
      const result = JSON.parse(text)
      if (!result || typeof result.model !== 'string' || !result.answers || typeof result.answers !== 'object'
        || Array.isArray(result.answers) || Object.keys(body.questions).some(id => !relationProbs(result.answers[id]))) {
        throw new TypeSafeError('TypeSafe returned invalid answers', res.status, '')
      }
      return result
    }
    const retryable = res.status === 429 || res.status >= 500
    if (!retryable || attempt >= maxAttempts) {
      throw new TypeSafeError(`TypeSafe HTTP ${res.status}`, res.status, text.slice(0, 500))
    }
    const after = Number(res.headers.get('retry-after'))
    await sleep(Number.isFinite(after) && after > 0 ? after * 1000 : 1000 * 2 ** (attempt - 1))
  }
}
