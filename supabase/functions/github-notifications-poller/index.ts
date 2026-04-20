/**
 * github-notifications-poller — pulls unread `/notifications` threads as a
 * safety net for missed webhook deliveries.
 *
 * Cron: every 5 min. For each Issue-type thread:
 *   - Fetch the issue, mirror state via applyIssueAction(action="edited" + explicit close/open)
 *   - Fetch comments since the cursor, apply each via applyCommentAction("created")
 *   - Dedup via github_event_ids (shared with webhook) so double-delivery is safe
 *   - Mark thread read on success
 *
 * Cursor stored in a single-row `github_poller_state` table (upserted in-place).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5';
import {
  applyCommentAction,
  applyIssueAction,
  findSubmissionByIssue,
  GhComment,
  GhIssue,
  markSeen,
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

interface NotificationThread {
  id: string;
  reason: string;
  unread: boolean;
  updated_at: string;
  last_read_at: string | null;
  subject: {
    title: string;
    url: string;
    latest_comment_url: string | null;
    type: 'Issue' | 'PullRequest' | 'Commit' | 'Release' | 'Discussion';
  };
  repository: { full_name: string };
}

async function gh<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url.startsWith('http') ? url : `https://api.github.com${url}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'queer-guide-feedback-sync',
    },
  });
  if (!res.ok) throw new Error(`GH ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

async function patch(url: string, token: string, body?: unknown): Promise<void> {
  const res = await fetch(url.startsWith('http') ? url : `https://api.github.com${url}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'queer-guide-feedback-sync',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok && res.status !== 205) throw new Error(`GH PATCH ${res.status}: ${await res.text()}`);
}

serve(async (req) => {
  if (req.method !== 'POST' && req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const token = Deno.env.get('GITHUB_PAT');
  if (!token) return json({ error: 'GITHUB_PAT not configured' }, 500);

  const svc = getServiceClient();

  const { data: stateRow } = await svc
    .from('github_poller_state')
    .select('cursor')
    .eq('id', 'singleton')
    .maybeSingle();
  const since = stateRow?.cursor ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const threads = await gh<NotificationThread[]>(
    `/notifications?participating=true&since=${encodeURIComponent(since)}&per_page=50`,
    token,
  );

  const summary: Record<string, number> = {
    threads: threads.length,
    synced_issues: 0,
    synced_comments: 0,
    dedup: 0,
    skipped: 0,
  };

  for (const t of threads) {
    if (t.subject.type !== 'Issue' || !t.subject.url) {
      summary.skipped++;
      continue;
    }

    // Dedup the thread-update itself (cheap global dedup by last-updated).
    const threadKey = `gh-thread:${t.id}:${t.updated_at}`;
    if (!(await markSeen(svc, threadKey, 'notification_thread'))) {
      summary.dedup++;
      continue;
    }

    const issue = await gh<GhIssue>(t.subject.url, token);
    const sub = await findSubmissionByIssue(svc, issue.number);
    if (!sub) {
      summary.skipped++;
      await patch(`/notifications/threads/${t.id}`, token).catch(() => {});
      continue;
    }

    // Mirror current issue state (labels/assignees/title/body/state).
    await applyIssueAction(svc, 'edited', issue, sub);
    if (issue.state === 'closed' && sub.feedback_status !== 'done') {
      await applyIssueAction(svc, 'closed', issue, sub);
    } else if (issue.state === 'open' && sub.feedback_status === 'done') {
      await applyIssueAction(svc, 'reopened', issue, sub);
    }
    summary.synced_issues++;

    // Fetch comments since last read.
    const cursor = t.last_read_at ?? since;
    const comments = await gh<GhComment[]>(
      `/repos/${t.repository.full_name}/issues/${issue.number}/comments?since=${encodeURIComponent(cursor)}`,
      token,
    );
    for (const c of comments) {
      const res = await applyCommentAction(svc, 'created', c, { id: sub.id, data: sub.data });
      if (res.action === 'comment_dedup') summary.dedup++;
      else summary.synced_comments++;
    }

    await patch(`/notifications/threads/${t.id}`, token).catch(() => {});
  }

  const newCursor = new Date().toISOString();
  await svc
    .from('github_poller_state')
    .upsert({ id: 'singleton', cursor: newCursor }, { onConflict: 'id' });

  return json({ success: true, cursor: newCursor, ...summary });
});
