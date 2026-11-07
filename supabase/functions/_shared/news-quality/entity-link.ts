// Entity disambiguation + linking for the news quality pipeline.
// Fuzzy-matches AI-suggested names against existing rows in countries/cities/personalities/organisations.
// Strict guards prevent false positives (e.g. "Georgia" the US state vs the country).

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'
import { proseStateContradiction, US_STATE_BY_ABBR } from '../city-collision-guard.ts'

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
const US_STATE_NAMES = new Set(Object.values(US_STATE_BY_ABBR).map(norm))

const mentionKey = (value: string) =>
  norm(value.normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' '))

function unsupportedStateExpansion(hint: string, candidate: string, text: string): boolean {
  const state = norm(hint)
  if (!US_STATE_NAMES.has(state)) return false
  const city = mentionKey(candidate)
  const stateToken = ` ${state} `
  const cityToken = ` ${city} `
  if (city === state || !cityToken.includes(stateToken)) return false
  const prose = ` ${mentionKey(text)} `
  const qualifier = cityToken.replace(stateToken, ' ').trim()
  return prose.includes(stateToken) && !prose.includes(cityToken) &&
    (qualifier.length <= 2 || !prose.includes(` ${qualifier} `))
}

export async function resolveEntities(
  supabase: SupabaseClient,
  table: 'countries' | 'cities' | 'personalities' | 'organizations',
  entityType: EntityType,
  names: string[],
  body: string,
  nameColumn = 'name',
  headline = '',
): Promise<ResolveResult> {
  const linked: EntityCandidate[] = []
  const needsReview: { name: string; score: number; reason: string }[] = []
  if (!names.length) return { linked, needsReview }

  for (const rawName of names) {
    const name = rawName.trim()
    if (!name || name.length < 2) continue

    if (table === 'cities' && entityType === 'city' && nameColumn === 'name') {
      // Use the catalogue's unaccented key for names such as Montréal. ASCII
      // input already has the same key after case and whitespace normalization.
      const keyResult = /^[\x20-\x7e]+$/.test(name)
        ? { data: norm(name), error: null }
        : await supabase.rpc('city_canonical_key', { p_name: name })
      if (keyResult.error) {
        console.warn(`entity-link city key lookup failed: ${keyResult.error.message}`)
        continue
      }
      const { data: exact, error: exactError } = await supabase
        .from('cities')
        .select('id, name, region_name, shell_status')
        .eq('canonical_key', keyResult.data)
        .is('duplicate_of_id', null)
        .limit(2)

      if (exactError) {
        console.warn(`entity-link exact city lookup failed: ${exactError.message}`)
        continue
      }
      if (exact?.length) {
        // An exact archived name can be a region filed as a city. Stop here
        // so the fuzzy lookup cannot substitute a different settlement.
        if (exact.every((city) => city.shell_status === 'ghost')) continue
        if (exact.length > 1) {
          needsReview.push({ name, score: 1, reason: 'ambiguous:multiple canonical cities share this name' })
        } else {
          const city = exact[0]
          const collision = proseStateContradiction(city, body)
          if (collision) {
            needsReview.push({ name: city.name, score: 1, reason: `city_collision:${collision}` })
          } else {
            linked.push({ id: city.id, name: city.name, score: 1 })
          }
        }
        continue
      }
    }

    // Cheap exact-ish prefilter via ilike; trigram score for ranking.
    // Cities also select `region_name`: it is the only thing the collision
    // guard below can corroborate the article's prose against.
    const lookup = supabase
      .from(table)
      .select(table === 'cities' ? `id, ${nameColumn}, region_name` : `id, ${nameColumn}`)
      .ilike(nameColumn, `%${name.slice(0, 60)}%`)
    if (table === 'cities') lookup.neq('shell_status', 'ghost').is('duplicate_of_id', null)
    const { data, error } = await lookup.limit(8)

    if (error) {
      // Unresolvable, not reviewable — a human can't act on a failed lookup.
      console.warn(`entity-link query_error (${table}/${name}): ${error.message}`)
      continue
    }

    const rows = (data ?? []) as unknown as Array<Record<string, unknown>>
    if (!rows.length) continue // no candidate in DB — nothing to review

    let best: (EntityCandidate & { regionName: string | null }) | null = null
    for (const row of rows) {
      const candidateName = String(row[nameColumn] ?? '')
      const score = trigramSimilarity(name, candidateName)
      if (!best || score > best.score) {
        best = {
          id: String(row.id),
          name: candidateName,
          score,
          regionName: row.region_name == null ? null : String(row.region_name),
        }
      }
    }
    if (!best) continue
    // A state-only model hint must not manufacture a city by expanding to a
    // substring match. Keep the candidate when the article names the city.
    if (entityType === 'city' && unsupportedStateExpansion(name, best.name, headline + ' ' + body)) continue

    const guard = passesDisambiguationGuard(entityType, best.name, body)
    if (!guard.ok) {
      needsReview.push({ name: best.name, score: best.score, reason: guard.reason ?? 'ambiguous' })
      continue
    }

    // Same-name city collision. `cities` cannot hold Portland ME and Portland
    // OR at once, so a name match alone proved nothing and 13 Maine articles
    // were tagged onto Portland, Oregon's city page. Review rather than link
    // when the article's own prose names a different state.
    if (entityType === 'city') {
      const collision = proseStateContradiction(
        { name: best.name, region_name: best.regionName },
        body,
      )
      if (collision) {
        needsReview.push({ name: best.name, score: best.score, reason: `city_collision:${collision}` })
        continue
      }
    }

    if (best.score >= AUTO_LINK_MIN) {
      // Drop the internal regionName so the emitted payload shape is unchanged.
      linked.push({ id: best.id, name: best.name, score: best.score })
    } else if (best.score >= REVIEW_MIN) {
      needsReview.push({ name: best.name, score: best.score, reason: 'low_confidence' })
    }
    // below REVIEW_MIN: too weak to be actionable — dropped, not queued
  }

  return { linked, needsReview }
}

// Exposed for unit tests
export const _internals = { trigramSimilarity, passesDisambiguationGuard, COUNTRY_DISAMBIG }
