// feedback-story-titler
// For every open story suggestion whose proposed_title is still a placeholder
// (a seed member title or the default "Related feedback cluster"), ask
// Cloudflare Workers AI Llama 3.3 for a short 6-word summary of the common
// theme. Runs as a cron sweep after detect_feedback_clusters, and can also
// be invoked on-demand with { suggestion_ids: [...] }.

import 'https://deno.land/x/xhr@0.1.0/mod.ts';
import { getCorsHeaders, errorResponse, getServiceClient, jsonResponse } from '../_shared/supabase-client.ts';

const CF_ACCOUNT_ID = Deno.env.get('CLOUDFLARE_ACCOUNT_ID') || '';
const CF_CHAT_URL = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/v1/chat/completions`;
const CF_CHAT_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const DEFAULT_LIMIT = 20;
const MAX_TITLES_PER_CLUSTER = 12;
const PLACEHOLDER_FALLBACK = 'Related feedback cluster';

interface BodyShape {
  suggestion_ids?: string[];
  limit?: number;
}

const SYSTEM =
  'You are summarising a cluster of user-submitted feedback items for an LGBTQ+ travel platform. ' +
  'Produce a short 6-word-or-fewer headline that captures the shared theme. ' +
  'Return ONLY the headline. No quotes, no trailing punctuation, no prefixes like "Title:".';

function isPlaceholder(title: string, seedTitles: string[]): boolean {
  if (!title || title.trim() === '') return true;
  if (title === PLACEHOLDER_FALLBACK) return true;
  // clusterer seeds proposed_title from the first member's title; treat an
  // exact match with one of the member titles as a placeholder we can improve.
  return seedTitles.includes(title);
}

async function draftTitle(token: string, titles: string[]): Promise<string | null> {
  const capped = titles.slice(0, MAX_TITLES_PER_CLUSTER);
  const user =
    'Summarise the common theme of these feedback titles in 6 words or fewer:\n\n' +
    capped.map((t, i) => `${i + 1}. ${t}`).join('\n');

  const res = await fetch(CF_CHAT_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: CF_CHAT_MODEL,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: user },
      ],
      temperature: 0.2,
      max_tokens: 40,
    }),
  });
  if (!res.ok) {
    throw new Error(`CF chat ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const data = await res.json();
  const raw: string =
    data?.choices?.[0]?.message?.content ??
    data?.result?.response ??
    '';
  // Strip markdown/quotes/whitespace/trailing punctuation that the model sometimes emits.
  const cleaned = raw
    .replace(/^["'`*\s]+|["'`*\s.!?]+$/g, '')
    .split('\n')[0]
    .trim();
  if (!cleaned) return null;
  // Enforce the 6-word cap in case the model overshoots.
  const words = cleaned.split(/\s+/);
  return words.slice(0, 6).join(' ');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: getCorsHeaders(req) });
  }
  const token = Deno.env.get('CLOUDFLARE_API_TOKEN');
  if (!token) return errorResponse('CLOUDFLARE_API_TOKEN missing', 500, req);

  let body: BodyShape = {};
  try {
    body = req.method === 'POST' ? ((await req.json()) as BodyShape) : {};
  } catch {
    body = {};
  }

  const supabase = getServiceClient();
  const limit = Math.min(Math.max(1, body.limit ?? DEFAULT_LIMIT), 100);

  const query = supabase
    .from('feedback_story_suggestions')
    .select('id, proposed_title, member_ids')
    .eq('dismissed', false)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (body.suggestion_ids?.length) {
    query.in('id', body.suggestion_ids);
  }

  const { data: suggestions, error } = await query;
  if (error) return errorResponse(error.message, 500, req);

  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const s of suggestions ?? []) {
    processed += 1;
    const memberIds = (s.member_ids as string[]) ?? [];
    if (memberIds.length === 0) {
      skipped += 1;
      continue;
    }

    const { data: rows, error: mErr } = await supabase
      .from('community_submissions')
      .select('data')
      .in('id', memberIds);
    if (mErr) {
      failed += 1;
      continue;
    }

    const memberTitles: string[] = (rows ?? [])
      .map((r: { data: Record<string, unknown> | null }) => {
        const d = r.data ?? {};
        const t = d['title'];
        return typeof t === 'string' ? t : '';
      })
      .filter((t: string) => t.trim() !== '');

    if (!isPlaceholder(s.proposed_title, memberTitles)) {
      skipped += 1;
      continue;
    }

    try {
      const drafted = await draftTitle(token, memberTitles);
      if (!drafted) {
        skipped += 1;
        continue;
      }
      const { error: updErr } = await supabase
        .from('feedback_story_suggestions')
        .update({ proposed_title: drafted })
        .eq('id', s.id);
      if (updErr) failed += 1;
      else updated += 1;
    } catch (e) {
      failed += 1;
      console.error('[feedback-story-titler]', s.id, (e as Error).message);
    }
  }

  return jsonResponse({ success: true, processed, updated, skipped, failed }, 200, req);
});
