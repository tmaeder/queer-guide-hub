import type { FeedbackStory, FeedbackSubmission } from './types';

export interface ApiErrorSubmission {
  id: string;
  data: {
    service: string;
    function_name: string;
    message: string;
    stack?: string;
    status_code?: number;
    endpoint?: string;
    metadata?: Record<string, unknown>;
    reported_at?: string;
    last_occurrence?: Record<string, unknown>;
  };
  fingerprint: string;
  occurrence_count: number;
  last_seen_at: string;
  submitted_at: string;
  feedback_status: string;
  reviewer_notes?: string | null;
  github_issue_url?: string | null;
  github_issue_number?: number | null;
  forwarded_at?: string | null;
  priority: number;
  labels: string[];
  assignee_id: string | null;
  duplicate_of: string | null;
  is_spam: boolean;
  resolution: string | null;
  resolved_at: string | null;
  notify_submitter: boolean;
}

const SERVICE_FILE_HINTS: Record<string, string> = {
  'cloudflare-worker': 'Dev/workers/',
  'edge-function': 'supabase/functions/',
  scraper: 'Dev/scraper/src/',
  frontend: 'src/',
  sentry: '',
};

export const SERVICE_COLORS: Record<string, string> = {
  'cloudflare-worker': 'hsl(var(--foreground) / 0.55)',
  'edge-function': 'hsl(var(--foreground))',
  scraper: 'hsl(var(--foreground) / 0.55)',
  frontend: 'hsl(var(--muted-foreground))',
  sentry: 'hsl(var(--foreground))',
  'github-actions': 'hsl(var(--foreground))',
  'supabase-advisor': 'hsl(var(--foreground))',
};

export function formatClaudePrompt(item: FeedbackSubmission): string {
  const d = item.data;
  const ctx = d.context || {};
  const lines: string[] = [];

  lines.push('Fix this user-reported issue from queer.guide:');
  lines.push('');
  lines.push(`## ${d.title}`);
  lines.push(
    `Category: ${d.category} | Submission ID: ${item.id} | Reported: ${item.submitted_at}`,
  );
  lines.push('');
  lines.push('### Description');
  lines.push(d.description || '_(no description)_');
  lines.push('');

  const contextLines: string[] = [];
  if (ctx.url) contextLines.push(`- URL: ${ctx.url}`);
  if (ctx.viewport) contextLines.push(`- Viewport: ${ctx.viewport.width}×${ctx.viewport.height}`);
  if (ctx.color_scheme) contextLines.push(`- Color scheme: ${ctx.color_scheme}`);
  if (ctx.user_agent) contextLines.push(`- User agent: ${ctx.user_agent}`);
  if (d.contact_email) contextLines.push(`- Contact: ${d.contact_email}`);
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
      lines.push(`[${err.ts}] ${err.message}`);
      if (err.stack) lines.push(err.stack.split('\n').slice(0, 5).join('\n'));
    }
    lines.push('```');
    lines.push('');
  }

  if (ctx.network_failures && ctx.network_failures.length > 0) {
    lines.push(`### Network failures (${ctx.network_failures.length})`);
    lines.push('```');
    for (const nf of ctx.network_failures) {
      lines.push(`[${nf.ts}] ${nf.method} ${nf.url} → ${nf.status}`);
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

export function formatErrorClaudePrompt(item: ApiErrorSubmission): string {
  const d = item.data;
  const lines: string[] = [];

  lines.push('Investigate and fix this API error from queer.guide infrastructure:');
  lines.push('');
  lines.push(`## ${d.function_name}: ${d.message}`);
  lines.push(
    `Service: ${d.service} | Occurrences: ${item.occurrence_count} | Last seen: ${item.last_seen_at}`,
  );
  if (d.status_code) lines.push(`Status code: ${d.status_code}`);
  if (d.endpoint) lines.push(`Endpoint: ${d.endpoint}`);
  lines.push('');

  if (d.stack) {
    lines.push('### Stack trace');
    lines.push('```');
    lines.push(d.stack);
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
    `This error has occurred ${item.occurrence_count} time(s). Find the root cause, fix it, and ensure the fix handles edge cases. Check error handling in the relevant service.`,
  );

  return lines.join('\n');
}

// Individual item prompts can run long; cap the per-item section so the
// combined prompt fits a sensible context window even with 10+ members.
const PER_ITEM_CAP = 2400;

/**
 * Combined prompt for a Story that bundles N items. Concatenates each
 * member's prompt under a shared story header so Claude can attack the
 * root cause in one go.
 */
export function formatCombinedStoryPrompt(
  story: FeedbackStory,
  feedbackMembers: FeedbackSubmission[],
  errorMembers: ApiErrorSubmission[],
): string {
  const lines: string[] = [];
  const total = feedbackMembers.length + errorMembers.length;

  lines.push(`# Story: ${story.title}`);
  lines.push('');
  lines.push(
    `This story bundles ${total} related item(s) (${feedbackMembers.length} feedback, ${errorMembers.length} API error). Please investigate the shared root cause and propose a single coordinated fix that addresses all members below.`,
  );
  lines.push('');
  if (story.summary) {
    lines.push('## Summary');
    lines.push(story.summary);
    lines.push('');
  }

  feedbackMembers.forEach((item, idx) => {
    lines.push(`---`);
    lines.push(`## Item ${idx + 1} / ${total} — feedback`);
    const body = formatClaudePrompt(item);
    lines.push(body.length > PER_ITEM_CAP ? body.slice(0, PER_ITEM_CAP) + '\n…[truncated]' : body);
    lines.push('');
  });

  errorMembers.forEach((item, idx) => {
    const n = feedbackMembers.length + idx + 1;
    lines.push(`---`);
    lines.push(`## Item ${n} / ${total} — api_error`);
    const body = formatErrorClaudePrompt(item);
    lines.push(body.length > PER_ITEM_CAP ? body.slice(0, PER_ITEM_CAP) + '\n…[truncated]' : body);
    lines.push('');
  });

  lines.push('---');
  lines.push(
    'Please diagnose the common root cause across these items, propose one coordinated fix, and call out any items that actually belong in a separate story.',
  );
  return lines.join('\n');
}

/**
 * Prompt used by the clusterer to ask Claude Haiku for a short title that
 * captures what a cluster has in common. Kept short; the admin can always
 * edit the proposed title before accepting the suggestion.
 */
export function formatStoryClusterPrompt(titles: string[]): string {
  const capped = titles.slice(0, 12);
  const lines: string[] = [];
  lines.push(
    'Summarize the common theme of the following user-feedback titles in 6 words or fewer. Return only the summary, no quotes or punctuation.',
  );
  lines.push('');
  capped.forEach((t, i) => lines.push(`${i + 1}. ${t}`));
  return lines.join('\n');
}
