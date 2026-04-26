/**
 * trip-nudges — scans upcoming/active trips and generates actionable
 * nudge cards into `trip_nudges`. Idempotent via UNIQUE (trip_id,
 * kind, dedupe_key) — re-running safely no-ops on already-seen
 * conditions.
 *
 * Cron-invoked (daily). No body required; a manual call with
 * `{ trip_id: "..." }` scans a single trip (used after itinerary
 * changes to refresh the banner).
 *
 * Generates two nudge kinds at launch:
 *  - event_overlap: featured events in trip country/city that
 *    overlap trip dates
 *  - news_alert: recent (<7d) LGBTQ+-flagged news in trip countries
 */

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface TripRow {
  id: string;
  title: string;
  start_date: string | null;
  end_date: string | null;
  status: string | null;
}

interface NudgeRow {
  trip_id: string;
  kind: 'event_overlap' | 'news_alert' | 'document_expiry' | 'weather_warning' | 'booking_reminder';
  dedupe_key: string;
  title: string;
  body: string | null;
  action_label: string | null;
  action_url: string | null;
  severity: 'info' | 'warning' | 'critical';
}

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function activeTrips(admin: any, tripId?: string): Promise<TripRow[]> {
  const today = new Date().toISOString().slice(0, 10);
  const ninetyDaysOut = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  let q = admin
    .from('trips')
    .select('id, title, start_date, end_date, status')
    .in('status', ['planning', 'active']);
  if (tripId) {
    q = q.eq('id', tripId);
  } else {
    // Only trips that haven't ended yet, and don't start more than 90d out
    q = q.or(`end_date.gte.${today},end_date.is.null`).lte('start_date', ninetyDaysOut);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as TripRow[];
}

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function tripScope(admin: any, tripId: string) {
  const { data: places } = await admin
    .from('trip_places')
    .select('country_id, city_id')
    .eq('trip_id', tripId);
  const countryIds = [
    ...new Set(
      ((places ?? []) as { country_id: string | null }[])
        .map((p) => p.country_id)
        .filter(Boolean) as string[],
    ),
  ];
  const cityIds = [
    ...new Set(
      ((places ?? []) as { city_id: string | null }[])
        .map((p) => p.city_id)
        .filter(Boolean) as string[],
    ),
  ];
  return { countryIds, cityIds };
}

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function eventOverlapNudges(admin: any, trip: TripRow): Promise<NudgeRow[]> {
  if (!trip.start_date || !trip.end_date) return [];
  const { countryIds, cityIds } = await tripScope(admin, trip.id);
  if (countryIds.length === 0 && cityIds.length === 0) return [];

  let q = admin
    .from('events')
    .select('id, title, start_date, end_date, city_id, country_id, featured, status')
    .eq('status', 'active')
    .lte('start_date', `${trip.end_date}T23:59:59Z`)
    .gte('end_date', `${trip.start_date}T00:00:00Z`)
    .limit(20);
  if (cityIds.length > 0 && countryIds.length > 0) {
    q = q.or(`city_id.in.(${cityIds.join(',')}),country_id.in.(${countryIds.join(',')})`);
  } else if (cityIds.length > 0) {
    q = q.in('city_id', cityIds);
  } else {
    q = q.in('country_id', countryIds);
  }
  const { data: events } = await q;
  const rows: NudgeRow[] = [];
  for (const e of ((events ?? []) as {
    id: string;
    title: string;
    start_date: string;
    featured: boolean | null;
  }[])) {
    if (!e.featured) continue; // only surface featured events at launch
    rows.push({
      trip_id: trip.id,
      kind: 'event_overlap',
      dedupe_key: e.id,
      title: `${e.title} overlaps your trip`,
      body: `Happens during your dates (${new Date(e.start_date).toLocaleDateString()}) in a place you'll be.`,
      action_label: 'View event',
      action_url: `/events/${e.id}`,
      severity: 'info',
    });
  }
  return rows;
}

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function newsAlertNudges(admin: any, trip: TripRow): Promise<NudgeRow[]> {
  const { countryIds } = await tripScope(admin, trip.id);
  if (countryIds.length === 0) return [];
  const sinceIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: articles } = await admin
    .from('news_articles')
    .select('id, title, published_at, sensitivity_flags, lgbti_relevance_score, slug')
    .overlaps('country_ids', countryIds)
    .gte('published_at', sinceIso)
    .order('published_at', { ascending: false })
    .limit(10);

  const rows: NudgeRow[] = [];
  for (const a of ((articles ?? []) as {
    id: string;
    title: string;
    sensitivity_flags: string[] | null;
    lgbti_relevance_score: number | null;
    slug: string | null;
  }[])) {
    const flagged = (a.sensitivity_flags && a.sensitivity_flags.length > 0) ||
      (a.lgbti_relevance_score ?? 0) >= 0.7;
    if (!flagged) continue;
    rows.push({
      trip_id: trip.id,
      kind: 'news_alert',
      dedupe_key: a.id,
      title: a.title.slice(0, 140),
      body: 'Recent news flagged as LGBTQ+-relevant in a country on your trip.',
      action_label: 'Read article',
      action_url: a.slug ? `/news/${a.slug}` : `/news`,
      severity: a.sensitivity_flags && a.sensitivity_flags.length > 0 ? 'warning' : 'info',
    });
  }
  return rows;
}

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function bookingReminderNudges(admin: any, trip: TripRow): Promise<NudgeRow[]> {
  if (!trip.start_date) return [];
  const daysUntilStart = Math.floor(
    (new Date(trip.start_date).getTime() - Date.now()) / (24 * 60 * 60 * 1000),
  );
  if (daysUntilStart < 0 || daysUntilStart > 14) return [];
  // Only emit once per trip when inside the 14-day window
  return [{
    trip_id: trip.id,
    kind: 'booking_reminder',
    dedupe_key: `countdown_14d`,
    title: `Your trip starts in ${daysUntilStart} day${daysUntilStart === 1 ? '' : 's'}`,
    body: `Double-check your bookings: flights, accommodation, and any activities with timed entry.`,
    action_label: 'Open trip',
    action_url: `/trips/${trip.id}`,
    severity: 'info',
  }];
}

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function scanOne(admin: any, trip: TripRow): Promise<number> {
  const [evs, news, book] = await Promise.all([
    eventOverlapNudges(admin, trip).catch(() => [] as NudgeRow[]),
    newsAlertNudges(admin, trip).catch(() => [] as NudgeRow[]),
    bookingReminderNudges(admin, trip).catch(() => [] as NudgeRow[]),
  ]);
  const rows = [...evs, ...news, ...book];
  if (rows.length === 0) return 0;
  // Upsert ignoring conflicts on (trip_id, kind, dedupe_key)
  const { error } = await admin
    .from('trip_nudges')
    .upsert(rows, { onConflict: 'trip_id,kind,dedupe_key', ignoreDuplicates: true });
  if (error) throw error;
  return rows.length;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    let tripId: string | undefined;
    if (req.method === 'POST') {
      try {
        const body = await req.json();
        tripId = body?.trip_id;
      } catch {
        // no body — full scan
      }
    }
    const trips = await activeTrips(admin, tripId);
    let totalCandidates = 0;
    for (const t of trips) {
      totalCandidates += await scanOne(admin, t);
    }
    return new Response(
      JSON.stringify({ scanned: trips.length, candidates: totalCandidates }),
      { headers: { ...cors, 'content-type': 'application/json' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String((err as Error).message ?? err) }),
      { status: 500, headers: { ...cors, 'content-type': 'application/json' } },
    );
  }
});
