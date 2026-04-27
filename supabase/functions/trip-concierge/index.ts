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

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
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
  existing: Array<{ name: string; date: string | null }>;
}

interface Candidate {
  id: string;
  kind: 'venue' | 'event';
  name: string;
  city?: string;
  country?: string;
  category?: string;
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

async function searchCandidates(query: string): Promise<Candidate[]> {
  if (!MEILISEARCH_URL) return [];
  const headers = {
    Authorization: `Bearer ${MEILISEARCH_KEY}`,
    'Content-Type': 'application/json',
  };
  const [venuesRes, eventsRes] = await Promise.all([
    fetch(`${MEILISEARCH_URL}/indexes/venues/search`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        q: query,
        limit: 12,
        attributesToRetrieve: ['id', 'name', 'city', 'country', 'category'],
      }),
    }).catch(() => null),
    fetch(`${MEILISEARCH_URL}/indexes/events/search`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        q: query,
        limit: 12,
        attributesToRetrieve: ['id', 'title', 'city', 'country', 'event_type'],
      }),
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
      });
    }
  }
  return candidates;
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

Trip context:
- Dates: ${dates.length ? dates.join(', ') : 'not set'}
- Destinations: ${[...ctx.cities, ...ctx.countries].join(', ') || 'unspecified'}
- Already on itinerary: ${
    ctx.existing.length
      ? ctx.existing.map((e) => `${e.name}${e.date ? ` (${e.date})` : ''}`).join('; ')
      : 'nothing yet'
  }

Candidate venues + events you may pick from (id | kind | name | city | category):
${candidates.map((c) => `${c.id} | ${c.kind} | ${c.name} | ${c.city ?? '?'} | ${c.category ?? '?'}`).join('\n') || '(none — apologize and ask for more context)'}

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

serve(async (req) => {
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

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: auth } },
  });

  let payload: { trip_id?: string; message?: string };
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid json' }), {
      status: 400,
      headers: { ...cors, 'content-type': 'application/json' },
    });
  }

  const { trip_id, message } = payload;
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
  const candidates = await searchCandidates(searchQuery);

  // Persist the user's message before calling Claude so a Claude failure
  // still leaves the user's input on the thread for retry.
  await supabase.from('trip_concierge_messages').insert({
    trip_id,
    role: 'user',
    content: message,
  });

  let result: ClaudeResponse;
  try {
    result = await callClaude(ctx, history, message, candidates);
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'generation failed', detail: String(err) }),
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
