/**
 * trip-concierge — multi-turn conversational planner for a single trip.
 *
 * Replaces the one-shot `ai-plan-trip`: history persists in
 * `trip_concierge_messages` so the user can refine over multiple turns
 * ("move museum to Tuesday", "add queer brunch nearby", "more nightlife
 * less daytime"). Each user message gets a Claude reply that may include
 * an optional structured DRAFT block — the client applies it after review.
 *
 * Inputs (POST JSON):
 *   { trip_id: string, message: string }
 *
 * Output:
 *   { reply: string, draft?: { days: [...] }, candidates_used: number }
 *
 * Both messages (user + assistant) are persisted before the response
 * returns, so a refresh shows the full thread.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5';
import { anthropicMessages } from '../_shared/anthropic-shim.ts';
import { getCorsHeaders } from '../_shared/supabase-client.ts';
import { checkUserRateLimit } from '../_shared/user-rate-limit.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const corsFor = (req: Request) => ({
  ...getCorsHeaders(req),
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
});

interface TripContext {
  id: string;
  start_date: string | null;
  end_date: string | null;
  cities: string[];
  countries: string[];
  existing: Array<{ name: string; date: string | null }>;
}

interface Candidate {
  id: string;
  kind: 'venue' | 'event';
  name: string;
  city?: string;
  country?: string;
  category?: string;
  /** Short opening-hours string (venues only, when known). */
  hours?: string;
  /** Controlled accessibility vocab slugs (venues only). */
  access?: string[];
  lat?: number;
  lng?: number;
}

/** Client-computed planning signals (weather from Open-Meteo, saved needs). */
interface Signals {
  weather_by_date?: Record<
    string,
    { label: string; tMaxC: number; tMinC: number; typical?: boolean }
  >;
  accessibility_needs?: string[];
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

interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadTripContext(supabase: any, tripId: string): Promise<TripContext | null> {
  const { data, error } = await supabase
    .from('trips')
    .select(
      `id, start_date, end_date,
       trip_places(custom_name, day_id,
         venues:venue_id(name),
         events:event_id(title),
         cities:city_id(name),
         countries:country_id(name)),
       trip_days(id, date)`,
    )
    .eq('id', tripId)
    .single();
  if (error || !data) return null;

  const cities = new Set<string>();
  const countries = new Set<string>();
  // deno-lint-ignore no-explicit-any
  const dayDate = new Map<string, string>();
  for (const d of data.trip_days ?? []) dayDate.set(d.id, d.date);

  const existing: Array<{ name: string; date: string | null }> = [];
  for (const p of data.trip_places ?? []) {
    if (p.cities?.name) cities.add(p.cities.name);
    if (p.countries?.name) countries.add(p.countries.name);
    const name =
      p.venues?.name ?? p.events?.title ?? p.custom_name ?? 'unnamed stop';
    existing.push({ name, date: p.day_id ? (dayDate.get(p.day_id) ?? null) : null });
  }

  return {
    id: data.id,
    start_date: data.start_date,
    end_date: data.end_date,
    cities: [...cities],
    countries: [...countries],
    existing,
  };
}

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadHistory(supabase: any, tripId: string): Promise<HistoryMessage[]> {
  const { data, error } = await supabase
    .from('trip_concierge_messages')
    .select('role, content')
    .eq('trip_id', tripId)
    .order('created_at', { ascending: true })
    .limit(40);
  if (error) return [];
  return ((data ?? []) as HistoryMessage[]).map((r) => ({
    role: r.role,
    content: r.content,
  }));
}

async function searchCandidates(
  supabase: ReturnType<typeof createClient>,
  query: string,
): Promise<Candidate[]> {
  // Postgres hybrid search over the search_documents engine. Keyword-only
  // (no query embedding) is sufficient for candidate gathering; search_hybrid
  // returns a single RRF-ranked list across the requested entity types.
  // Replaces the former Meilisearch venues/events multi-search (Meili →
  // Postgres decommission).
  const { data, error } = await supabase.rpc('search_hybrid', {
    p_query: query,
    p_content_types: ['venue', 'event'],
    p_limit: 24,
  });
  if (error || !data) return [];
  const hits = (data as { hits?: Array<Record<string, unknown>> }).hits ?? [];
  return hits
    .map((h): Candidate => ({
      id: String(h.objectID ?? h.entity_id ?? ''),
      kind: h.type === 'event' ? 'event' : 'venue',
      name: (h.title as string) ?? '',
      city: (h.city as string | null) ?? undefined,
      country: (h.country as string | null) ?? undefined,
      category: (h.category as string | null) ?? undefined,
    }))
    .filter((c) => c.id);
}

/**
 * Venue-only enrichment: opening hours, accessibility vocab, coordinates.
 * One batch select; failures degrade to unenriched candidates.
 */
async function enrichVenueCandidates(
  supabase: ReturnType<typeof createClient>,
  candidates: Candidate[],
): Promise<Candidate[]> {
  const venueIds = candidates.filter((c) => c.kind === 'venue').map((c) => c.id);
  if (venueIds.length === 0) return candidates;
  const { data, error } = await supabase
    .from('venues')
    .select('id, opening_hours, accessibility_attributes, latitude, longitude')
    .in('id', venueIds);
  if (error || !data) return candidates;
  const byId = new Map(
    (data as Array<{
      id: string;
      opening_hours: string | null;
      accessibility_attributes: string[] | null;
      latitude: number | null;
      longitude: number | null;
    }>).map((v) => [v.id, v]),
  );
  return candidates.map((c) => {
    const v = c.kind === 'venue' ? byId.get(c.id) : undefined;
    if (!v) return c;
    return {
      ...c,
      hours: v.opening_hours?.slice(0, 80) ?? undefined,
      access: v.accessibility_attributes?.length ? v.accessibility_attributes : undefined,
      lat: v.latitude ?? undefined,
      lng: v.longitude ?? undefined,
    };
  });
}

interface ClaudeResponse {
  reply: string;
  draft: AiDraft | null;
}

async function callClaude(
  ctx: TripContext,
  history: HistoryMessage[],
  message: string,
  candidates: Candidate[],
  signals: Signals | undefined,
): Promise<ClaudeResponse> {
  const dates: string[] = [];
  if (ctx.start_date && ctx.end_date) {
    let cursor = new Date(ctx.start_date);
    const end = new Date(ctx.end_date);
    while (cursor <= end) {
      dates.push(cursor.toISOString().slice(0, 10));
      cursor = new Date(cursor.getTime() + 86400000);
    }
  }

  const system = `You are a queer-friendly travel concierge for queer.guide planning a single trip with the user across multiple turns.

Behavior rules:
- Conversational. When the user asks a question, answer in plain prose (1-3 short paragraphs).
- When the user asks you to plan, modify, or suggest specific places, output a JSON code block with the proposed itinerary AT THE END of your reply, fenced as \`\`\`draft. Do not include the JSON inline anywhere else.
- Only suggest items from the candidates list — never invent venue/event IDs. Use \`custom_name\` only when no candidate fits.
- Refer to existing places in the itinerary by name when relevant; never duplicate them in a draft.
- Be specific to LGBTQ+ travelers (safety, scene, queer history, gay-owned, drag, etc.).
- Cluster each day geographically — pick places near each other (candidates carry lat/lng) so days don't zigzag across the city.
- Respect opening hours when scheduling ("hours" field). Don't send people to a closed venue; if hours are unknown, note the uncertainty.
- If a day's forecast says rain, storms, or snow, prefer indoor candidates that day and say why.
- If the user has accessibility needs, prefer candidates whose "access" list satisfies them, and mention it. NEVER claim a venue is accessible unless its access list says so — missing data is unknown, not a yes.

Trip context:
- Dates: ${dates.length ? dates.join(', ') : 'not set'}
- Destinations: ${[...ctx.cities, ...ctx.countries].join(', ') || 'unspecified'}
- Already on itinerary: ${
    ctx.existing.length
      ? ctx.existing.map((e) => `${e.name}${e.date ? ` (${e.date})` : ''}`).join('; ')
      : 'nothing yet'
  }

${
    signals?.weather_by_date && Object.keys(signals.weather_by_date).length
      ? `Weather by date${
          Object.values(signals.weather_by_date).some((w) => w.typical)
            ? ' (dates marked "typical" are climate history, not a forecast)'
            : ''
        }:
${Object.entries(signals.weather_by_date)
  .map(
    ([d, w]) =>
      `- ${d}: ${w.label}, ${Math.round(w.tMinC)}–${Math.round(w.tMaxC)}°C${w.typical ? ' (typical)' : ''}`,
  )
  .join('\n')}
`
      : ''
  }${
    signals?.accessibility_needs?.length
      ? `User accessibility needs: ${signals.accessibility_needs.join(', ')}
`
      : ''
  }
Candidate venues + events you may pick from (id | kind | name | city | category | hours | access | lat,lng):
${candidates.map((c) => `${c.id} | ${c.kind} | ${c.name} | ${c.city ?? '?'} | ${c.category ?? '?'} | ${c.hours ?? '?'} | ${c.access?.join(',') ?? '-'} | ${c.lat != null && c.lng != null ? `${c.lat.toFixed(3)},${c.lng.toFixed(3)}` : '?'}`).join('\n') || '(none — apologize and ask for more context)'}

Draft schema (only when proposing places):
\`\`\`draft
{ "days": [ { "date": "YYYY-MM-DD", "places": [ { "venue_id": "..." | "event_id": "..." | "custom_name": "...", "notes": "..." } ] } ] }
\`\`\``;

  const messages = [
    ...history.slice(-20),
    { role: 'user' as const, content: message },
  ];

  const body = await anthropicMessages({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    system,
    messages,
  });
  const text: string = body.content?.[0]?.text ?? '';

  // Look for ```draft fenced block; fall back to first balanced JSON if not found.
  const fence = text.match(/```draft\s*([\s\S]*?)```/);
  let draft: AiDraft | null = null;
  let reply = text;

  if (fence) {
    try {
      const parsed = JSON.parse(fence[1].trim()) as AiDraft;
      draft = { days: Array.isArray(parsed.days) ? parsed.days : [] };
      reply = text.replace(fence[0], '').trim();
    } catch {
      // Malformed JSON in fence — keep the prose, drop the draft.
      reply = text.replace(fence[0], '').trim();
    }
  }

  return { reply: reply || text, draft };
}

Deno.serve(async (req) => {
  const cors = corsFor(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: cors });
  }
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405, headers: cors });
  }

  const auth = req.headers.get('authorization');
  if (!auth) {
    return new Response(JSON.stringify({ error: 'auth required' }), {
      status: 401,
      headers: { ...cors, 'content-type': 'application/json' },
    });
  }
  if (!(await checkUserRateLimit(req, 'trip-concierge', 30, 3600))) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded. Try again later.' }), {
      status: 429,
      headers: { ...cors, 'content-type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: auth } },
  });

  let payload: { trip_id?: string; message?: string; signals?: Signals };
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid json' }), {
      status: 400,
      headers: { ...cors, 'content-type': 'application/json' },
    });
  }

  const { trip_id, message, signals } = payload;
  if (!trip_id || !message || message.length > 2000) {
    return new Response(
      JSON.stringify({ error: 'trip_id and message (<2000 chars) required' }),
      { status: 400, headers: { ...cors, 'content-type': 'application/json' } },
    );
  }

  const ctx = await loadTripContext(supabase, trip_id);
  if (!ctx) {
    return new Response(JSON.stringify({ error: 'trip not found or no access' }), {
      status: 404,
      headers: { ...cors, 'content-type': 'application/json' },
    });
  }

  const history = await loadHistory(supabase, trip_id);

  const searchQuery = [message, ...ctx.cities, ...ctx.countries]
    .filter(Boolean)
    .join(' ');
  const candidates = await enrichVenueCandidates(
    supabase,
    await searchCandidates(supabase, searchQuery),
  );

  // Persist the user's message before calling Claude so a Claude failure
  // still leaves the user's input on the thread for retry.
  await supabase.from('trip_concierge_messages').insert({
    trip_id,
    role: 'user',
    content: message,
  });

  let result: ClaudeResponse;
  try {
    result = await callClaude(ctx, history, message, candidates, signals);
  } catch (err) {
    console.error('trip-concierge: generation failed', err);
    return new Response(
      JSON.stringify({ error: 'generation failed' }),
      { status: 500, headers: { ...cors, 'content-type': 'application/json' } },
    );
  }

  await supabase.from('trip_concierge_messages').insert({
    trip_id,
    role: 'assistant',
    content: result.reply,
    draft: result.draft,
  });

  return new Response(
    JSON.stringify({
      reply: result.reply,
      draft: result.draft ?? undefined,
      candidates_used: candidates.length,
    }),
    { headers: { ...cors, 'content-type': 'application/json' } },
  );
});
