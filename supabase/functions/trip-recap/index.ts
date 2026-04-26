/**
 * trip-recap — generate a post-trip narrative recap.
 *
 * Inputs (POST JSON):
 *   { trip_id: string, refresh?: boolean }
 *
 * Output:
 *   { summary: string, highlights: {...}, generated_at: string }
 *
 * Reads trip + places + budget + days, asks Claude Haiku for a warm
 * 2-4 sentence recap + structured highlights, upserts into
 * `trip_recaps` (PK trip_id). If `refresh` is false and a row exists
 * already, returns the cached recap without calling the LLM.
 */

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface Highlights {
  top_places: string[];
  cities: string[];
  countries: string[];
  place_count: number;
  day_count: number | null;
  total_spent: { currency: string; amount: number }[];
  favourite_day?: { date: string; names: string[] };
}

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadTrip(supabase: any, tripId: string) {
  const { data: trip, error } = await supabase
    .from('trips')
    .select(
      `id, title, start_date, end_date, owner_id,
       trip_places(
         id, day_id, custom_name, sort_order,
         venues:venue_id(name, city:city_id(name), country:country_id(name)),
         events:event_id(title, city:city_id(name), country:country_id(name)),
         hotels:hotel_id(name)
       ),
       trip_days(id, date, title)`,
    )
    .eq('id', tripId)
    .single();
  if (error) throw error;

  const { data: budget } = await supabase
    .from('trip_budget_items')
    .select('amount, currency')
    .eq('trip_id', tripId);

  return { trip, budget: budget ?? [] };
}

function placeName(p: {
  venues?: { name?: string } | null;
  events?: { title?: string } | null;
  hotels?: { name?: string } | null;
  custom_name?: string | null;
}): string {
  return (
    p.venues?.name ?? p.events?.title ?? p.hotels?.name ?? p.custom_name ?? 'Stop'
  );
}

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildHighlights(trip: any, budget: { amount: number; currency: string }[]): Highlights {
  const cities = new Set<string>();
  const countries = new Set<string>();
  // deno-lint-ignore no-explicit-any
  const perDay = new Map<string, string[]>();

  // deno-lint-ignore no-explicit-any
  for (const p of trip.trip_places ?? []) {
    const city = p.venues?.city?.name ?? p.events?.city?.name;
    const country = p.venues?.country?.name ?? p.events?.country?.name;
    if (city) cities.add(city);
    if (country) countries.add(country);

    if (p.day_id) {
      if (!perDay.has(p.day_id)) perDay.set(p.day_id, []);
      perDay.get(p.day_id)!.push(placeName(p));
    }
  }

  // Favourite day = day with most places
  let favDayId: string | null = null;
  let maxPlaces = 0;
  for (const [dayId, names] of perDay) {
    if (names.length > maxPlaces) {
      maxPlaces = names.length;
      favDayId = dayId;
    }
  }
  // deno-lint-ignore no-explicit-any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const favDay = favDayId ? (trip.trip_days ?? []).find((d: any) => d.id === favDayId) : null;

  const totals = new Map<string, number>();
  for (const item of budget) {
    totals.set(item.currency, (totals.get(item.currency) ?? 0) + Number(item.amount));
  }

  return {
    // deno-lint-ignore no-explicit-any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    top_places: (trip.trip_places ?? []).slice(0, 8).map((p: any) => placeName(p)),
    cities: [...cities],
    countries: [...countries],
    place_count: (trip.trip_places ?? []).length,
    day_count: trip.trip_days?.length ?? null,
    total_spent: [...totals.entries()].map(([currency, amount]) => ({ currency, amount })),
    favourite_day: favDay
      ? { date: favDay.date, names: perDay.get(favDayId!) ?? [] }
      : undefined,
  };
}

async function generateSummary(highlights: Highlights, title: string): Promise<string> {
  const prompt = `You are writing a warm, personal recap of a completed trip for the traveler themselves.
Trip title: ${title}
Cities visited: ${highlights.cities.join(', ') || 'unknown'}
Countries: ${highlights.countries.join(', ') || 'unknown'}
${highlights.place_count} stops over ${highlights.day_count ?? 'some'} days.
Top places: ${highlights.top_places.join(', ')}

Write 2–4 sentences in a warm, second-person voice ("your trip…"). No intro ("Here's your recap"), no hashtags, no emoji. Sound like a thoughtful friend summarizing their journey.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) {
    throw new Error(`anthropic ${res.status}: ${await res.text()}`);
  }
  const body = await res.json();
  const text = body?.content?.[0]?.text?.trim();
  if (!text) throw new Error('empty claude response');
  return text;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405, headers: cors });
  }

  try {
    const auth = req.headers.get('authorization') ?? '';
    const jwt = auth.replace(/^Bearer\s+/i, '');
    if (!jwt) {
      return new Response(JSON.stringify({ error: 'missing auth' }), {
        status: 401,
        headers: { ...cors, 'content-type': 'application/json' },
      });
    }

    // Resolve caller for generated_by
    const userClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: userResp } = await userClient.auth.getUser();
    const userId = userResp?.user?.id;
    if (!userId) {
      return new Response(JSON.stringify({ error: 'invalid auth' }), {
        status: 401,
        headers: { ...cors, 'content-type': 'application/json' },
      });
    }

    const { trip_id, refresh } = await req.json();
    if (!trip_id) {
      return new Response(JSON.stringify({ error: 'trip_id required' }), {
        status: 400,
        headers: { ...cors, 'content-type': 'application/json' },
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Return cached unless refresh
    if (!refresh) {
      const { data: cached } = await admin
        .from('trip_recaps')
        .select('*')
        .eq('trip_id', trip_id)
        .maybeSingle();
      if (cached) {
        return new Response(JSON.stringify(cached), {
          headers: { ...cors, 'content-type': 'application/json' },
        });
      }
    }

    const { trip, budget } = await loadTrip(admin, trip_id);
    const highlights = buildHighlights(trip, budget);
    const summary = await generateSummary(highlights, trip.title);

    const { data: upserted, error: upsertErr } = await admin
      .from('trip_recaps')
      .upsert({
        trip_id,
        summary,
        highlights,
        generated_at: new Date().toISOString(),
        generated_by: userId,
      })
      .select()
      .single();
    if (upsertErr) throw upsertErr;

    return new Response(JSON.stringify(upserted), {
      headers: { ...cors, 'content-type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String((err as Error).message ?? err) }),
      { status: 500, headers: { ...cors, 'content-type': 'application/json' } },
    );
  }
});
