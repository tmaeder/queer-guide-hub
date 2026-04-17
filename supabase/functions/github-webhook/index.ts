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

interface GhPayload {
  action: string;
  issue?: GhIssue;
  comment?: { body: string; user: { login: string }; html_url: string };
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
