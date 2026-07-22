/**
 * Shared image scorer used by fetch-images across all entity types.
 *
 * Hard-reject tokens are matched unconditionally against the alt text — if
 * the photo is of a bird or a branded billboard, no positive signal should
 * override that.
 *
 * Two scoring regimes:
 *  - Place subjects (city/country): the alt text usually names the subject, so
 *    the subject-mention bonus carries the score. No baseline.
 *  - Generic stock subjects (venue/event/place/marketplace): stock photos rarely
 *    name the entity, so they get a baseline and lean on hard-reject tokens +
 *    dimensions for quality. A clean full-size landscape clears the cover bar; a
 *    generic sky/sunset does not.
 *
 * Candidates below the role threshold are rejected; callers should persist
 * nothing rather than a wrong picture.
 */

export const MIN_ACCEPTANCE_SCORE = 30

export type ImageSource = 'pexels' | 'unsplash' | 'wikimedia'

export type SubjectType = 'city' | 'country' | 'venue' | 'event' | 'place' | 'marketplace'

/** Roles that get a stricter acceptance bar — a cover/hero is high-visibility. */
export type ImageRole =
  | 'cover' | 'hero' | 'gallery' | 'thumbnail' | 'logo' | 'square' | 'social' | 'og'

export interface ScoreInput {
  alt: string
  width?: number
  height?: number
  source: ImageSource
  /** `country` doubles as place-context (city) for generic subjects. */
  subject: { name: string; country?: string }
  subjectType: SubjectType
  /** Port / coastal subjects allow ferry / cruise imagery. */
  isPortOrCoastal?: boolean
}

/** Subjects whose stock photos rarely name the entity in alt text. */
const GENERIC_SUBJECT_TYPES = new Set<SubjectType>(['venue', 'event', 'place', 'marketplace'])

const HARD_REJECT_TOKENS = [
  // wildlife
  'bird', 'birds', 'wildlife', 'animal', 'parrot', 'flamingo',
  'duck', 'ducks', 'merganser', 'goose', 'swan', 'heron', 'owl',
  'fish', 'insect', 'butterfly', 'mammal', 'reptile',
  // art / abstract
  'abstract art', 'abstract painting', 'illustration', 'pattern', 'texture',
  'wallpaper', 'render', '3d render',
  // brands
  'vodafone', 'coca-cola', 'coca cola', 'nestle', 'mcdonald',
  'logo', 'advertisement', 'billboard', 'commercial banner',
  // stock-photo cruft / watermarks
  'stock photo', 'stockphoto', 'watermark', 'getty', 'gettyimages',
  'shutterstock', 'istockphoto', 'screenshot', 'screen shot',
  // framing
  'close-up', 'closeup', 'portrait of',
]

const SOFT_PENALTY_TOKENS = ['sunset', 'clouds', 'sky', 'landscape']

const WATER_TOKENS = ['ferry', 'cruise ship', 'cruise']

const QUEER_TOKENS = ['pride', 'gay', 'lgbtq', 'lgbt', 'queer', 'rainbow', 'drag', 'parade']

export function scoreImage(input: ScoreInput): number {
  const alt = (input.alt || '').toLowerCase()

  for (const token of HARD_REJECT_TOKENS) {
    if (alt.includes(token)) return Number.NEGATIVE_INFINITY
  }

  // Conditional reject: water-bound imagery is wrong for non-coastal subjects.
  if (!input.isPortOrCoastal && input.subjectType !== 'country') {
    for (const token of WATER_TOKENS) {
      if (alt.includes(token)) return Number.NEGATIVE_INFINITY
    }
  }

  let score = 0
  const subjectName = input.subject.name.toLowerCase()
  const countryName = input.subject.country?.toLowerCase() ?? ''
  const isGeneric = GENERIC_SUBJECT_TYPES.has(input.subjectType)

  // Baseline for generic stock subjects so a clean landscape photo can clear the
  // bar without naming the entity; quality then comes from dimensions + tokens.
  if (isGeneric) score += 25

  const subjectMentioned = subjectName.length > 0 && alt.includes(subjectName)
  if (subjectMentioned) score += isGeneric ? 30 : 50
  if (countryName && alt.includes(countryName)) score += 20

  // Queer/Pride relevance is a strong positive for venue/event imagery.
  if (isGeneric) {
    for (const token of QUEER_TOKENS) {
      if (alt.includes(token)) { score += 15; break }
    }
  }

  if (input.source === 'wikimedia') score += 15

  const w = input.width ?? 0
  const h = input.height ?? 0
  if (w > 0 && h > 0) {
    const ratio = w / h
    if (ratio >= 1.3 && ratio <= 2.5) score += 10
    if (w >= 1280) score += 5
  }

  if (!subjectMentioned) {
    for (const token of SOFT_PENALTY_TOKENS) {
      if (alt.includes(token)) {
        score -= 25
        break
      }
    }
  }

  return score
}

/** High-visibility roles demand a higher score than gallery/thumbnail images. */
export function minScoreForRole(role?: ImageRole): number {
  return role === 'cover' || role === 'hero' ? 40 : MIN_ACCEPTANCE_SCORE
}

export function isAcceptable(score: number, role?: ImageRole): boolean {
  return Number.isFinite(score) && score >= minScoreForRole(role)
}

export function pickBest<T extends { score: number }>(candidates: T[], role?: ImageRole): T | null {
  if (candidates.length === 0) return null
  let best: T | null = null
  for (const c of candidates) {
    if (!Number.isFinite(c.score)) continue
    if (!best || c.score > best.score) best = c
  }
  if (!best || !isAcceptable(best.score, role)) return null
  return best
}

// ---------------------------------------------------------------------------
// Queer-place scorer — used by the queer-imagery-backfill re-imaging pass.
//
// Unlike scoreImage() (which only rewards queer tokens for venue/event stock),
// this scorer is strict for place subjects: a candidate is accepted ONLY when
// its alt text carries BOTH a queer signal AND a place-connection signal. That
// dual gate is what guarantees the image is queer *and* connected to the actual
// city/country — disconnected rainbow stock (no place name) is rejected, so
// accepted images are overwhelmingly real Pride-parade / gay-district photos
// captioned with the place (typically from Wikimedia Commons).
// ---------------------------------------------------------------------------

/** Minimum score for the dual-gate to accept a queer place cover. */
export const QUEER_PLACE_MIN = 55

/**
 * Curated STRONG queer vocabulary — every entry unambiguously signals LGBTQ+
 * subject matter. Deliberately excludes bare `parade` / `march` (match military
 * and horse parades), bare `rainbow` (matches rainbow-coloured buildings and
 * literal rainbows), and bare `trans` / `drag` (substring-match `transport`,
 * `dragon`). Those are replaced by their unambiguous phrase forms below.
 * Matching is whole-word and unicode-aware (see `hasWord`) so `gay` no longer
 * matches `Gaya` nor `Nice` match `Venice`.
 */
export const QUEER_PLACE_TOKENS = [
  'pride', 'gay', 'lgbtq', 'lgbtqia', 'lgbt', 'queer', 'lesbian', 'transgender',
  'csd', 'christopher street', 'gay village', 'gayborhood',
  'chueca', 'castro', 'marais', 'fierté', 'orgullo', 'regenbogenparade',
  'pride flag', 'rainbow flag', 'pride parade', 'pride march', 'pride festival',
  'drag queen', 'drag king', 'drag show', 'drag perform',
]

/**
 * Whole-word, unicode-aware, case-insensitive match: `needle` must appear in
 * `haystack` bounded by non-letters on both sides. Prevents substring false
 * positives (`gay`⊄`Gaya`, `nice`⊄`Venice`, `parade`-only military parades are
 * excluded by vocabulary, not here). `needle` is already lowercase.
 */
function hasWord(haystack: string, needle: string): boolean {
  if (!needle) return false
  const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?<!\\p{L})${esc}(?!\\p{L})`, 'iu').test(haystack)
}

/**
 * Military / national-ceremony context. When present, a caption's `pride`
 * ("national pride", "army parade showcasing pride") is patriotic, not LGBTQ+ —
 * reject outright so a soldiers' parade never becomes a country hero.
 */
const QUEER_CONTEXT_REJECT = [
  'army', 'soldier', 'soldiers', 'military', 'troops', 'navy', 'regiment',
  'armed forces', 'national day', 'independence day', 'patriotic',
  'martyrs', 'veterans', 'war memorial',
]

export interface QueerPlaceInput {
  alt: string
  width?: number
  height?: number
  source: ImageResultSource
  /** Entity name (city or country). */
  name: string
  /** Country name for a city subject (optional). */
  country?: string
  /** Capital name for a country subject (optional). */
  capital?: string
}

/** image-search.ts ImageResult sources; wikimedia gets a provenance bonus. */
export type ImageResultSource = 'pexels' | 'unsplash' | 'wikimedia' | 'wikipedia'

export function scoreQueerPlaceImage(input: QueerPlaceInput): number {
  const alt = (input.alt || '').toLowerCase()

  for (const token of HARD_REJECT_TOKENS) {
    if (alt.includes(token)) return Number.NEGATIVE_INFINITY
  }

  // Military / national-ceremony context poisons a "pride" signal → reject.
  if (QUEER_CONTEXT_REJECT.some((t) => hasWord(alt, t))) return Number.NEGATIVE_INFINITY

  // Gate 1: must be queer (whole-word match against the curated strong vocab).
  const hasQueer = QUEER_PLACE_TOKENS.some((t) => hasWord(alt, t))
  if (!hasQueer) return Number.NEGATIVE_INFINITY

  // Gate 2: must be connected to the place (whole-word so `Nice`⊄`Venice`).
  const name = input.name.toLowerCase()
  const country = input.country?.toLowerCase() ?? ''
  const capital = input.capital?.toLowerCase() ?? ''
  const namedSubject = name.length > 0 && hasWord(alt, name)
  const namedContext =
    (country.length > 0 && hasWord(alt, country)) ||
    (capital.length > 0 && hasWord(alt, capital))
  if (!namedSubject && !namedContext) return Number.NEGATIVE_INFINITY

  let score = 30 // queer bonus (guaranteed present)
  if (namedSubject) score += 40
  else if (namedContext) score += 20
  if (namedSubject && namedContext) score += 20

  if (input.source === 'wikimedia') score += 15

  const w = input.width ?? 0
  const h = input.height ?? 0
  if (w > 0 && h > 0) {
    const ratio = w / h
    if (ratio >= 1.3 && ratio <= 2.5) score += 10
    if (w >= 1280) score += 5
  }

  return score
}
