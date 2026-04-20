/**
 * github-webhook — inbound GitHub webhook receiver.
 *
 * HMAC-verified (sha256) against `GITHUB_WEBHOOK_SECRET`, deduped via
 * `x-github-delivery`, delegates issue/comment event handling to
 * `_shared/github-sync.ts` so `github-notifications-poller` reuses it.
 *
 * Handles:
 *   - issues: closed, reopened, edited, labeled, unlabeled, assigned, unassigned
 *   - issue_comment: created, edited, deleted
 *   - pull_request: closed (merged) with Closes #N → close linked submissions
 *   - workflow_run: completed (api_error row create/resolve)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5';
import {
  applyCommentAction,
  applyIssueAction,
  findSubmissionByIssue,
  GhComment,
  GhIssue,
  linkedIssueNumbers,
} from '../_shared/github-sync.ts';

function getServiceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

interface GhWorkflowRun {
  id: number;
  name: string;
  head_branch: string;
  head_sha: string;
  status: string;
  conclusion: 'success' | 'failure' | 'cancelled' | 'skipped' | 'timed_out' | null;
  html_url: string;
  event: string;
  run_number: number;
  run_attempt: number;
  created_at: string;
  updated_at: string;
}

interface GhPullRequest {
  number: number;
  merged: boolean;
  merge_commit_sha: string | null;
  body: string | null;
  html_url: string;
}

interface GhPayload {
  action: string;
  issue?: GhIssue;
  comment?: GhComment;
  pull_request?: GhPullRequest;
  workflow_run?: GhWorkflowRun;
  repository?: { full_name: string };
  sender?: { login: string };
}

serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const secret = Deno.env.get('GITHUB_WEBHOOK_SECRET');
  if (!secret) return json({ error: 'Webhook secret not configured' }, 500);

  const signatureHeader = req.headers.get('x-hub-signature-256') ?? '';
  const deliveryId = req.headers.get('x-github-delivery') ?? '';
  const event = req.headers.get('x-github-event') ?? '';
  if (!signatureHeader.startsWith('sha256=') || !deliveryId || !event) {
    return json({ error: 'Missing required GitHub headers' }, 400);
  }

  const raw = await req.text();
  const computed = 'sha256=' + (await hmacSha256Hex(secret, raw));
  if (!timingSafeEqual(computed, signatureHeader)) {
    return json({ error: 'Invalid signature' }, 401);
  }

  const svc = getServiceClient();

  const { error: dupInsertErr } = await svc
    .from('webhook_deliveries')
    .insert({ delivery_id: deliveryId, source: 'github' });
  if (dupInsertErr) {
    const code = (dupInsertErr as { code?: string }).code;
    if (code === '23505') return json({ success: true, already_processed: true });
    return json({ error: `Delivery log failed: ${dupInsertErr.message}` }, 500);
  }

  let payload: GhPayload;
  try {
    payload = JSON.parse(raw) as GhPayload;
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  if (event === 'ping') return json({ success: true, pong: true });

  // workflow_run.completed → api_error row lifecycle (unchanged).
  if (event === 'workflow_run' && payload.action === 'completed' && payload.workflow_run) {
    return await handleWorkflowRun(svc, payload);
  }

  // pull_request.closed (merged) → close any submissions linked via Closes #N.
  if (event === 'pull_request' && payload.action === 'closed' && payload.pull_request?.merged) {
    const pr = payload.pull_request;
    const nums = linkedIssueNumbers(pr.body);
    const closed: string[] = [];
    for (const n of nums) {
      const sub = await findSubmissionByIssue(svc, n);
      if (!sub) continue;
      await svc
        .from('community_submissions')
        .update({
          feedback_status: 'done',
          resolved_at: sub.resolved_at ?? new Date().toISOString(),
          resolution: 'fixed',
          github_last_synced_at: new Date().toISOString(),
          data: {
            ...sub.data,
            github_merge_commit: pr.merge_commit_sha,
            github_merge_pr: pr.html_url,
            _last_source: 'github',
          },
        })
        .eq('id', sub.id);
      closed.push(sub.id);
    }
    return json({ success: true, action: 'pr_merged', closed });
  }

  // issue events
  if (event === 'issues' && payload.issue) {
    const sub = await findSubmissionByIssue(svc, payload.issue.number);
    if (!sub) return json({ success: true, skipped: 'no matching submission' });
    const result = await applyIssueAction(svc, payload.action, payload.issue, sub);
    return json({ success: true, ...result });
  }

  // issue_comment events
  if (event === 'issue_comment' && payload.comment && payload.issue) {
    const action = payload.action as 'created' | 'edited' | 'deleted';
    if (!['created', 'edited', 'deleted'].includes(action)) {
      return json({ success: true, skipped: `issue_comment.${action}` });
    }
    const sub = await findSubmissionByIssue(svc, payload.issue.number);
    if (!sub) return json({ success: true, skipped: 'no matching submission' });
    const result = await applyCommentAction(svc, action, payload.comment, sub);
    return json({ success: true, ...result });
  }

  return json({ success: true, skipped: `${event}.${payload.action}` });
});

async function handleWorkflowRun(svc: SupabaseClient, payload: GhPayload): Promise<Response> {
  const wr = payload.workflow_run!;
  const repo = payload.repository?.full_name ?? 'unknown';
  const fingerprint = `gh-actions:${repo}:${wr.name}:${wr.head_branch}`;

  if (wr.conclusion === 'failure' || wr.conclusion === 'timed_out') {
    const { error } = await svc.rpc('upsert_api_error', {
      p_fingerprint: fingerprint,
      p_data: {
        service: 'github-actions',
        function_name: wr.name,
        message: `Run ${wr.conclusion}: ${wr.name} on ${wr.head_branch}`,
        status_code: null,
        endpoint: `${repo}@${wr.head_branch}`,
        metadata: {
          repo,
          workflow: wr.name,
          branch: wr.head_branch,
          sha: wr.head_sha,
          run_number: wr.run_number,
          run_attempt: wr.run_attempt,
          run_url: wr.html_url,
          triggered_by: wr.event,
          conclusion: wr.conclusion,
          updated_at: wr.updated_at,
        },
        reported_at: new Date().toISOString(),
      },
      p_source: 'github-webhook',
    });
    if (error) return json({ error: error.message }, 500);
    return json({ success: true, action: 'workflow_failure_logged', fingerprint });
  }

  if (wr.conclusion === 'success') {
    const { data: existing } = await svc
      .from('community_submissions')
      .select('id,feedback_status')
      .eq('content_type', 'api_error')
      .eq('fingerprint', fingerprint)
      .maybeSingle();
    if (existing && existing.feedback_status !== 'done') {
      await svc
        .from('community_submissions')
        .update({
          feedback_status: 'done',
          resolution: 'fixed',
          resolved_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
      return json({ success: true, action: 'workflow_recovered', submission_id: existing.id });
    }
    return json({ success: true, skipped: 'workflow_success_no_open_row' });
  }

  return json({ success: true, skipped: `workflow_conclusion_${wr.conclusion}` });
}
