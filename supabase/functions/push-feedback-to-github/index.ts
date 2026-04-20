/**
 * push-feedback-to-github — outbound sync: admin actions → GitHub issue.
 *
 * Actions (one per request):
 *   - { action: 'reply', submission_id, body }        → POST issue comment
 *   - { action: 'close', submission_id, resolution }  → close issue
 *   - { action: 'reopen', submission_id }             → reopen issue
 *   - { action: 'set_labels', submission_id, labels } → replace labels
 *
 * Loop guard: if `data._last_source === 'github'`, the change originated
 * inbound — skip the push and clear the marker.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5';

const REPO_OWNER = 'tmaeder';
const REPO_NAME = 'queer-guide-hub';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

function getServiceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

async function gh(path: string, init: RequestInit, token: string): Promise<Response> {
  return fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'queer-guide-feedback-sync',
      ...(init.headers ?? {}),
    },
  });
}

interface PushRequest {
  action: 'reply' | 'close' | 'reopen' | 'set_labels';
  submission_id: string;
  body?: string;
  resolution?: 'fixed' | 'wontfix' | 'duplicate';
  labels?: string[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const token = Deno.env.get('GITHUB_PAT');
  if (!token) return json({ error: 'GITHUB_PAT not configured' }, 500);

  let body: PushRequest;
  try {
    body = (await req.json()) as PushRequest;
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  if (!body.submission_id || !body.action) {
    return json({ error: 'Missing submission_id or action' }, 400);
  }

  const svc = getServiceClient();
  const { data: sub, error } = await svc
    .from('community_submissions')
    .select('id, github_issue_number, github_issue_url, data')
    .eq('id', body.submission_id)
    .maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!sub) return json({ error: 'Submission not found' }, 404);
  if (!sub.github_issue_number) return json({ skipped: 'no linked issue' });

  const data = (sub.data ?? {}) as Record<string, unknown>;
  if (data._last_source === 'github') {
    const cleared = { ...data };
    delete cleared._last_source;
    await svc.from('community_submissions').update({ data: cleared }).eq('id', sub.id);
    return json({ skipped: 'loop_guard', cleared: true });
  }

  const n = sub.github_issue_number;

  if (body.action === 'reply') {
    if (!body.body) return json({ error: 'Missing body' }, 400);
    const res = await gh(
      `/repos/${REPO_OWNER}/${REPO_NAME}/issues/${n}/comments`,
      { method: 'POST', body: JSON.stringify({ body: body.body }) },
      token,
    );
    if (!res.ok) return json({ error: `GH ${res.status}: ${await res.text()}` }, 502);
    const comment = (await res.json()) as { id: number; html_url: string };
    // Tag the newly-appended reply with comment id so the inbound webhook dedups.
    const replies = Array.isArray(data.replies)
      ? [...(data.replies as Array<Record<string, unknown>>)]
      : [];
    const lastAdminIdx = [...replies].reverse().findIndex(
      (r) => !(r as { github_comment_id?: number }).github_comment_id && r.body === body.body,
    );
    if (lastAdminIdx !== -1) {
      const idx = replies.length - 1 - lastAdminIdx;
      replies[idx] = {
        ...replies[idx],
        github_comment_id: comment.id,
        github_url: comment.html_url,
      };
      await svc.from('community_submissions').update({ data: { ...data, replies } }).eq('id', sub.id);
    }
    return json({ success: true, comment_id: comment.id, url: comment.html_url });
  }

  if (body.action === 'close') {
    const stateReason =
      body.resolution === 'wontfix' || body.resolution === 'duplicate' ? 'not_planned' : 'completed';
    const res = await gh(
      `/repos/${REPO_OWNER}/${REPO_NAME}/issues/${n}`,
      { method: 'PATCH', body: JSON.stringify({ state: 'closed', state_reason: stateReason }) },
      token,
    );
    if (!res.ok) return json({ error: `GH ${res.status}: ${await res.text()}` }, 502);
    return json({ success: true, state: 'closed', state_reason: stateReason });
  }

  if (body.action === 'reopen') {
    const res = await gh(
      `/repos/${REPO_OWNER}/${REPO_NAME}/issues/${n}`,
      { method: 'PATCH', body: JSON.stringify({ state: 'open' }) },
      token,
    );
    if (!res.ok) return json({ error: `GH ${res.status}: ${await res.text()}` }, 502);
    return json({ success: true, state: 'open' });
  }

  if (body.action === 'set_labels') {
    const labels = body.labels ?? [];
    const res = await gh(
      `/repos/${REPO_OWNER}/${REPO_NAME}/issues/${n}/labels`,
      { method: 'PUT', body: JSON.stringify({ labels }) },
      token,
    );
    if (!res.ok) return json({ error: `GH ${res.status}: ${await res.text()}` }, 502);
    return json({ success: true, labels });
  }

  return json({ error: `Unknown action: ${body.action}` }, 400);
});
