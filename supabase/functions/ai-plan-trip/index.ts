/**
 * ai-plan-trip — generate a draft itinerary for a trip given a free-text prompt.
 *
 * Inputs (POST JSON):
 *   { trip_id: string, prompt: string }
 *
 * Output:
 *   { draft: { days: [{ date: string, places: [{ venue_id?: string, event_id?: string,
 *     custom_name?: string, notes?: string }] }] }, candidates_used: number }
 *
 * Pipeline:
 *   1. Auth caller, verify they're a member of trip_id (RLS does the heavy lifting,
 *      we just need an authenticated supabase client).
 *   2. Pull trip metadata (start/end dates, country/city scope from existing places).
 *   3. Search Meilisearch for ~30 candidate venues + events matching the destination.
 *   4. Send candidates + prompt + dates to Claude; ask for structured JSON.
 *   5. Return draft to client. The client renders a diff and the user clicks Apply,
 *      which inserts trip_places rows via the standard mutation.
 *
 * The function never writes — generation is pure. Apply is client-side so users
 * see the diff before any change.
 */

// Deno edge function — runs in Supabase runtime, not in the app bundle.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5';
import { anthropicMessages } from '../_shared/anthropic-shim.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const MEILISEARCH_URL = Deno.env.get('MEILISEARCH_URL') ?? '';
const MEILISEARCH_KEY = Deno.env.get('MEILISEARCH_SEARCH_KEY') ?? '';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface TripContext {
  id: string;
  start_date: string | null;
  end_date: string | null;
  cities: string[];
  countries: string[];
  existing_venue_ids: string[];
}

interface Candidate {
  id: string;
  kind: 'venue' | 'event';
  name: string;
  city?: string;
  country?: string;
  category?: string;
  description?: string;
}

interface DraftPlace {
  venue_id?: string;
  event_id?: string;
  custom_name?: string;
  notes?: string;
}

interface DraftDay {
  date: string;
  places: DraftPlace[];
}

interface AiDraft {
  days: DraftDay[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadTripContext(supabase: any, tripId: string): Promise<TripContext | null> {
  const { data, error } = await supabase
    .from('trips')
    .select(
      `id, start_date, end_date,
       trip_places(venue_id, cities:city_id(name), countries:country_id(name))`,
    )
    .eq('id', tripId)
    .single();
  if (error || !data) return null;

  const cities = new Set<string>();
  const countries = new Set<string>();
  const venueIds: string[] = [];
  for (const p of data.trip_places ?? []) {
    if (p.venue_id) venueIds.push(p.venue_id);
    if (p.cities?.name) cities.add(p.cities.name);
    if (p.countries?.name) countries.add(p.countries.name);
  }

  return {
    id: data.id,
    start_date: data.start_date,
    end_date: data.end_date,
    cities: [...cities],
    countries: [...countries],
    existing_venue_ids: venueIds,
  };
}

async function searchCandidates(query: string): Promise<Candidate[]> {
  if (!MEILISEARCH_URL) return [];

  // Two parallel searches: venues + events. Cap at 15 each so the prompt stays small.
  const headers = {
    Authorization: `Bearer ${MEILISEARCH_KEY}`,
    'Content-Type': 'application/json',
  };

  const [venuesRes, eventsRes] = await Promise.all([
    fetch(`${MEILISEARCH_URL}/indexes/venues/search`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ q: query, limit: 15, attributesToRetrieve: ['id', 'name', 'city', 'country', 'category', 'description'] }),
    }).catch(() => null),
    fetch(`${MEILISEARCH_URL}/indexes/events/search`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ q: query, limit: 15, attributesToRetrieve: ['id', 'title', 'city', 'country', 'event_type', 'description'] }),
    }).catch(() => null),
  ]);

  const candidates: Candidate[] = [];
  if (venuesRes?.ok) {
    const { hits } = await venuesRes.json();
    for (const h of hits) {
      candidates.push({
        id: h.id,
        kind: 'venue',
        name: h.name,
        city: h.city,
        country: h.country,
        category: h.category,
        description: h.description?.slice(0, 200),
      });
    }
  }
  if (eventsRes?.ok) {
    const { hits } = await eventsRes.json();
    for (const h of hits) {
      candidates.push({
        id: h.id,
        kind: 'event',
        name: h.title,
        city: h.city,
        country: h.country,
        category: h.event_type,
        description: h.description?.slice(0, 200),
      });
    }
  }
  return candidates;
}

async function generateDraft(
  ctx: TripContext,
  prompt: string,
  candidates: Candidate[],
): Promise<AiDraft> {
  const dates: string[] = [];
  if (ctx.start_date && ctx.end_date) {
    let cursor = new Date(ctx.start_date);
    const end = new Date(ctx.end_date);
    while (cursor <= end) {
      dates.push(cursor.toISOString().slice(0, 10));
      cursor = new Date(cursor.getTime() + 86400000);
    }
  }

  const systemPrompt = `You are a queer-friendly travel planner for queer.guide. You build day-by-day itineraries by selecting from the provided list of QG-vetted venues and events. Only suggest items from the candidates list — never invent IDs. Output strict JSON matching the schema. Prefer LGBTQ+ relevance and the user's stated mood. Do not include rest periods or generic filler.`;

  const userMessage = `Trip dates: ${dates.length ? dates.join(', ') : 'unset'}
Destinations: ${[...ctx.cities, ...ctx.countries].join(', ') || 'unspecified'}
Already in itinerary: ${ctx.existing_venue_ids.length} places (do not repeat).

User prompt:
${prompt}

Candidate venues + events (id | kind | name | city | category):
${candidates.map((c) => `${c.id} | ${c.kind} | ${c.name} | ${c.city ?? '?'} | ${c.category ?? '?'}`).join('\n')}

Return JSON: { "days": [ { "date": "YYYY-MM-DD", "places": [ { "venue_id": "...", "notes": "..." } | { "event_id": "...", "notes": "..." } | { "custom_name": "...", "notes": "..." } ] } ] }`;

  const body = await anthropicMessages({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });
  const text: string = body.content?.[0]?.text ?? '{}';

  // Claude usually wraps JSON in prose or fences — extract the first balanced object.
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) return { days: [] };

  try {
    const draft = JSON.parse(text.slice(start, end + 1)) as AiDraft;
    return { days: Array.isArray(draft.days) ? draft.days : [] };
  } catch {
    return { days: [] };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: cors });
  }
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405, headers: cors });
  }

  const auth = req.headers.get('authorization');
  if (!auth) {
    return new Response(JSON.stringify({ error: 'auth required' }), { status: 401, headers: { ...cors, 'content-type': 'application/json' } });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: auth } },
  });

  let payload: { trip_id?: string; prompt?: string };
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid json' }), { status: 400, headers: { ...cors, 'content-type': 'application/json' } });
  }

  const { trip_id, prompt } = payload;
  if (!trip_id || !prompt || prompt.length > 2000) {
    return new Response(JSON.stringify({ error: 'trip_id and prompt (<2000 chars) required' }), { status: 400, headers: { ...cors, 'content-type': 'application/json' } });
  }

  const ctx = await loadTripContext(supabase, trip_id);
  if (!ctx) {
    return new Response(JSON.stringify({ error: 'trip not found or no access' }), { status: 404, headers: { ...cors, 'content-type': 'application/json' } });
  }

  // Compose Meilisearch query: prompt + destination hint.
  const searchQuery = [prompt, ...ctx.cities, ...ctx.countries].filter(Boolean).join(' ');
  const candidates = await searchCandidates(searchQuery);

  if (candidates.length === 0) {
    return new Response(
      JSON.stringify({ draft: { days: [] }, candidates_used: 0, note: 'no candidates from search' }),
      { headers: { ...cors, 'content-type': 'application/json' } },
    );
  }

  try {
    const draft = await generateDraft(ctx, prompt, candidates);
    return new Response(
      JSON.stringify({ draft, candidates_used: candidates.length }),
      { headers: { ...cors, 'content-type': 'application/json' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'generation failed', detail: String(err) }),
      { status: 500, headers: { ...cors, 'content-type': 'application/json' } },
    );
  }
});
