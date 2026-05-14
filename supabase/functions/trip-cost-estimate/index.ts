/**
 * trip-cost-estimate — propose a realistic budget based on the trip's
 * cities, duration, and planned places. Returns a list of suggested
 * budget items the caller can review, edit, and accept into
 * `trip_budget_items`. Does NOT write — suggestion-only. The UI
 * decides which items to persist.
 *
 * Inputs (POST JSON):
 *   { trip_id: string, party_size?: number }
 *
 * Output:
 *   {
 *     currency: string,           // primary suggested currency
 *     party_size: number,
 *     suggestions: Array<{
 *       category: 'food'|'transport'|'accommodation'|'activities'|'shopping'|'other',
 *       title: string,            // short label ("Meals in Lisbon", "Train Lisbon→Porto")
 *       amount: number,           // total amount in `currency`, for party_size
 *       currency: string,         // 3-letter code
 *       per_person: number,       // convenience
 *       notes?: string,
 *     }>
 *   }
 *
 * Strategy: pass a compact trip digest (cities with stop counts, day
 * count, planned activities) to Claude Haiku with a strict JSON
 * instruction. The model returns realistic mid-range estimates.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5';
import { anthropicMessages } from '../_shared/anthropic-shim.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface Suggestion {
  category: 'food' | 'transport' | 'accommodation' | 'activities' | 'shopping' | 'other';
  title: string;
  amount: number;
  currency: string;
  per_person: number;
  notes?: string;
}

interface TripDigest {
  title: string;
  day_count: number | null;
  cities: { name: string; country: string | null; stops: number }[];
  activities: string[];
  hotels: number;
}

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadTrip(supabase: any, tripId: string): Promise<TripDigest> {
  const { data: trip, error } = await supabase
    .from('trips')
    .select(
      `title, start_date, end_date,
       trip_days(id),
       trip_places(
         custom_name,
         venues:venue_id(name, category, city:city_id(name), country:country_id(name)),
         events:event_id(title, city:city_id(name), country:country_id(name)),
         hotels:hotel_id(name)
       )`,
    )
    .eq('id', tripId)
    .single();
  if (error) throw error;

  const cityMap = new Map<string, { name: string; country: string | null; stops: number }>();
  const activities: string[] = [];
  let hotels = 0;

  // deno-lint-ignore no-explicit-any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const p of (trip.trip_places ?? []) as any[]) {
    if (p.hotels) hotels += 1;
    const cityName = p.venues?.city?.name ?? p.events?.city?.name;
    const countryName = p.venues?.country?.name ?? p.events?.country?.name ?? null;
    if (cityName) {
      const key = cityName;
      const prev = cityMap.get(key);
      if (prev) prev.stops += 1;
      else cityMap.set(key, { name: cityName, country: countryName, stops: 1 });
    }
    const label = p.venues?.name ?? p.events?.title ?? p.custom_name;
    if (label) activities.push(label);
  }

  return {
    title: trip.title,
    day_count: trip.trip_days?.length ?? null,
    cities: [...cityMap.values()].sort((a, b) => b.stops - a.stops),
    activities: activities.slice(0, 30),
    hotels,
  };
}

function defaultCurrencyForCountry(country: string | null): string {
  if (!country) return 'EUR';
  const c = country.toLowerCase();
  if (c.includes('united states')) return 'USD';
  if (c.includes('united kingdom') || c === 'uk') return 'GBP';
  if (c.includes('japan')) return 'JPY';
  if (c.includes('canada')) return 'CAD';
  if (c.includes('australia')) return 'AUD';
  if (c.includes('switzerland')) return 'CHF';
  if (c.includes('thailand')) return 'THB';
  if (c.includes('mexico')) return 'MXN';
  if (c.includes('brazil')) return 'BRL';
  return 'EUR';
}

async function askClaude(digest: TripDigest, currency: string, partySize: number): Promise<Suggestion[]> {
  const cityLine = digest.cities
    .map((c) => `${c.name}${c.country ? ` (${c.country})` : ''}: ${c.stops} stops`)
    .join('; ') || 'no cities resolved';

  const prompt = `You are a practical trip cost estimator. Estimate mid-range realistic costs for this trip and return ONLY a JSON object (no prose, no code fences).

Trip: "${digest.title}"
Duration: ${digest.day_count ?? 'unknown'} days
Party size: ${partySize}
Cities: ${cityLine}
Hotel stops planned: ${digest.hotels}
Sample activities: ${digest.activities.slice(0, 15).join(', ') || 'none listed'}

Estimate totals for the WHOLE party (${partySize} people) in ${currency}. Provide one item per major cost line. Categories must be one of: food, transport, accommodation, activities, shopping, other.

Output JSON shape EXACTLY:
{
  "suggestions": [
    { "category": "accommodation", "title": "Hotels — 4 nights Lisbon", "amount": 560, "currency": "${currency}", "notes": "mid-range 3★ double" },
    { "category": "food", "title": "Meals — Lisbon", "amount": 320, "currency": "${currency}", "notes": "2 sit-down + 1 casual per day" }
  ]
}

Rules:
- 4–10 items total, focus on the biggest cost drivers.
- amounts are integers or one decimal, no thousand separators.
- currency is 3-letter ISO.
- Be realistic, not luxurious and not rock-bottom.`;

  const body = await anthropicMessages({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 900,
    messages: [{ role: 'user', content: prompt }],
  });
  const text: string = body?.content?.[0]?.text ?? '';

  // Tolerant JSON extract — strip code fences if any, find first { ... last }.
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('no JSON in claude response');
  const parsed = JSON.parse(cleaned.slice(start, end + 1));

  // deno-lint-ignore no-explicit-any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = (parsed.suggestions ?? []) as any[];
  const allowedCats = new Set(['food', 'transport', 'accommodation', 'activities', 'shopping', 'other']);
  return raw
    .filter((s) => s && typeof s.amount === 'number' && typeof s.title === 'string')
    .map((s) => {
      const category = allowedCats.has(s.category) ? s.category : 'other';
      const cur = typeof s.currency === 'string' && s.currency.length === 3 ? s.currency.toUpperCase() : currency;
      const amount = Math.round(Number(s.amount) * 100) / 100;
      return {
        category,
        title: s.title.slice(0, 120),
        amount,
        currency: cur,
        per_person: Math.round((amount / partySize) * 100) / 100,
        notes: typeof s.notes === 'string' ? s.notes.slice(0, 240) : undefined,
      } as Suggestion;
    });
}

Deno.serve(async (req) => {
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

    const userClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: userResp } = await userClient.auth.getUser();
    if (!userResp?.user?.id) {
      return new Response(JSON.stringify({ error: 'invalid auth' }), {
        status: 401,
        headers: { ...cors, 'content-type': 'application/json' },
      });
    }

    const { trip_id, party_size } = await req.json();
    if (!trip_id) {
      return new Response(JSON.stringify({ error: 'trip_id required' }), {
        status: 400,
        headers: { ...cors, 'content-type': 'application/json' },
      });
    }
    const partySize = Math.max(1, Math.min(20, Number(party_size) || 1));

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const digest = await loadTrip(admin, trip_id);

    // Pick primary currency from first city's country
    const currency = defaultCurrencyForCountry(digest.cities[0]?.country ?? null);

    const suggestions = await askClaude(digest, currency, partySize);

    return new Response(
      JSON.stringify({ currency, party_size: partySize, suggestions }),
      { headers: { ...cors, 'content-type': 'application/json' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String((err as Error).message ?? err) }),
      { status: 500, headers: { ...cors, 'content-type': 'application/json' } },
    );
  }
});
