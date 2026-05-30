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
