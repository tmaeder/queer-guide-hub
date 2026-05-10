/**
 * Shared image scorer used by fetch-images (city + country entity types).
 *
 * Hard-reject tokens are matched unconditionally against the alt text — if
 * the photo is of a bird or a branded billboard, no positive signal should
 * override that.
 *
 * Candidates below MIN_ACCEPTANCE_SCORE are rejected; callers should persist
 * nothing rather than a wrong picture.
 */

export const MIN_ACCEPTANCE_SCORE = 30

export type ImageSource = 'pexels' | 'unsplash' | 'wikimedia'

export interface ScoreInput {
  alt: string
  width?: number
  height?: number
  source: ImageSource
  subject: { name: string; country?: string }
  subjectType: 'city' | 'country'
  /** Port / coastal subjects allow ferry / cruise imagery. */
  isPortOrCoastal?: boolean
}

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
  // framing
  'close-up', 'closeup', 'portrait of',
]

const SOFT_PENALTY_TOKENS = ['sunset', 'clouds', 'sky', 'landscape']

const WATER_TOKENS = ['ferry', 'cruise ship', 'cruise']

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

  const subjectMentioned = subjectName.length > 0 && alt.includes(subjectName)
  if (subjectMentioned) score += 50
  if (countryName && alt.includes(countryName)) score += 20

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

export function isAcceptable(score: number): boolean {
  return Number.isFinite(score) && score >= MIN_ACCEPTANCE_SCORE
}

export function pickBest<T extends { score: number }>(candidates: T[]): T | null {
  if (candidates.length === 0) return null
  let best: T | null = null
  for (const c of candidates) {
    if (!Number.isFinite(c.score)) continue
    if (!best || c.score > best.score) best = c
  }
  if (!best || !isAcceptable(best.score)) return null
  return best
}
