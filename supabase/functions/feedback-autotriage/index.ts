// feedback-autotriage
// Pre-sorts new community_submissions (feedback + api_error) on arrival so the
// admin board receives them triaged instead of raw. An LLM (CF Workers AI) reads
// title/description/context and returns a category, priority, labels, a one-line
// summary, and a spam hint. We write priority + labels DIRECTLY (so kanban sort
// works immediately) plus an `autotriage` jsonb block backing the accept/override
// chip in the UI. Never moves feedback_status — a human still triages.
//
// Invoked per-item by the trg_notify_feedback_autotriage INSERT trigger (carries
// the vault internal secret), or in bulk via {limit} for backfill/nightly sweep.

import 'https://deno.land/x/xhr@0.1.0/mod.ts';
import {
  getCorsHeaders, errorResponse, getServiceClient, jsonResponse, requireInternalOrAdmin,
} from '../_shared/supabase-client.ts';
import { llmChatCompletion, isLlmConfigured } from '../_shared/llm-client.ts';
import { withCircuitBreaker, CircuitOpenError } from '../_shared/circuit-breaker.ts';

const BREAKER = 'llm.cf.feedback-autotriage';
const TEXT_MAX_CHARS = 2400;

// Controlled vocabularies — keep LLM output bounded so labels don't explode.
const FEEDBACK_CATEGORIES = ['bug', 'idea', 'improvement', 'content-idea'];
const ALLOWED_LABELS = [
  'ui', 'performance', 'data-quality', 'auth', 'mobile', 'search', 'map',
  'content', 'crash', 'accessibility', 'payments', 'i18n', 'seo', 'not-found',
];

interface BodyShape { submission_ids?: string[]; limit?: number; }
interface Row { id: string; content_type: string; data: Record<string, unknown>; labels: string[] | null; }

interface Triage {
  category: string | null;
  priority: number;
  labels: string[];
  summary: string;
  is_probably_spam: boolean;
}

function buildText(row: Row): string {
  const d = row.data ?? {};
  const pick = (k: string) => (typeof d[k] === 'string' ? (d[k] as string) : '');
  const ctx = d.context && typeof d.context === 'object' ? JSON.stringify(d.context) : '';
  const parts = [
    `type: ${row.content_type}`,
    pick('category') ? `reported_category: ${pick('category')}` : '',
    `title: ${pick('title') || pick('message') || pick('function_name')}`,
    `description: ${pick('description') || pick('message')}`,
    ctx ? `context: ${ctx}` : '',
  ].filter(Boolean).join('\n');
  return parts.slice(0, TEXT_MAX_CHARS);
}

function buildPrompt(text: string): string {
  return `You are triaging a user-submitted item for an LGBTQ+ travel platform's admin board.
Classify it and respond with ONLY a JSON object, no prose, no markdown fences.

Schema:
{
  "category": one of ${JSON.stringify(FEEDBACK_CATEGORIES)} (best fit; for api_error use "bug"),
  "priority": integer 0-3 where 0=critical (crash, data loss, blocks core flow, safety),
              1=high (broken feature), 2=normal, 3=minor/idea/cosmetic,
  "labels": array (0-3) chosen ONLY from ${JSON.stringify(ALLOWED_LABELS)},
  "summary": one factual sentence, max 120 chars, no marketing language,
  "is_probably_spam": boolean (true only for gibberish/link-flood/ads)
}

Item:
${text}`;
}

function coerce(raw: string): Triage {
  // Defensive parse: CF Workers AI may wrap or prepend text. Grab first {...}.
  let obj: Record<string, unknown> = {};
  try {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) obj = JSON.parse(raw.slice(start, end + 1));
  } catch { /* fall through to defaults */ }

  const category = typeof obj.category === 'string' && FEEDBACK_CATEGORIES.includes(obj.category)
    ? obj.category : null;
  let priority = Number.parseInt(String(obj.priority ?? 2), 10);
  if (!Number.isInteger(priority) || priority < 0 || priority > 3) priority = 2;
  const labels = Array.isArray(obj.labels)
    ? (obj.labels as unknown[])
        .filter((l): l is string => typeof l === 'string' && ALLOWED_LABELS.includes(l))
        .slice(0, 3)
    : [];
  const summary = typeof obj.summary === 'string' ? obj.summary.slice(0, 160) : '';
  const is_probably_spam = obj.is_probably_spam === true;
  return { category, priority, labels, summary, is_probably_spam };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: getCorsHeaders(req) });

  const supabase = getServiceClient();
  const auth = await requireInternalOrAdmin(req, supabase);
  if (auth instanceof Response) return auth;
  if (!isLlmConfigured()) return errorResponse('LLM not configured', 500, req);

  let body: BodyShape;
  try { body = req.method === 'POST' ? ((await req.json()) as BodyShape) : {}; } catch { body = {}; }

  const limit = Math.min(Math.max(1, body.limit ?? 50), 200);
  // Sweep mode: only triage OPEN items. Already-resolved (done) submissions —
  // e.g. the ~2.7k auto-closed api_errors — never need triage, so skip them to
  // avoid burning LLM spend on closed work. Explicit submission_ids bypass this
  // (targeted backfill triages whatever is asked).
  let query = supabase
    .from('community_submissions')
    .select('id,content_type,data,labels')
    .is('autotriage', null)
    .neq('feedback_status', 'done')
    .in('content_type', ['feedback', 'api_error'])
    .limit(limit);
  if (body.submission_ids?.length) {
    query = supabase
      .from('community_submissions')
      .select('id,content_type,data,labels')
      .in('id', body.submission_ids);
  }

  const { data: rows, error } = await query;
  if (error) return errorResponse(error.message, 500, req);

  const pending = (rows ?? []) as Row[];
  let done = 0, failed = 0;

  for (const row of pending) {
    // 404s are auto-filed in bulk (every dead URL) and are not bugs/crashes.
    // Triage them deterministically — minor priority + a 'not-found' label —
    // instead of spending an LLM call that mislabels them as crashes. The
    // route_template fingerprint already deduped per-slug floods to one row;
    // occurrence_count tells admins which dead paths actually matter.
    if (row.content_type === 'api_error' && row.data?.kind === 'not_found') {
      const template = typeof row.data.route_template === 'string' ? row.data.route_template : 'unknown route';
      const mergedLabels = Array.from(new Set([...(row.labels ?? []), 'not-found']));
      const { error: updErr } = await supabase
        .from('community_submissions')
        .update({
          priority: 3,
          labels: mergedLabels,
          autotriage: {
            category: null,
            summary: `404 — no page at ${template}`,
            suggested_priority: 3,
            suggested_labels: ['not-found'],
            is_probably_spam: false,
            model: 'deterministic',
            at: new Date().toISOString(),
          },
        })
        .eq('id', row.id);
      if (updErr) { failed += 1; } else { done += 1; }
      continue;
    }

    const text = buildText(row);
    if (!text.trim()) { failed += 1; continue; }
    try {
      const res = await withCircuitBreaker(supabase, BREAKER, () =>
        llmChatCompletion({
          messages: [{ role: 'user', content: buildPrompt(text) }],
          temperature: 0.1,
          max_tokens: 300,
          timeoutMs: 20_000,
          retries: 1,
        }),
      );
      const t = coerce(res.content);
      const mergedLabels = Array.from(new Set([...(row.labels ?? []), ...t.labels]));
      const { error: updErr } = await supabase
        .from('community_submissions')
        .update({
          priority: t.priority,
          labels: mergedLabels,
          autotriage: {
            category: t.category,
            summary: t.summary,
            suggested_priority: t.priority,
            suggested_labels: t.labels,
            is_probably_spam: t.is_probably_spam,
            model: res.model,
            at: new Date().toISOString(),
          },
        })
        .eq('id', row.id);
      if (updErr) { failed += 1; } else { done += 1; }
    } catch (e) {
      failed += 1;
      if (e instanceof CircuitOpenError) {
        console.warn('[feedback-autotriage] circuit open, stopping batch');
        break;
      }
      console.error('[feedback-autotriage] item failed', row.id, (e as Error).message);
    }
  }

  return jsonResponse({ success: true, total: pending.length, done, failed }, 200, req);
});
