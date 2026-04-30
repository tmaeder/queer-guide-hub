// Server-side port of formatCombinedStoryPrompt with redaction baked in.
// Loads the story + members itself; the client only needs to send story_id.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5';
import { redactSubmissionForClaude, redactString } from './feedback-redact.ts';

const PER_ITEM_CAP = 2400;

interface FeedbackData {
  title?: string;
  description?: string;
  category?: string;
  contact_email?: string | null;
  context?: {
    url?: string;
    viewport?: { width: number; height: number };
    color_scheme?: string;
    user_agent?: string;
    errors?: Array<{ message?: string; stack?: string; ts?: string }>;
    network_failures?: Array<{ method?: string; url?: string; status?: number; ts?: string }>;
  };
  screenshot_url?: string | null;
}

interface ApiErrorData {
  service: string;
  function_name: string;
  message: string;
  stack?: string;
  status_code?: number;
  endpoint?: string;
  metadata?: Record<string, unknown>;
}

interface FeedbackRow {
  id: string;
  data: FeedbackData;
  submitted_at: string;
}

interface ApiErrorRow {
  id: string;
  data: ApiErrorData;
  occurrence_count: number;
  last_seen_at: string;
}

interface StoryRow {
  id: string;
  title: string;
  summary: string | null;
}

const SERVICE_FILE_HINTS: Record<string, string> = {
  'cloudflare-worker': 'Dev/workers/',
  'edge-function': 'supabase/functions/',
  scraper: 'Dev/scraper/src/',
  frontend: 'src/',
  sentry: '',
};

function formatFeedback(item: FeedbackRow): string {
  const d = item.data;
  const ctx = d.context || {};
  const lines: string[] = [];

  lines.push('Fix this user-reported issue from queer.guide:');
  lines.push('');
  lines.push(`## ${redactString(d.title)}`);
  lines.push(
    `Category: ${d.category ?? '?'} | Submission ID: ${item.id} | Reported: ${item.submitted_at}`,
  );
  lines.push('');
  lines.push('### Description');
  lines.push(redactString(d.description) || '_(no description)_');
  lines.push('');

  const contextLines: string[] = [];
  if (ctx.url) contextLines.push(`- URL: ${ctx.url}`);
  if (ctx.viewport) contextLines.push(`- Viewport: ${ctx.viewport.width}×${ctx.viewport.height}`);
  if (ctx.color_scheme) contextLines.push(`- Color scheme: ${ctx.color_scheme}`);
  if (ctx.user_agent) contextLines.push(`- User agent: ${ctx.user_agent}`);
  // Intentionally drop d.contact_email — redaction.
  if (contextLines.length > 0) {
    lines.push('### Context');
    lines.push(...contextLines);
    lines.push('');
  }

  if (d.screenshot_url) {
    lines.push('### Screenshot');
    lines.push(d.screenshot_url);
    lines.push('');
  }

  if (ctx.errors && ctx.errors.length > 0) {
    lines.push(`### Console errors (${ctx.errors.length})`);
    lines.push('```');
    for (const err of ctx.errors) {
      lines.push(`[${err.ts ?? ''}] ${redactString(err.message)}`);
      if (err.stack) lines.push(redactString(err.stack).split('\n').slice(0, 5).join('\n'));
    }
    lines.push('```');
    lines.push('');
  }

  if (ctx.network_failures && ctx.network_failures.length > 0) {
    lines.push(`### Network failures (${ctx.network_failures.length})`);
    lines.push('```');
    for (const nf of ctx.network_failures) {
      lines.push(`[${nf.ts ?? ''}] ${nf.method ?? ''} ${redactString(nf.url)} → ${nf.status ?? ''}`);
    }
    lines.push('```');
    lines.push('');
  }

  lines.push('---');
  lines.push('Repo: queer-guide-hub');
  lines.push(
    'Please investigate, find root cause, and propose a fix. Check relevant components based on the URL path and error messages.',
  );

  return lines.join('\n');
}

function formatApiError(item: ApiErrorRow): string {
  const d = item.data;
  const lines: string[] = [];
  lines.push('Investigate and fix this API error from queer.guide infrastructure:');
  lines.push('');
  lines.push(`## ${d.function_name}: ${redactString(d.message)}`);
  lines.push(
    `Service: ${d.service} | Occurrences: ${item.occurrence_count} | Last seen: ${item.last_seen_at}`,
  );
  if (d.status_code) lines.push(`Status code: ${d.status_code}`);
  if (d.endpoint) lines.push(`Endpoint: ${d.endpoint}`);
  lines.push('');
  if (d.stack) {
    lines.push('### Stack trace');
    lines.push('```');
    lines.push(redactString(d.stack));
    lines.push('```');
    lines.push('');
  }
  if (d.metadata && Object.keys(d.metadata).length > 0) {
    lines.push('### Metadata');
    lines.push('```json');
    lines.push(JSON.stringify(d.metadata, null, 2));
    lines.push('```');
    lines.push('');
  }
  const hint = SERVICE_FILE_HINTS[d.service];
  if (hint) {
    lines.push('### Where to look');
    lines.push(`Start in \`${hint}${d.function_name}/\` or search for \`${d.function_name}\``);
    lines.push('');
  }
  lines.push('---');
  lines.push('Repo: queer-guide-hub');
  lines.push(
    `This error has occurred ${item.occurrence_count} time(s). Find the root cause, fix it, and ensure the fix handles edge cases.`,
  );
  return lines.join('\n');
}

export interface BuiltPrompt {
  prompt: string;
  prompt_hash: string;
  member_count: number;
  feedback_count: number;
  error_count: number;
}

export async function buildStoryPrompt(
  service: SupabaseClient,
  storyId: string,
): Promise<BuiltPrompt> {
  const { data: story, error: sErr } = await service
    .from('feedback_stories')
    .select('id,title,summary')
    .eq('id', storyId)
    .single<StoryRow>();
  if (sErr || !story) throw new Error(`story_not_found: ${sErr?.message ?? storyId}`);

  const { data: members, error: mErr } = await service
    .from('feedback_story_members')
    .select(
      'submission_id, community_submissions!inner(id, content_type, data, submitted_at, occurrence_count, last_seen_at)',
    )
    .eq('story_id', storyId);
  if (mErr) throw new Error(`members_fetch_failed: ${mErr.message}`);

  const feedbackRows: FeedbackRow[] = [];
  const errorRows: ApiErrorRow[] = [];
  for (const m of members ?? []) {
    const row = m as unknown as {
      community_submissions: {
        id: string;
        content_type: string;
        data: unknown;
        submitted_at: string;
        occurrence_count?: number;
        last_seen_at?: string;
      };
    };
    const cs = row.community_submissions;
    if (!cs) continue;
    const redacted = redactSubmissionForClaude({ data: cs.data as Record<string, unknown> });
    if (cs.content_type === 'api_error') {
      errorRows.push({
        id: cs.id,
        data: redacted.data as unknown as ApiErrorData,
        occurrence_count: cs.occurrence_count ?? 0,
        last_seen_at: cs.last_seen_at ?? cs.submitted_at,
      });
    } else {
      feedbackRows.push({
        id: cs.id,
        data: redacted.data as unknown as FeedbackData,
        submitted_at: cs.submitted_at,
      });
    }
  }

  const total = feedbackRows.length + errorRows.length;
  const lines: string[] = [];
  lines.push(`# Story: ${redactString(story.title)}`);
  lines.push('');
  lines.push(
    `This story bundles ${total} related item(s) (${feedbackRows.length} feedback, ${errorRows.length} API error). Please investigate the shared root cause and propose a single coordinated fix.`,
  );
  lines.push('');
  if (story.summary) {
    lines.push('## Summary');
    lines.push(redactString(story.summary));
    lines.push('');
  }

  feedbackRows.forEach((item, idx) => {
    lines.push('---');
    lines.push(`## Item ${idx + 1} / ${total} — feedback`);
    const body = formatFeedback(item);
    lines.push(body.length > PER_ITEM_CAP ? body.slice(0, PER_ITEM_CAP) + '\n…[truncated]' : body);
    lines.push('');
  });

  errorRows.forEach((item, idx) => {
    const n = feedbackRows.length + idx + 1;
    lines.push('---');
    lines.push(`## Item ${n} / ${total} — api_error`);
    const body = formatApiError(item);
    lines.push(body.length > PER_ITEM_CAP ? body.slice(0, PER_ITEM_CAP) + '\n…[truncated]' : body);
    lines.push('');
  });

  lines.push('---');
  lines.push(
    'Please diagnose the common root cause across these items, propose one coordinated fix, and call out any items that actually belong in a separate story.',
  );

  const prompt = lines.join('\n');
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(prompt));
  const prompt_hash = Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return {
    prompt,
    prompt_hash,
    member_count: total,
    feedback_count: feedbackRows.length,
    error_count: errorRows.length,
  };
}
