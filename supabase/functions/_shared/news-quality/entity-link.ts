// Entity disambiguation + linking for the news quality pipeline.
// Fuzzy-matches AI-suggested names against existing rows in countries/cities/personalities/organisations.
// Strict guards prevent false positives (e.g. "Georgia" the US state vs the country).

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'

export type EntityType = 'country' | 'city' | 'region' | 'venue' | 'event' | 'personality' | 'organisation'

export interface EntityCandidate {
  id: string
  name: string
  score: number
  reason?: string
}

export interface ResolveOptions {
  bodySnippet: string
  // Words that must appear nearby (case-insensitive) for an auto-link.
  requireContextFor?: Record<string, string[]>
}

const COUNTRY_DISAMBIG: Record<string, string[]> = {
  georgia: ['tbilisi', 'caucasus', 'georgian government', 'kakheti', 'batumi', '.ge'],
  // North Macedonia vs Macedonia (Greek region) — require country signals
  macedonia: ['skopje', 'north macedonia', 'macedonian government'],
  // Congo (republic vs DR Congo)
  congo: ['brazzaville', 'kinshasa', 'democratic republic'],
}

const norm = (s: string): string => s.toLowerCase().trim().replace(/\s+/g, ' ')

const trigrams = (s: string): Set<string> => {
  const padded = `  ${norm(s)}  `
  const set = new Set<string>()
  for (let i = 0; i < padded.length - 2; i++) set.add(padded.slice(i, i + 3))
  return set
}

const trigramSimilarity = (a: string, b: string): number => {
  const A = trigrams(a)
  const B = trigrams(b)
  if (!A.size || !B.size) return 0
  let inter = 0
  for (const t of A) if (B.has(t)) inter++
  return (2 * inter) / (A.size + B.size)
}

function passesDisambiguationGuard(
  entityType: EntityType,
  candidateName: string,
  body: string,
): { ok: boolean; reason?: string } {
  if (entityType !== 'country') return { ok: true }
  const key = norm(candidateName)
  const hints = COUNTRY_DISAMBIG[key]
  if (!hints) return { ok: true }
  const haystack = body.toLowerCase()
  const hit = hints.some((h) => haystack.includes(h))
  return hit
    ? { ok: true }
    : { ok: false, reason: `ambiguous:${candidateName} requires context (${hints.join('|')})` }
}

export interface ResolveResult {
  linked: EntityCandidate[]
  needsReview: { name: string; score: number; reason: string }[]
}

const AUTO_LINK_MIN = 0.85
const REVIEW_MIN = 0.6

export async function resolveEntities(
  supabase: SupabaseClient,
  table: 'countries' | 'cities' | 'personalities' | 'organisations',
  entityType: EntityType,
  names: string[],
  body: string,
  nameColumn = 'name',
): Promise<ResolveResult> {
  const linked: EntityCandidate[] = []
  const needsReview: { name: string; score: number; reason: string }[] = []
  if (!names.length) return { linked, needsReview }

  for (const rawName of names) {
    const name = rawName.trim()
    if (!name || name.length < 2) continue

    // Cheap exact-ish prefilter via ilike; trigram score for ranking.
    const { data, error } = await supabase
      .from(table)
      .select(`id, ${nameColumn}`)
      .ilike(nameColumn, `%${name.slice(0, 60)}%`)
      .limit(8)

    if (error) {
      needsReview.push({ name, score: 0, reason: `query_error:${error.message}` })
      continue
    }

    const rows = (data ?? []) as unknown as Array<Record<string, unknown>>
    if (!rows.length) {
      needsReview.push({ name, score: 0, reason: 'no_match' })
      continue
    }

    let best: EntityCandidate | null = null
    for (const row of rows) {
      const candidateName = String(row[nameColumn] ?? '')
      const score = trigramSimilarity(name, candidateName)
      if (!best || score > best.score) {
        best = { id: String(row.id), name: candidateName, score }
      }
    }
    if (!best) continue

    const guard = passesDisambiguationGuard(entityType, best.name, body)
    if (!guard.ok) {
      needsReview.push({ name: best.name, score: best.score, reason: guard.reason ?? 'ambiguous' })
      continue
    }

    if (best.score >= AUTO_LINK_MIN) {
      linked.push(best)
    } else if (best.score >= REVIEW_MIN) {
      needsReview.push({ name: best.name, score: best.score, reason: 'low_confidence' })
    } else {
      needsReview.push({ name, score: best.score, reason: 'no_close_match' })
    }
  }

  return { linked, needsReview }
}

// Exposed for unit tests
export const _internals = { trigramSimilarity, passesDisambiguationGuard, COUNTRY_DISAMBIG }
