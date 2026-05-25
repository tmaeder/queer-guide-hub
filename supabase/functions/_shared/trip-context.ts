import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'

// Shared TripContext used by every auto-suggest mechanic so they all read the
// trip in the same shape with the same query cost. Single point of tuning.

export interface TripDestinationContext {
  id: string
  city_id: string | null
  country_id: string | null
  village_id: string | null
  arrive_date: string | null
  depart_date: string | null
  sort_order: number
}

export interface UserPrefs {
  pace: 'chill' | 'balanced' | 'packed'
  vibes: string[]
  sober: boolean
  family: boolean
  min_equality_score: number | null
}

export interface TripContext {
  trip_id: string
  owner_id: string
  title: string
  start_date: string | null
  end_date: string | null
  status: string
  primary_city_id: string | null
  primary_country_code: string | null
  destinations: TripDestinationContext[]
  duration_days: number | null
  season: 'Q1' | 'Q2' | 'Q3' | 'Q4' | null
  user_prefs: UserPrefs
  saved_content_centroid: number[] | null
}

const DEFAULT_PREFS: UserPrefs = {
  pace: 'balanced',
  vibes: [],
  sober: false,
  family: false,
  min_equality_score: null,
}

function seasonOf(startDate: string | null): TripContext['season'] {
  if (!startDate) return null
  const m = new Date(startDate).getUTCMonth() + 1
  if (m <= 3) return 'Q1'
  if (m <= 6) return 'Q2'
  if (m <= 9) return 'Q3'
  return 'Q4'
}

function diffDaysInclusive(start: string | null, end: string | null): number | null {
  if (!start || !end) return null
  const s = new Date(start).getTime()
  const e = new Date(end).getTime()
  if (Number.isNaN(s) || Number.isNaN(e) || e < s) return null
  return Math.round((e - s) / 86_400_000) + 1
}

async function loadUserPrefs(client: SupabaseClient, userId: string): Promise<UserPrefs> {
  const { data } = await client
    .from('profiles')
    .select('travel_preferences')
    .eq('id', userId)
    .maybeSingle()
  const raw = (data?.travel_preferences ?? {}) as Partial<UserPrefs> & Record<string, unknown>
  return {
    ...DEFAULT_PREFS,
    ...raw,
    vibes: Array.isArray(raw.vibes) ? (raw.vibes as string[]) : DEFAULT_PREFS.vibes,
  }
}

/**
 * Load the canonical trip context. Cheap (one trip row + one destinations select +
 * one profile lookup). Centroid is fetched lazily — opt in with `includeCentroid`.
 */
export async function loadTripContext(
  client: SupabaseClient,
  tripId: string,
  opts: { includeCentroid?: boolean } = {},
): Promise<TripContext> {
  const { data: trip, error } = await client
    .from('trips')
    .select('id, owner_id, title, start_date, end_date, status, primary_city_id, primary_country_code')
    .eq('id', tripId)
    .single()
  if (error || !trip) throw new Error(`trip ${tripId} not found: ${error?.message ?? 'missing'}`)

  const { data: destinations } = await client
    .from('trip_destinations')
    .select('id, city_id, country_id, village_id, arrive_date, depart_date, sort_order')
    .eq('trip_id', tripId)
    .order('sort_order', { ascending: true })

  const userPrefs = await loadUserPrefs(client, trip.owner_id)

  let centroid: number[] | null = null
  if (opts.includeCentroid) {
    const { data: c } = await client.rpc('get_user_saved_content_centroid', { p_user_id: trip.owner_id })
    if (Array.isArray(c)) centroid = c as number[]
  }

  return {
    trip_id: trip.id,
    owner_id: trip.owner_id,
    title: trip.title,
    start_date: trip.start_date,
    end_date: trip.end_date,
    status: trip.status,
    primary_city_id: trip.primary_city_id,
    primary_country_code: trip.primary_country_code,
    destinations: (destinations ?? []) as TripDestinationContext[],
    duration_days: diffDaysInclusive(trip.start_date, trip.end_date),
    season: seasonOf(trip.start_date),
    user_prefs: userPrefs,
    saved_content_centroid: centroid,
  }
}
