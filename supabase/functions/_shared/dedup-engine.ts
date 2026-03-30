/**
 * Deduplication engine for content imports and automated checks.
 *
 * Supports venues, events, personalities, and news articles with
 * fuzzy matching, multi-signal scoring, and confidence-based classification.
 *
 * Classification:
 * - duplicate (>=duplicate_threshold): Clearly the same item, safe to skip/merge
 * - merge_candidate (>=merge_threshold): Likely the same, needs review
 * - unique: No match found
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'
import {
  computeSimilarity, computeTitleSimilarity, normalizeText,
  type SimilarityResult,
} from './fuzzy-match.ts'
import {
  computeDedupConfidence, type ConfidenceResult, type ReviewAction,
} from './confidence-scoring.ts'

// ── Types ────────────────────────────────────────────────────────────────────

export type DedupStatus = 'unique' | 'duplicate' | 'merge_candidate'

export interface DedupResult {
  status: DedupStatus
  match_id?: string
  match_table?: string
  match_score?: number
  confidence?: ConfidenceResult
  details: Record<string, unknown>
}

export interface DedupMatch {
  id: string
  name: string
  score: number
  confidence: ConfidenceResult
  details: Record<string, unknown>
}

// ── Thresholds ───────────────────────────────────────────────────────────────

interface DedupThresholds {
  duplicate: number
  merge: number
}

const VENUE_THRESHOLDS: DedupThresholds = { duplicate: 0.85, merge: 0.65 }
const EVENT_THRESHOLDS: DedupThresholds = { duplicate: 0.80, merge: 0.60 }
const PERSONALITY_THRESHOLDS: DedupThresholds = { duplicate: 0.90, merge: 0.75 }
const NEWS_THRESHOLDS: DedupThresholds = { duplicate: 0.85, merge: 0.70 }

const VENUE_MAX_DISTANCE_M = 100

// ── Venue deduplication ──────────────────────────────────────────────────────

export async function deduplicateVenue(
  supabase: SupabaseClient,
  venue: {
    name: string
    latitude: number
    longitude: number
    category?: string
    address?: string
    city?: string
    source?: string
  },
): Promise<DedupResult> {
  if (!venue.latitude || !venue.longitude) {
    return { status: 'unique', details: { reason: 'no_coordinates' } }
  }

  // Use DB RPC for geo-filtered candidates (fast pre-filter)
  const { data: matches, error } = await supabase.rpc('find_venue_duplicates', {
    p_name: venue.name,
    p_latitude: venue.latitude,
    p_longitude: venue.longitude,
    p_category: venue.category || null,
    p_threshold: 0.3, // Lower threshold to catch more candidates for fuzzy re-scoring
  })

  if (error) {
    console.error('Venue dedup error:', error)
    return { status: 'unique', details: { error: error.message } }
  }

  if (!matches || matches.length === 0) {
    return { status: 'unique', details: {} }
  }

  // Re-score each candidate with fuzzy matching
  let bestMatch: DedupMatch | null = null

  for (const m of matches) {
    const nameSim = computeSimilarity(venue.name, m.venue_name)
    const geoDistM = m.geo_distance_m as number
    const catMatch = venue.category
      ? normalizeText(venue.category) === normalizeText(m.category ?? '')
      : true // No category to compare = neutral

    const confidence = computeDedupConfidence({
      titleSimilarity: nameSim.score,
      locationMatch: geoDistM < VENUE_MAX_DISTANCE_M,
      geoDistanceM: geoDistM,
      timeDiffMin: null,
      categoryMatch: catMatch,
      sourceMatch: false,
      yearMatch: null,
    })

    if (!bestMatch || confidence.score > bestMatch.confidence.score) {
      bestMatch = {
        id: m.venue_id,
        name: m.venue_name,
        score: confidence.score,
        confidence,
        details: {
          name_similarity: nameSim.score,
          name_signals: nameSim.signals,
          geo_distance_m: geoDistM,
          category_match: catMatch,
          matched_name: m.venue_name,
        },
      }
    }
  }

  if (!bestMatch) return { status: 'unique', details: {} }

  return classifyMatch(bestMatch, 'venues', VENUE_THRESHOLDS)
}

// ── Event deduplication ──────────────────────────────────────────────────────

export async function deduplicateEvent(
  supabase: SupabaseClient,
  event: {
    title: string
    start_date: string
    city?: string
    event_type?: string
    venue_name?: string
    source?: string
  },
): Promise<DedupResult> {
  // Use DB RPC for time+city filtered candidates
  const { data: matches, error } = await supabase.rpc('find_event_duplicates', {
    p_title: event.title,
    p_start_date: event.start_date,
    p_city: event.city || null,
  })

  if (error) {
    console.error('Event dedup error:', error)
    return { status: 'unique', details: { error: error.message } }
  }

  if (!matches || matches.length === 0) {
    return { status: 'unique', details: {} }
  }

  let bestMatch: DedupMatch | null = null

  for (const m of matches) {
    const titleSim = computeTitleSimilarity(event.title, m.event_title)
    const dateDiffHours = Math.abs(m.date_diff_hours as number)
    const timeDiffMin = dateDiffHours * 60
    const cityMatch = m.city_match as boolean

    // Check event_type match if available
    const typeMatch = event.event_type && m.event_type
      ? normalizeText(event.event_type) === normalizeText(m.event_type)
      : true

    const confidence = computeDedupConfidence({
      titleSimilarity: titleSim.score,
      locationMatch: cityMatch,
      geoDistanceM: null,
      timeDiffMin,
      categoryMatch: typeMatch,
      sourceMatch: false,
      yearMatch: titleSim.yearMatch,
    })

    if (!bestMatch || confidence.score > bestMatch.confidence.score) {
      bestMatch = {
        id: m.event_id,
        name: m.event_title,
        score: confidence.score,
        confidence,
        details: {
          title_similarity: titleSim.score,
          title_signals: titleSim.signals,
          date_diff_hours: dateDiffHours,
          city_match: cityMatch,
          type_match: typeMatch,
          year_match: titleSim.yearMatch,
          matched_title: m.event_title,
        },
      }
    }
  }

  if (!bestMatch) return { status: 'unique', details: {} }

  return classifyMatch(bestMatch, 'events', EVENT_THRESHOLDS)
}

// ── Personality deduplication ────────────────────────────────────────────────

export async function deduplicatePersonality(
  supabase: SupabaseClient,
  personality: { name: string; birth_date?: string; nationality?: string },
): Promise<DedupResult> {
  const { data: matches, error } = await supabase.rpc('find_personality_duplicates', {
    p_name: personality.name,
    p_threshold: 0.5, // Lower threshold for fuzzy re-scoring
  })

  if (error) {
    console.error('Personality dedup error:', error)
    return { status: 'unique', details: { error: error.message } }
  }

  if (!matches || matches.length === 0) {
    return { status: 'unique', details: {} }
  }

  let bestMatch: DedupMatch | null = null

  for (const m of matches) {
    const nameSim = computeSimilarity(personality.name, m.personality_name)

    // Boost confidence if birth_date matches
    const birthMatch = personality.birth_date && m.birth_date
      ? personality.birth_date === m.birth_date
      : null

    const factors = [
      { name: 'name_similarity', score: nameSim.score, weight: 0.60, label: 'Name match' },
    ]

    if (birthMatch != null) {
      factors.push({
        name: 'birth_date',
        score: birthMatch ? 1.0 : 0.0,
        weight: 0.30,
        label: birthMatch ? 'Same birth date' : 'Different birth date',
      })
    }

    if (personality.nationality && m.nationality) {
      const natMatch = normalizeText(personality.nationality) === normalizeText(m.nationality)
      factors.push({
        name: 'nationality',
        score: natMatch ? 1.0 : 0.3,
        weight: 0.10,
        label: natMatch ? 'Same nationality' : 'Different nationality',
      })
    }

    const totalWeight = factors.reduce((s, f) => s + f.weight, 0)
    const score = factors.reduce((s, f) => s + f.score * f.weight, 0) / totalWeight
    const confidence: ConfidenceResult = {
      score: Math.round(score * 1000) / 1000,
      action: score >= 0.90 ? 'auto_correct' : score >= 0.60 ? 'needs_review' : 'info_only',
      reasoning: `Name: ${(nameSim.score * 100).toFixed(0)}%${birthMatch != null ? `, birth: ${birthMatch ? 'match' : 'mismatch'}` : ''}`,
      factors,
    }

    if (!bestMatch || confidence.score > bestMatch.confidence.score) {
      bestMatch = {
        id: m.personality_id,
        name: m.personality_name,
        score: confidence.score,
        confidence,
        details: {
          name_similarity: nameSim.score,
          name_signals: nameSim.signals,
          birth_match: birthMatch,
          matched_name: m.personality_name,
        },
      }
    }
  }

  if (!bestMatch) return { status: 'unique', details: {} }

  return classifyMatch(bestMatch, 'personalities', PERSONALITY_THRESHOLDS)
}

// ── News article deduplication ───────────────────────────────────────────────

export async function deduplicateNews(
  supabase: SupabaseClient,
  article: { title: string; url?: string; source_id?: string; excerpt?: string },
): Promise<DedupResult> {
  // 1. Exact URL match — definitive duplicate
  if (article.url) {
    const { data: urlMatch } = await supabase
      .from('news_articles')
      .select('id, title')
      .eq('url', article.url)
      .maybeSingle()

    if (urlMatch) {
      return {
        status: 'duplicate',
        match_id: urlMatch.id,
        match_table: 'news_articles',
        match_score: 1.0,
        confidence: {
          score: 1.0,
          action: 'auto_correct',
          reasoning: 'Exact URL match',
          factors: [{ name: 'url_match', score: 1.0, weight: 1.0, label: 'Exact URL' }],
        },
        details: { matched_by: 'exact_url', matched_title: urlMatch.title },
      }
    }
  }

  // 2. Title similarity check — catch same story from different URLs/sources
  if (!article.title?.trim()) return { status: 'unique', details: {} }

  // Search for recent articles with similar titles (last 7 days window)
  const { data: candidates } = await supabase
    .from('news_articles')
    .select('id, title, url, source_id, excerpt')
    .order('created_at', { ascending: false })
    .limit(200)

  if (!candidates?.length) return { status: 'unique', details: {} }

  let bestMatch: DedupMatch | null = null

  for (const c of candidates) {
    const titleSim = computeTitleSimilarity(article.title, c.title)
    if (titleSim.score < 0.5) continue // Skip obviously different titles

    // Same source = higher chance of true duplicate
    const sourceMatch = article.source_id && c.source_id
      ? article.source_id === c.source_id
      : false

    // Check URL domain similarity (same domain = higher confidence)
    let domainMatch = false
    if (article.url && c.url) {
      try {
        domainMatch = new URL(article.url).hostname === new URL(c.url).hostname
      } catch { /* invalid URL */ }
    }

    // Excerpt similarity if available
    let excerptScore = 0.5 // neutral if unavailable
    if (article.excerpt && c.excerpt) {
      excerptScore = computeSimilarity(article.excerpt, c.excerpt).score
    }

    const factors = [
      { name: 'title_similarity', score: titleSim.score, weight: 0.50, label: 'Title match' },
      { name: 'excerpt_similarity', score: excerptScore, weight: 0.20, label: 'Excerpt match' },
      { name: 'source_match', score: sourceMatch ? 1.0 : (domainMatch ? 0.7 : 0.3), weight: 0.15, label: sourceMatch ? 'Same source' : (domainMatch ? 'Same domain' : 'Different source') },
      { name: 'year_match', score: titleSim.yearMatch === false ? 0.0 : 1.0, weight: 0.15, label: titleSim.yearMatch === false ? 'Different year' : 'Year OK' },
    ]

    const totalWeight = factors.reduce((s, f) => s + f.weight, 0)
    const score = factors.reduce((s, f) => s + f.score * f.weight, 0) / totalWeight
    const confidence: ConfidenceResult = {
      score: Math.round(score * 1000) / 1000,
      action: score >= NEWS_THRESHOLDS.duplicate ? 'auto_correct' : score >= NEWS_THRESHOLDS.merge ? 'needs_review' : 'info_only',
      reasoning: `Title: ${(titleSim.score * 100).toFixed(0)}%, ${sourceMatch ? 'same source' : domainMatch ? 'same domain' : 'different source'}`,
      factors,
    }

    if (!bestMatch || confidence.score > bestMatch.confidence.score) {
      bestMatch = {
        id: c.id,
        name: c.title,
        score: confidence.score,
        confidence,
        details: {
          title_similarity: titleSim.score,
          source_match: sourceMatch,
          domain_match: domainMatch,
          excerpt_similarity: excerptScore,
          matched_title: c.title,
          matched_url: c.url,
        },
      }
    }
  }

  if (!bestMatch) return { status: 'unique', details: {} }

  return classifyMatch(bestMatch, 'news_articles', NEWS_THRESHOLDS)
}

// ── Classification helper ────────────────────────────────────────────────────

function classifyMatch(
  match: DedupMatch,
  table: string,
  thresholds: DedupThresholds,
): DedupResult {
  const status: DedupStatus =
    match.score >= thresholds.duplicate ? 'duplicate'
    : match.score >= thresholds.merge ? 'merge_candidate'
    : 'unique'

  if (status === 'unique') {
    return { status: 'unique', details: {} }
  }

  return {
    status,
    match_id: match.id,
    match_table: table,
    match_score: match.score,
    confidence: match.confidence,
    details: match.details,
  }
}

// ── Unified dispatch ─────────────────────────────────────────────────────────

export async function deduplicate(
  supabase: SupabaseClient,
  targetTable: string,
  normalizedData: Record<string, unknown>,
): Promise<DedupResult> {
  switch (targetTable) {
    case 'venues':
      return deduplicateVenue(supabase, {
        name: normalizedData.name as string,
        latitude: normalizedData.latitude as number,
        longitude: normalizedData.longitude as number,
        category: normalizedData.category as string | undefined,
        address: normalizedData.address as string | undefined,
        city: normalizedData.city as string | undefined,
        source: normalizedData.source as string | undefined,
      })

    case 'events':
      return deduplicateEvent(supabase, {
        title: normalizedData.title as string,
        start_date: normalizedData.start_date as string,
        city: normalizedData.city as string | undefined,
        event_type: normalizedData.event_type as string | undefined,
        venue_name: normalizedData.venue_name as string | undefined,
        source: normalizedData.source as string | undefined,
      })

    case 'personalities':
      return deduplicatePersonality(supabase, {
        name: normalizedData.name as string,
        birth_date: normalizedData.birth_date as string | undefined,
        nationality: normalizedData.nationality as string | undefined,
      })

    case 'news_articles':
      return deduplicateNews(supabase, {
        title: normalizedData.title as string,
        url: normalizedData.url as string | undefined,
        source_id: normalizedData.source_id as string | undefined,
        excerpt: normalizedData.excerpt as string | undefined,
      })

    default:
      return { status: 'unique', details: { reason: `no_dedup_for_${targetTable}` } }
  }
}
