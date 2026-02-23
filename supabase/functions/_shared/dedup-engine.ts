import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'

export interface DedupResult {
  status: 'unique' | 'duplicate' | 'merge_candidate'
  match_id?: string
  match_table?: string
  match_score?: number
  details: Record<string, unknown>
}

// Thresholds for dedup classification
const VENUE_DUPLICATE_THRESHOLD = 0.85
const VENUE_MERGE_THRESHOLD = 0.65
const VENUE_MAX_DISTANCE_M = 100

const EVENT_DUPLICATE_THRESHOLD = 0.80
const EVENT_MERGE_THRESHOLD = 0.60

const PERSONALITY_DUPLICATE_THRESHOLD = 0.90
const PERSONALITY_MERGE_THRESHOLD = 0.75

export async function deduplicateVenue(
  supabase: SupabaseClient,
  venue: { name: string; latitude: number; longitude: number; category?: string }
): Promise<DedupResult> {
  if (!venue.latitude || !venue.longitude) {
    return { status: 'unique', details: { reason: 'no_coordinates' } }
  }

  const { data: matches, error } = await supabase.rpc('find_venue_duplicates', {
    p_name: venue.name,
    p_latitude: venue.latitude,
    p_longitude: venue.longitude,
    p_category: venue.category || null,
    p_threshold: 0.4,
  })

  if (error) {
    console.error('Venue dedup error:', error)
    return { status: 'unique', details: { error: error.message } }
  }

  if (!matches || matches.length === 0) {
    return { status: 'unique', details: {} }
  }

  const best = matches[0]

  if (best.combined_score >= VENUE_DUPLICATE_THRESHOLD && best.geo_distance_m < VENUE_MAX_DISTANCE_M) {
    return {
      status: 'duplicate',
      match_id: best.venue_id,
      match_table: 'venues',
      match_score: best.combined_score,
      details: {
        name_similarity: best.name_similarity,
        geo_distance_m: best.geo_distance_m,
        category_match: best.category_match,
        matched_name: best.venue_name,
      },
    }
  }

  if (best.combined_score >= VENUE_MERGE_THRESHOLD) {
    return {
      status: 'merge_candidate',
      match_id: best.venue_id,
      match_table: 'venues',
      match_score: best.combined_score,
      details: {
        name_similarity: best.name_similarity,
        geo_distance_m: best.geo_distance_m,
        category_match: best.category_match,
        matched_name: best.venue_name,
      },
    }
  }

  return { status: 'unique', details: {} }
}

export async function deduplicateEvent(
  supabase: SupabaseClient,
  event: { title: string; start_date: string; city?: string }
): Promise<DedupResult> {
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

  const best = matches[0]

  if (best.combined_score >= EVENT_DUPLICATE_THRESHOLD) {
    return {
      status: 'duplicate',
      match_id: best.event_id,
      match_table: 'events',
      match_score: best.combined_score,
      details: {
        title_similarity: best.title_similarity,
        date_diff_hours: best.date_diff_hours,
        city_match: best.city_match,
        matched_title: best.event_title,
      },
    }
  }

  if (best.combined_score >= EVENT_MERGE_THRESHOLD) {
    return {
      status: 'merge_candidate',
      match_id: best.event_id,
      match_table: 'events',
      match_score: best.combined_score,
      details: {
        title_similarity: best.title_similarity,
        date_diff_hours: best.date_diff_hours,
        city_match: best.city_match,
        matched_title: best.event_title,
      },
    }
  }

  return { status: 'unique', details: {} }
}

export async function deduplicatePersonality(
  supabase: SupabaseClient,
  personality: { name: string }
): Promise<DedupResult> {
  const { data: matches, error } = await supabase.rpc('find_personality_duplicates', {
    p_name: personality.name,
    p_threshold: 0.6,
  })

  if (error) {
    console.error('Personality dedup error:', error)
    return { status: 'unique', details: { error: error.message } }
  }

  if (!matches || matches.length === 0) {
    return { status: 'unique', details: {} }
  }

  const best = matches[0]

  if (best.name_similarity >= PERSONALITY_DUPLICATE_THRESHOLD) {
    return {
      status: 'duplicate',
      match_id: best.personality_id,
      match_table: 'personalities',
      match_score: best.name_similarity,
      details: { matched_name: best.personality_name },
    }
  }

  if (best.name_similarity >= PERSONALITY_MERGE_THRESHOLD) {
    return {
      status: 'merge_candidate',
      match_id: best.personality_id,
      match_table: 'personalities',
      match_score: best.name_similarity,
      details: { matched_name: best.personality_name },
    }
  }

  return { status: 'unique', details: {} }
}

// Dispatch to the right dedup function based on target table
export async function deduplicate(
  supabase: SupabaseClient,
  targetTable: string,
  normalizedData: Record<string, unknown>
): Promise<DedupResult> {
  switch (targetTable) {
    case 'venues':
      return deduplicateVenue(supabase, {
        name: normalizedData.name as string,
        latitude: normalizedData.latitude as number,
        longitude: normalizedData.longitude as number,
        category: normalizedData.category as string | undefined,
      })

    case 'events':
      return deduplicateEvent(supabase, {
        title: normalizedData.title as string,
        start_date: normalizedData.start_date as string,
        city: normalizedData.city as string | undefined,
      })

    case 'personalities':
      return deduplicatePersonality(supabase, {
        name: normalizedData.name as string,
      })

    case 'news_articles': {
      // News dedup is simpler — check URL uniqueness
      const url = normalizedData.url as string
      if (!url) return { status: 'unique', details: {} }
      const { data } = await supabase
        .from('news_articles')
        .select('id')
        .eq('url', url)
        .maybeSingle()
      if (data) {
        return {
          status: 'duplicate',
          match_id: data.id,
          match_table: 'news_articles',
          match_score: 1.0,
          details: { matched_by: 'exact_url' },
        }
      }
      return { status: 'unique', details: {} }
    }

    default:
      return { status: 'unique', details: { reason: `no_dedup_for_${targetTable}` } }
  }
}
