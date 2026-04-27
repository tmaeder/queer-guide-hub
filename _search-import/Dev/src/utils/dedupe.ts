/**
 * Deduplication utilities.
 *
 * Strong match: normalised(name) + city + website domain
 * Fuzzy match: Jaro-Winkler similarity on normalised name + city bonus
 */
import { normalizeText, extractDomain } from './text.js'

export interface DedupeKey {
  name: string
  city?: string | null
  website?: string | null
  address?: string | null
}

export type MatchMethod = 'exact' | 'strong' | 'fuzzy' | 'none'

export interface DedupeResult {
  method: MatchMethod
  confidence: number
}

// ---------------------------------------------------------------------------
// Strong (exact) key
// ---------------------------------------------------------------------------

/** Compute a canonical lookup key for a strong (exact) match. */
export function computeStrongKey(entity: DedupeKey): string {
  const domain = entity.website ? (extractDomain(entity.website) ?? '') : ''
  return [
    normalizeText(entity.name),
    entity.city ? normalizeText(entity.city) : '',
    domain,
  ].join('||')
}

// ---------------------------------------------------------------------------
// Jaro-Winkler similarity
// ---------------------------------------------------------------------------

function jaroSimilarity(s1: string, s2: string): number {
  if (s1 === s2) return 1
  if (!s1.length || !s2.length) return 0

  const matchWindow = Math.floor(Math.max(s1.length, s2.length) / 2) - 1
  const s1Matched = new Uint8Array(s1.length)
  const s2Matched = new Uint8Array(s2.length)

  let matches = 0
  for (let i = 0; i < s1.length; i++) {
    const lo = Math.max(0, i - matchWindow)
    const hi = Math.min(i + matchWindow + 1, s2.length)
    for (let j = lo; j < hi; j++) {
      if (s2Matched[j] || s1[i] !== s2[j]) continue
      s1Matched[i] = 1
      s2Matched[j] = 1
      matches++
      break
    }
  }

  if (!matches) return 0

  let transpositions = 0
  let k = 0
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matched[i]) continue
    while (!s2Matched[k]) k++
    if (s1[i] !== s2[k]) transpositions++
    k++
  }

  return (
    (matches / s1.length +
      matches / s2.length +
      (matches - transpositions / 2) / matches) /
    3
  )
}

export function jaroWinkler(s1: string, s2: string, p = 0.1): number {
  const jaro = jaroSimilarity(s1, s2)
  let prefix = 0
  for (let i = 0; i < Math.min(4, s1.length, s2.length); i++) {
    if (s1[i] === s2[i]) prefix++
    else break
  }
  return jaro + prefix * p * (1 - jaro)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const FUZZY_THRESHOLD = 0.85

/** Compare two entities. Returns method and confidence (0–1). */
export function compareEntities(a: DedupeKey, b: DedupeKey): DedupeResult {
  // Strong key match (name + city + domain)
  if (computeStrongKey(a) === computeStrongKey(b)) {
    return { method: 'strong', confidence: 1.0 }
  }

  // Address match (if both have addresses)
  if (a.address && b.address) {
    const addrA = normalizeText(a.address)
    const addrB = normalizeText(b.address)
    if (addrA === addrB && addrA.length > 5) {
      const nameA = normalizeText(a.name)
      const nameB = normalizeText(b.name)
      if (jaroWinkler(nameA, nameB) > 0.8) {
        return { method: 'strong', confidence: 0.97 }
      }
    }
  }

  // Fuzzy name match with city bonus
  const nameA = normalizeText(a.name)
  const nameB = normalizeText(b.name)
  let score = jaroWinkler(nameA, nameB)

  if (a.city && b.city) {
    const cityMatch = normalizeText(a.city) === normalizeText(b.city)
    score = cityMatch ? Math.min(1, score + 0.1) : Math.max(0, score - 0.15)
  }

  if (score >= FUZZY_THRESHOLD) {
    return { method: 'fuzzy', confidence: score }
  }

  return { method: 'none', confidence: score }
}
