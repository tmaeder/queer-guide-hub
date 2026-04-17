/**
 * github-webhook — inbound GitHub webhook receiver.
 *
 * Verifies HMAC (sha256) against `GITHUB_WEBHOOK_SECRET`, de-duplicates with
 * `x-github-delivery`, and — on `issues.closed` / `issues.reopened` /
 * `issue_comment.created` — syncs the matching `community_submissions` row
 * (feedback or api_error) so admins see status flips + comments without a
 * manual refresh.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5';

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

/** Constant-time string compare. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

interface GhIssue {
  number: number;
  state: 'open' | 'closed';
  state_reason?: string | null;
  html_url: string;
  title: string;
  user?: { login: string };
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

interface GhPayload {
  action: string;
  issue?: GhIssue;
  comment?: { body: string; user: { login: string }; html_url: string };
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

  // Idempotency: if we've seen this delivery id, ack without re-processing.
  const { error: dupInsertErr } = await svc
    .from('webhook_deliveries')
    .insert({ delivery_id: deliveryId, source: 'github' });
  if (dupInsertErr) {
    // 23505 = unique_violation — safe to treat as "already processed".
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

  if (event === 'ping') {
    return json({ success: true, pong: true });
  }

  // workflow_run.completed → create/bump api_error row for a failed CI run,
  // or resolve it when the workflow eventually succeeds. So admins see the
  // same kanban signal they see for runtime API errors.
  if (event === 'workflow_run' && payload.action === 'completed' && payload.workflow_run) {
    const wr = payload.workflow_run;
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

    // On success: if there's an open api_error row for this fingerprint, auto-resolve it.
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

  // Find the submission by issue number (feedback or api_error).
  const issueNumber = payload.issue?.number;
  if (!issueNumber) {
    return json({ success: true, skipped: 'no issue' });
  }

  const { data: row } = await svc
    .from('community_submissions')
    .select('id,content_type,data,feedback_status,resolved_at')
    .eq('github_issue_number', issueNumber)
    .maybeSingle();

  if (!row) {
    return json({ success: true, skipped: 'no matching submission' });
  }

  const now = new Date().toISOString();
  const data = (row.data ?? {}) as Record<string, unknown>;

  // issues.closed → done + resolved_at; resolved_as 'not_planned' → wontfix.
  if (event === 'issues' && payload.action === 'closed') {
    const stateReason = payload.issue?.state_reason;
    const resolution =
      stateReason === 'not_planned' ? 'wontfix' : stateReason === 'duplicate' ? 'duplicate' : 'fixed';
    await svc
      .from('community_submissions')
      .update({
        feedback_status: 'done',
        resolved_at: row.resolved_at ?? now,
        resolution,
      })
      .eq('id', row.id);
    return json({ success: true, action: 'closed', submission_id: row.id });
  }

  // issues.reopened → back to in_progress + clear resolved_at.
  if (event === 'issues' && payload.action === 'reopened') {
    await svc
      .from('community_submissions')
      .update({
        feedback_status: 'in_progress',
        resolved_at: null,
        resolution: null,
      })
      .eq('id', row.id);
    return json({ success: true, action: 'reopened', submission_id: row.id });
  }

  // issue_comment.created → append to data.replies as a 'github' reply.
  if (event === 'issue_comment' && payload.action === 'created' && payload.comment) {
    const replies = Array.isArray(data.replies)
      ? (data.replies as Array<Record<string, unknown>>)
      : [];
    replies.push({
      by: null,
      by_name: `GH:${payload.comment.user.login}`,
      body: payload.comment.body,
      at: now,
      emailed: false,
      email_id: null,
      email_error: null,
      github_url: payload.comment.html_url,
    });
    await svc
      .from('community_submissions')
      .update({ data: { ...data, replies } })
      .eq('id', row.id);
    return json({ success: true, action: 'commented', submission_id: row.id });
  }

  return json({ success: true, skipped: `${event}.${payload.action}` });
});
