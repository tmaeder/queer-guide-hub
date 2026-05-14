/**
 * github-notifications-poller — safety net for missed webhook deliveries.
 *
 * Fine-grained PATs cannot access `/notifications`, so we poll the repo's
 * issues and comments endpoints directly (Issues:read is enough).
 *
 * Cron: every 5 min.
 *   - GET /repos/{owner}/{repo}/issues?since=<cursor>&state=all
 *     → applyIssueAction("edited" + close/open mirror) per issue
 *   - GET /repos/{owner}/{repo}/issues/comments?since=<cursor>
 *     → applyCommentAction("created") per comment (dedup by github_comment_id)
 *
 * Cursor stored in a single-row `github_poller_state` table.
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5';
import {
  applyCommentAction,
  applyIssueAction,
  findSubmissionByIssue,
  GhComment,
  GhIssue,
} from '../_shared/github-sync.ts';

const REPO_OWNER = 'tmaeder';
const REPO_NAME = 'queer-guide-hub';

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

async function gh<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
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

Deno.serve(async (req) => {
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
  const sinceEnc = encodeURIComponent(since);

  const summary: Record<string, number> = {
    issues_checked: 0,
    synced_issues: 0,
    comments_checked: 0,
    synced_comments: 0,
    dedup: 0,
    skipped: 0,
  };

  // Issues updated since cursor (excludes PRs via filter).
  const issues = await gh<GhIssue[]>(
    `/repos/${REPO_OWNER}/${REPO_NAME}/issues?since=${sinceEnc}&state=all&per_page=100&sort=updated&direction=asc`,
    token,
  );
  for (const issue of issues) {
    // Skip PRs — the issues endpoint returns both.
    if ((issue as unknown as { pull_request?: unknown }).pull_request) {
      summary.skipped++;
      continue;
    }
    summary.issues_checked++;
    const sub = await findSubmissionByIssue(svc, issue.number);
    if (!sub) {
      summary.skipped++;
      continue;
    }
    await applyIssueAction(svc, 'edited', issue, sub);
    if (issue.state === 'closed' && sub.feedback_status !== 'done') {
      await applyIssueAction(svc, 'closed', issue, sub);
    } else if (issue.state === 'open' && sub.feedback_status === 'done') {
      await applyIssueAction(svc, 'reopened', issue, sub);
    }
    summary.synced_issues++;
  }

  // All repo comments updated since cursor.
  const comments = await gh<GhComment[]>(
    `/repos/${REPO_OWNER}/${REPO_NAME}/issues/comments?since=${sinceEnc}&per_page=100&sort=updated&direction=asc`,
    token,
  );
  for (const c of comments) {
    summary.comments_checked++;
    // issue_url looks like https://api.github.com/repos/owner/repo/issues/123
    const issueUrl = (c as unknown as { issue_url?: string }).issue_url;
    const m = issueUrl?.match(/\/issues\/(\d+)$/);
    if (!m) {
      summary.skipped++;
      continue;
    }
    const issueNumber = Number(m[1]);
    const sub = await findSubmissionByIssue(svc, issueNumber);
    if (!sub) {
      summary.skipped++;
      continue;
    }
    const res = await applyCommentAction(svc, 'created', c, { id: sub.id, data: sub.data });
    if (res.action === 'comment_dedup') summary.dedup++;
    else summary.synced_comments++;
  }

  const newCursor = new Date().toISOString();
  await svc
    .from('github_poller_state')
    .upsert({ id: 'singleton', cursor: newCursor }, { onConflict: 'id' });

  return json({ success: true, cursor: newCursor, ...summary });
});
