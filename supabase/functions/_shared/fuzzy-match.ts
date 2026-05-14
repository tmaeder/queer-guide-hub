/**
 * Fuzzy string matching utilities for deduplication and content checks.
 * Pure functions — no DB or external dependencies.
 */

// ── Text normalization ──────────────────────────────────────────────────────

const DIACRITICS_MAP: Record<string, string> = {
  'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss',
  'à': 'a', 'á': 'a', 'â': 'a', 'ã': 'a', 'å': 'a',
  'è': 'e', 'é': 'e', 'ê': 'e', 'ë': 'e',
  'ì': 'i', 'í': 'i', 'î': 'i', 'ï': 'i',
  'ò': 'o', 'ó': 'o', 'ô': 'o', 'õ': 'o',
  'ù': 'u', 'ú': 'u', 'û': 'u',
  'ñ': 'n', 'ç': 'c', 'ý': 'y', 'ÿ': 'y',
  'ž': 'z', 'š': 's', 'č': 'c', 'ř': 'r', 'ě': 'e', 'ň': 'n', 'ť': 't', 'ď': 'd',
  'ł': 'l', 'ą': 'a', 'ę': 'e', 'ś': 's', 'ź': 'z', 'ż': 'z', 'ć': 'c',
  'ø': 'o', 'æ': 'ae',
}

/** Normalize text for comparison: lowercase, strip diacritics, collapse whitespace. */
export function normalizeText(text: string): string {
  let result = text.toLowerCase().trim()
  // Replace known diacritics
  // eslint-disable-next-line no-control-regex
  result = result.replace(/[^\x00-\x7F]/g, ch => DIACRITICS_MAP[ch] ?? ch)
  // Remove punctuation except hyphens
  result = result.replace(/[''"""`.,;:!?()[\]{}<>@#$%^&*+=~/\\|]/g, '')
  // Collapse whitespace and hyphens
  result = result.replace(/[\s-]+/g, ' ').trim()
  return result
}

/** Normalize for title comparison: strips articles + common event noise words. */
const TITLE_NOISE = /\b(the|a|an|der|die|das|le|la|les|el|los|las|de|du|des|von|van|event|party|night|edition|show|gala|meetup|gathering|soiree|bash|nite|nacht|abend|fiesta|festa|fete)\b/g
const _EDITION_RE = /\b(\d{4}|\d{1,3}(?:st|nd|rd|th)\s+(?:edition|annual))\b/gi
const YEAR_RE = /\b(20\d{2})\b/g

export function normalizeTitle(text: string): string {
  let result = normalizeText(text)
  result = result.replace(TITLE_NOISE, '').replace(/\s+/g, ' ').trim()
  return result
}

/** Extract year from title if present (e.g. "Pride 2026" -> 2026). */
export function extractYear(text: string): number | null {
  const match = text.match(YEAR_RE)
  if (!match) return null
  return parseInt(match[match.length - 1], 10)
}

/** Extract edition number (e.g. "5th Annual" -> 5). */
export function extractEdition(text: string): number | null {
  const match = text.match(/(\d+)(?:st|nd|rd|th)\s+(?:edition|annual)/i)
  return match ? parseInt(match[1], 10) : null
}

// ── String similarity algorithms ────────────────────────────────────────────

/** Levenshtein edit distance. */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  // Use two rows instead of full matrix for O(min(m,n)) space
  if (a.length > b.length) [a, b] = [b, a]

  let prev = Array.from({ length: a.length + 1 }, (_, i) => i)
  let curr = new Array(a.length + 1)

  for (let j = 1; j <= b.length; j++) {
    curr[0] = j
    for (let i = 1; i <= a.length; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[i] = Math.min(
        curr[i - 1] + 1,      // insertion
        prev[i] + 1,          // deletion
        prev[i - 1] + cost,   // substitution
      )
    }
    ;[prev, curr] = [curr, prev]
  }
  return prev[a.length]
}

/** Levenshtein similarity: 1.0 = identical, 0.0 = completely different. */
export function levenshteinSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 1.0
  return 1.0 - levenshteinDistance(a, b) / maxLen
}

/** Jaro similarity (0.0 to 1.0). */
export function jaroSimilarity(a: string, b: string): number {
  if (a === b) return 1.0
  if (a.length === 0 || b.length === 0) return 0.0

  const matchWindow = Math.max(Math.floor(Math.max(a.length, b.length) / 2) - 1, 0)
  const aMatches = new Array(a.length).fill(false)
  const bMatches = new Array(b.length).fill(false)

  let matches = 0
  let transpositions = 0

  for (let i = 0; i < a.length; i++) {
    const start = Math.max(0, i - matchWindow)
    const end = Math.min(i + matchWindow + 1, b.length)
    for (let j = start; j < end; j++) {
      if (bMatches[j] || a[i] !== b[j]) continue
      aMatches[i] = true
      bMatches[j] = true
      matches++
      break
    }
  }

  if (matches === 0) return 0.0

  let k = 0
  for (let i = 0; i < a.length; i++) {
    if (!aMatches[i]) continue
    while (!bMatches[k]) k++
    if (a[i] !== b[k]) transpositions++
    k++
  }

  return (matches / a.length + matches / b.length + (matches - transpositions / 2) / matches) / 3
}

/** Jaro-Winkler similarity — boosts score for common prefixes. */
export function jaroWinklerSimilarity(a: string, b: string, prefixScale = 0.1): number {
  const jaro = jaroSimilarity(a, b)

  // Common prefix length (max 4 chars per Winkler)
  let prefix = 0
  const maxPrefix = Math.min(4, Math.min(a.length, b.length))
  for (let i = 0; i < maxPrefix; i++) {
    if (a[i] !== b[i]) break
    prefix++
  }

  return jaro + prefix * prefixScale * (1 - jaro)
}

/** Token-based Jaccard similarity — good for reordered words. */
export function tokenJaccardSimilarity(a: string, b: string): number {
  const tokensA = new Set(a.split(/\s+/).filter(Boolean))
  const tokensB = new Set(b.split(/\s+/).filter(Boolean))
  if (tokensA.size === 0 && tokensB.size === 0) return 1.0
  if (tokensA.size === 0 || tokensB.size === 0) return 0.0

  let intersection = 0
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++
  }
  return intersection / (tokensA.size + tokensB.size - intersection)
}

/** Containment check — is one string mostly contained in the other? */
export function containmentScore(shorter: string, longer: string): number {
  if (shorter.length === 0) return 0
  if (shorter.length > longer.length) [shorter, longer] = [longer, shorter]
  if (longer.includes(shorter)) return 1.0

  // Token containment
  const shortTokens = shorter.split(/\s+/).filter(Boolean)
  const longTokens = new Set(longer.split(/\s+/).filter(Boolean))
  if (shortTokens.length === 0) return 0
  let contained = 0
  for (const t of shortTokens) {
    if (longTokens.has(t)) contained++
  }
  return contained / shortTokens.length
}

// ── Composite similarity ────────────────────────────────────────────────────

export interface SimilarityResult {
  /** Overall similarity score 0.0 - 1.0 */
  score: number
  /** Individual signal scores */
  signals: {
    levenshtein: number
    jaroWinkler: number
    tokenJaccard: number
    containment: number
  }
  /** Whether texts are likely the same after normalization */
  exactNormalized: boolean
}

/** Compute composite similarity between two strings. Normalizes before comparing. */
export function computeSimilarity(a: string, b: string): SimilarityResult {
  const normA = normalizeText(a)
  const normB = normalizeText(b)

  if (normA === normB) {
    return {
      score: 1.0,
      signals: { levenshtein: 1.0, jaroWinkler: 1.0, tokenJaccard: 1.0, containment: 1.0 },
      exactNormalized: true,
    }
  }

  const lev = levenshteinSimilarity(normA, normB)
  const jw = jaroWinklerSimilarity(normA, normB)
  const tj = tokenJaccardSimilarity(normA, normB)
  const cont = containmentScore(normA, normB)

  // Weighted composite: JW is best for typos, Jaccard for reordering, containment for abbreviations
  let score = jw * 0.35 + lev * 0.25 + tj * 0.25 + cont * 0.15

  // Full containment floor: if one string is entirely inside the other and
  // the shorter string is meaningful (≥3 chars), treat as strong match.
  // Handles "HRDR" vs "HRDR Event", "Berghain" vs "Berghain Party".
  const shorter = normA.length <= normB.length ? normA : normB
  if (cont === 1.0 && shorter.length >= 3) {
    score = Math.max(score, 0.85)
  }

  return {
    score,
    signals: { levenshtein: lev, jaroWinkler: jw, tokenJaccard: tj, containment: cont },
    exactNormalized: false,
  }
}

/** Compute title-specific similarity (strips noise words, handles years/editions). */
export function computeTitleSimilarity(a: string, b: string): SimilarityResult & {
  yearMatch: boolean | null
  editionMatch: boolean | null
} {
  const yearA = extractYear(a)
  const yearB = extractYear(b)
  const yearMatch = yearA != null && yearB != null ? yearA === yearB : null

  const edA = extractEdition(a)
  const edB = extractEdition(b)
  const editionMatch = edA != null && edB != null ? edA === edB : null

  const normA = normalizeTitle(a)
  const normB = normalizeTitle(b)

  if (normA === normB) {
    return {
      score: 1.0,
      signals: { levenshtein: 1.0, jaroWinkler: 1.0, tokenJaccard: 1.0, containment: 1.0 },
      exactNormalized: true,
      yearMatch,
      editionMatch,
    }
  }

  const base = computeSimilarity(normA, normB)

  // Penalize year/edition mismatch
  let penalty = 0
  if (yearMatch === false) penalty += 0.3
  if (editionMatch === false) penalty += 0.2

  return {
    ...base,
    score: Math.max(0, base.score - penalty),
    yearMatch,
    editionMatch,
  }
}
