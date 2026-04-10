/**
 * forward-feedback-to-github — admin-only endpoint.
 * Creates a GitHub issue from a feedback submission with full context
 * and an @claude mention so Claude's GitHub App can pick it up.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5';

// ── Inlined helpers (shared patterns from _shared/supabase-client.ts) ─────

const ALLOWED_ORIGINS = new Set<string>([
  'https://queer.guide',
  'https://www.queer.guide',
  'http://localhost:5173',
  'http://localhost:3000',
]);

function getCorsHeaders(req?: Request): Record<string, string> {
  const origin = req?.headers.get('Origin') ?? '';
  return {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : '',
  };
}

function getServiceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

function jsonResponse(data: unknown, status = 200, req?: Request): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
  });
}

function errorResponse(message: string, status = 500, req?: Request): Response {
  return jsonResponse({ error: message, success: false }, status, req);
}

function corsResponse(req?: Request): Response {
  return new Response('ok', { headers: getCorsHeaders(req) });
}

async function requireAdmin(
  req: Request,
  serviceClient: SupabaseClient,
): Promise<{ userId: string } | Response> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return errorResponse('Missing authorization header', 401, req);

  const token = authHeader.replace('Bearer ', '');
  const { data: userData, error: userError } = await serviceClient.auth.getUser(token);
  if (userError || !userData.user) return errorResponse('Invalid authorization', 401, req);

  const { data: roleData } = await serviceClient
    .from('user_roles')
    .select('role')
    .eq('user_id', userData.user.id)
    .eq('role', 'admin')
    .single();

  if (!roleData) return errorResponse('Admin access required', 403, req);
  return { userId: userData.user.id };
}

interface FeedbackData {
  title?: string;
  description?: string;
  category?: string;
  contact_email?: string | null;
  context?: {
    url?: string;
    viewport?: { width: number; height: number };
    user_agent?: string;
    color_scheme?: string;
    timestamp?: string;
    errors?: Array<{ message: string; stack?: string; ts: string }>;
    network_failures?: Array<{ method: string; url: string; status: number; ts: string }>;
  };
  screenshot_url?: string | null;
}

const REPO_OWNER = 'tmaeder';
const REPO_NAME = 'queer-guide-hub';

function formatIssueBody(data: FeedbackData, submissionId: string): string {
  const lines: string[] = [];

  lines.push(`**User-reported feedback** — submission \`${submissionId}\``);
  lines.push('');
  lines.push(data.description || '_(no description)_');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('### Context');
  lines.push('');

  const ctx = data.context || {};
  if (ctx.url) lines.push(`- **URL:** ${ctx.url}`);
  if (ctx.viewport) lines.push(`- **Viewport:** ${ctx.viewport.width}×${ctx.viewport.height}`);
  if (ctx.color_scheme) lines.push(`- **Color scheme:** ${ctx.color_scheme}`);
  if (ctx.user_agent) lines.push(`- **User agent:** \`${ctx.user_agent}\``);
  if (ctx.timestamp) lines.push(`- **Submitted:** ${ctx.timestamp}`);
  if (data.contact_email) lines.push(`- **Contact:** ${data.contact_email}`);
  lines.push('');

  if (data.screenshot_url) {
    lines.push('### Screenshot');
    lines.push('');
    lines.push(`![Screenshot](${data.screenshot_url})`);
    lines.push('');
  }

  if (ctx.errors && ctx.errors.length > 0) {
    lines.push('<details>');
    lines.push(`<summary>Recent console errors (${ctx.errors.length})</summary>`);
    lines.push('');
    lines.push('```');
    for (const err of ctx.errors) {
      lines.push(`[${err.ts}] ${err.message}`);
      if (err.stack) lines.push(err.stack.split('\n').slice(0, 5).join('\n'));
      lines.push('');
    }
    lines.push('```');
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }

  if (ctx.network_failures && ctx.network_failures.length > 0) {
    lines.push('<details>');
    lines.push(`<summary>Recent network failures (${ctx.network_failures.length})</summary>`);
    lines.push('');
    lines.push('```');
    for (const nf of ctx.network_failures) {
      lines.push(`[${nf.ts}] ${nf.method} ${nf.url} → ${nf.status}`);
    }
    lines.push('```');
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('@claude please investigate this report and propose a fix.');

  return lines.join('\n');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req);
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405, req);

  const supabase = getServiceClient();

  const auth = await requireAdmin(req, supabase);
  if (auth instanceof Response) return auth;

  try {
    const { submission_id } = await req.json();
    if (!submission_id) return errorResponse('submission_id is required', 400, req);

    // Fetch submission
    const { data: submission, error: fetchError } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from('community_submissions' as any)
      .select('id, content_type, data, github_issue_url, github_issue_number, submitted_at')
      .eq('id', submission_id)
      .single();

    if (fetchError || !submission) {
      return errorResponse('Submission not found', 404, req);
    }

    if (submission.content_type !== 'feedback') {
      return errorResponse('Submission is not a feedback item', 400, req);
    }

    // Already forwarded — return existing URL
    if (submission.github_issue_url) {
      return jsonResponse(
        {
          success: true,
          already_forwarded: true,
          url: submission.github_issue_url,
          number: submission.github_issue_number,
        },
        200,
        req,
      );
    }

    const data = (submission.data || {}) as FeedbackData;
    const category = data.category || 'feedback';
    const title = data.title || 'Untitled feedback';

    const githubToken = Deno.env.get('GITHUB_PAT');
    if (!githubToken) {
      return errorResponse('GITHUB_PAT not configured', 500, req);
    }

    const issueBody = formatIssueBody(data, submission.id);
    const issueTitle = `[${category}] ${title}`;

    // Create GitHub issue via REST API (simpler than pulling Octokit for one call)
    const ghResponse = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'queer-guide-feedback-bridge',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: issueTitle,
          body: issueBody,
          labels: ['feedback', 'user-reported', category],
        }),
      },
    );

    if (!ghResponse.ok) {
      const errText = await ghResponse.text();
      return errorResponse(
        `GitHub API error (${ghResponse.status}): ${errText.slice(0, 500)}`,
        502,
        req,
      );
    }

    const issue = await ghResponse.json();

    // Update submission row with issue reference
    const { error: updateError } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from('community_submissions' as any)
      .update({
        github_issue_url: issue.html_url,
        github_issue_number: issue.number,
        forwarded_at: new Date().toISOString(),
      })
      .eq('id', submission_id);

    if (updateError) {
      // Issue was created but update failed — return the URL anyway
      return jsonResponse(
        {
          success: true,
          url: issue.html_url,
          number: issue.number,
          warning: `Created issue but failed to update DB: ${updateError.message}`,
        },
        200,
        req,
      );
    }

    return jsonResponse(
      {
        success: true,
        url: issue.html_url,
        number: issue.number,
      },
      200,
      req,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errorResponse(`Forward failed: ${message}`, 500, req);
  }
});
