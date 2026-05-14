/**
 * packing-suggestions-llm — smarter packing queries via Claude Haiku.
 *
 * Input (POST JSON): { trip_id: string }
 * Output: { categories: [{ name, items: [{ query, reason, priority }] }], cached: boolean }
 *
 * Cache hits: packing_suggestion_cache keyed by (trip_id, snapshot_hash),
 * 24h TTL. Rate-limit: 3 distinct LLM calls per trip per day.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5';
import { anthropicMessages } from '../_shared/anthropic-shim.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface LlmItem {
  query: string;
  reason: string;
  priority: 'must' | 'nice' | 'optional';
}
interface LlmCategory {
  name: string;
  items: LlmItem[];
}
interface LlmResult {
  categories: LlmCategory[];
}

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadSnapshot(supabase: any, tripId: string) {
  const { data: trip, error } = await supabase
    .from('trips')
    .select(
      'id, user_id, start_date, end_date, primary_city_name, primary_country_code, primary_country_id',
    )
    .eq('id', tripId)
    .maybeSingle();
  if (error || !trip) return null;

  const [{ data: places }, { data: items }, { data: country }] = await Promise.all([
    supabase.from('trip_places').select('category, custom_name').eq('trip_id', tripId),
    supabase.from('trip_packing_items').select('name, category').eq('trip_id', tripId),
    trip.primary_country_id
      ? supabase
          .from('countries')
          .select('climate, equality_score')
          .eq('id', trip.primary_country_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const activities = Array.from(
    new Set(
      (places ?? [])
        .map((p: { category: string | null }) => (p.category || '').toLowerCase())
        .filter(Boolean),
    ),
  );

  return {
    trip_id: trip.id,
    user_id: trip.user_id,
    city: trip.primary_city_name,
    country_code: trip.primary_country_code,
    start_date: trip.start_date,
    end_date: trip.end_date,
    climate: country?.climate ?? null,
    equality_score: country?.equality_score ?? null,
    activities,
    existing_items: (items ?? []).map(
      (i: { name: string; category: string | null }) =>
        `${i.name}${i.category ? ` [${i.category}]` : ''}`,
    ),
  };
}

async function callClaude(snapshot: ReturnType<typeof buildPrompt>['snapshot'], prompt: string): Promise<LlmResult> {
  const body = await anthropicMessages({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1500,
    system: prompt,
    messages: [
      {
        role: 'user',
        content: `Generate packing suggestions for this trip:\n${JSON.stringify(snapshot, null, 2)}`,
      },
    ],
  });
  const text: string = body.content?.[0]?.text ?? '';
  const fence = text.match(/```json\s*([\s\S]*?)```/) ?? text.match(/({[\s\S]*})/);
  if (!fence) throw new Error('no json block in LLM response');
  const parsed = JSON.parse(fence[1].trim()) as LlmResult;
  if (!Array.isArray(parsed.categories)) throw new Error('malformed categories');
  return parsed;
}

function buildPrompt(snapshot: Awaited<ReturnType<typeof loadSnapshot>>) {
  const system = `You are a queer-friendly travel packing expert for queer.guide. Generate concise marketplace search queries tailored to the destination, season, activities, and LGBTQ+ safety context.

Rules:
- Output ONLY a fenced \`\`\`json block with this shape:
  { "categories": [ { "name": "clothing" | "toiletries" | "electronics" | "documents" | "safety" | "other", "items": [ { "query": "...", "reason": "...", "priority": "must" | "nice" | "optional" } ] } ] }
- Max 6 categories, max 4 items per category (24 total ceiling).
- Each query is 2-5 words suitable for a product search (e.g., "merino base layer", "reef-safe sunscreen SPF 50").
- Skip anything already on the user's existing checklist.
- For low-equality-score countries (< 5), add discreet safety items with clear rationale.
- Reasons ≤ 12 words. No emojis. No preamble outside the JSON block.`;
  return { system, snapshot };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
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

  let payload: { trip_id?: string };
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid json' }), {
      status: 400,
      headers: { ...cors, 'content-type': 'application/json' },
    });
  }
  const tripId = payload.trip_id;
  if (!tripId) {
    return new Response(JSON.stringify({ error: 'trip_id required' }), {
      status: 400,
      headers: { ...cors, 'content-type': 'application/json' },
    });
  }

  const { data: userRes } = await supabase.auth.getUser();
  const userId = userRes?.user?.id;
  if (!userId) {
    return new Response(JSON.stringify({ error: 'invalid auth' }), {
      status: 401,
      headers: { ...cors, 'content-type': 'application/json' },
    });
  }

  const snapshot = await loadSnapshot(supabase, tripId);
  if (!snapshot) {
    return new Response(JSON.stringify({ error: 'trip not found or no access' }), {
      status: 404,
      headers: { ...cors, 'content-type': 'application/json' },
    });
  }

  const hashInput = JSON.stringify({
    city: snapshot.city,
    cc: snapshot.country_code,
    s: snapshot.start_date,
    e: snapshot.end_date,
    climate: snapshot.climate,
    activities: snapshot.activities.slice().sort(),
    existing_count: snapshot.existing_items.length,
  });
  const snapshotHash = await sha256Hex(hashInput);

  // Cache hit?
  const { data: cached } = await supabase
    .from('packing_suggestion_cache')
    .select('suggestions, created_at')
    .eq('trip_id', tripId)
    .eq('snapshot_hash', snapshotHash)
    .gt('created_at', new Date(Date.now() - 24 * 3600_000).toISOString())
    .maybeSingle();

  if (cached?.suggestions) {
    return new Response(
      JSON.stringify({ ...(cached.suggestions as LlmResult), cached: true }),
      { headers: { ...cors, 'content-type': 'application/json' } },
    );
  }

  // Rate-limit: 3 distinct entries per trip per 24h
  const { count } = await supabase
    .from('packing_suggestion_cache')
    .select('id', { count: 'exact', head: true })
    .eq('trip_id', tripId)
    .gt('created_at', new Date(Date.now() - 24 * 3600_000).toISOString());

  if ((count ?? 0) >= 3) {
    return new Response(
      JSON.stringify({ error: 'rate limit: 3 LLM calls per trip per day' }),
      { status: 429, headers: { ...cors, 'content-type': 'application/json' } },
    );
  }

  const { system, snapshot: ctx } = buildPrompt(snapshot);
  let result: LlmResult;
  try {
    result = await callClaude(ctx, system);
  } catch (err) {
    return new Response(
      JSON.stringify({ error: `llm failed: ${String(err)}` }),
      { status: 502, headers: { ...cors, 'content-type': 'application/json' } },
    );
  }

  await supabase.from('packing_suggestion_cache').insert({
    trip_id: tripId,
    user_id: userId,
    snapshot_hash: snapshotHash,
    suggestions: result,
  });

  return new Response(JSON.stringify({ ...result, cached: false }), {
    headers: { ...cors, 'content-type': 'application/json' },
  });
});
