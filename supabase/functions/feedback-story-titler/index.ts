// feedback-story-titler
// For every open story suggestion whose proposed_title is still a placeholder
// (a seed member title or the default "Related feedback cluster"), ask
// Cloudflare Workers AI Llama 3.3 for a short 6-word summary of the common
// theme. Runs as a cron sweep after detect_feedback_clusters, and can also
// be invoked on-demand with { suggestion_ids: [...] }.

import 'https://deno.land/x/xhr@0.1.0/mod.ts';
import { getCorsHeaders, errorResponse, getServiceClient, jsonResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts';
import {
  hasEnoughSignal,
  isMachineAlertText,
  submissionText,
  ungroundedSensitiveConcepts,
} from '../_shared/story-title-guard.ts';

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

// Deliberately domain-free. The previous prompt opened with "for an LGBTQ+
// travel platform", which is exactly what the model fell back on when the
// item list arrived empty — inventing "LGBTQ Safety Concerns" for four CI
// run-failure alerts. Describe the input, never the platform.
const SYSTEM =
  'You write short headlines for clusters of bug reports in a product admin queue. ' +
  'Produce a 6-word-or-fewer headline that literally describes what the listed items say. ' +
  'Use only words and concepts present in the items. Never introduce a theme, topic, ' +
  'audience or subject matter that the items do not mention. ' +
  'If the items are infrastructure or build errors, say so plainly. ' +
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
    'Summarise the common theme of these reports in 6 words or fewer:\n\n' +
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
  const _auth = await requireInternalOrAdmin(req, getServiceClient()); if (_auth instanceof Response) return _auth
  const token = Deno.env.get('CLOUDFLARE_API_TOKEN');
  if (!token) return errorResponse('CLOUDFLARE_API_TOKEN missing', 500, req);

  let body: BodyShape;
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
  let rejected = 0;

  for (const s of suggestions ?? []) {
    processed += 1;
    const memberIds = (s.member_ids as string[]) ?? [];
    if (memberIds.length === 0) {
      skipped += 1;
      continue;
    }

    const { data: rows, error: mErr } = await supabase
      .from('community_submissions')
      .select('content_type, data')
      .in('id', memberIds);
    if (mErr) {
      failed += 1;
      continue;
    }

    // Read every field these rows actually use — api_error rows carry their
    // text in `message` and have a NULL `title`, so a title-only read left the
    // corpus empty and the model titled from thin air.
    const memberTitles: string[] = (rows ?? [])
      .map((r: { data: Record<string, unknown> | null }) => submissionText(r.data))
      .filter((t: string) => t !== '');

    // Machine alerts belong on the API Errors board. detect_feedback_clusters
    // no longer proposes them, but historical suggestions still exist.
    const allMachine =
      (rows ?? []).length > 0 &&
      (rows ?? []).every(
        (r: { content_type: string; data: Record<string, unknown> | null }) =>
          r.content_type !== 'feedback' || isMachineAlertText(submissionText(r.data)),
      );
    if (allMachine) {
      skipped += 1;
      continue;
    }

    // Never hand the model an empty list — with nothing to summarise it
    // free-associates off the system prompt. This is the actual bug.
    if (!hasEnoughSignal(memberTitles)) {
      skipped += 1;
      continue;
    }

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
      // Prompt wording is not a control. Discard any draft that asserts a
      // safety or identity theme the source material never mentions —
      // a fake safety headline buries real reports on this board.
      const ungrounded = ungroundedSensitiveConcepts(drafted, memberTitles);
      if (ungrounded.length > 0) {
        rejected += 1;
        console.warn(
          '[feedback-story-titler] rejected ungrounded title',
          s.id,
          JSON.stringify({ drafted, concepts: ungrounded }),
        );
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

  return jsonResponse({ success: true, processed, updated, skipped, failed, rejected }, 200, req);
});
