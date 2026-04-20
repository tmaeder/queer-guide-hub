/**
 * Shared GitHub ↔ feedback sync helpers.
 *
 * Used by `github-webhook` (push) and `github-notifications-poller` (pull) so
 * both paths mutate `community_submissions` identically and dedup via
 * `github_event_ids`.
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5';

export interface GhIssue {
  number: number;
  state: 'open' | 'closed';
  state_reason?: string | null;
  html_url: string;
  title: string;
  body?: string | null;
  labels?: Array<{ name: string } | string>;
  assignees?: Array<{ login: string }>;
  user?: { login: string };
}

export interface GhComment {
  id: number;
  body: string;
  user: { login: string };
  html_url: string;
  created_at: string;
  updated_at: string;
}

export interface SyncResult {
  action: string;
  submission_id?: string;
  skipped?: string;
}

/**
 * Dedup gate. Inserts id into `github_event_ids`. Returns true if this is the
 * first time we've seen the id (= proceed); false if already processed.
 */
export async function markSeen(
  svc: SupabaseClient,
  id: string,
  kind: string,
): Promise<boolean> {
  const { error } = await svc.from('github_event_ids').insert({ id, kind });
  if (!error) return true;
  const code = (error as { code?: string }).code;
  if (code === '23505') return false; // unique_violation = already seen
  throw new Error(`github_event_ids insert failed: ${error.message}`);
}

/**
 * Find a submission by issue number. Returns null if no match (issue not
 * originated from feedback).
 */
export async function findSubmissionByIssue(
  svc: SupabaseClient,
  issueNumber: number,
): Promise<{
  id: string;
  content_type: string;
  data: Record<string, unknown>;
  feedback_status: string | null;
  resolved_at: string | null;
} | null> {
  const { data } = await svc
    .from('community_submissions')
    .select('id,content_type,data,feedback_status,resolved_at')
    .eq('github_issue_number', issueNumber)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    content_type: data.content_type,
    data: (data.data ?? {}) as Record<string, unknown>,
    feedback_status: data.feedback_status,
    resolved_at: data.resolved_at,
  };
}

function normalizeLabels(labels?: Array<{ name: string } | string>): string[] {
  if (!Array.isArray(labels)) return [];
  return labels.map((l) => (typeof l === 'string' ? l : l.name)).filter(Boolean);
}

/**
 * Apply an `issues.*` action from GitHub to a submission row. Handles:
 * closed, reopened, edited, labeled/unlabeled, assigned/unassigned.
 * Sets data._last_source='github' so outbound push can skip (loop guard).
 */
export async function applyIssueAction(
  svc: SupabaseClient,
  action: string,
  issue: GhIssue,
  submission: { id: string; data: Record<string, unknown>; resolved_at: string | null },
): Promise<SyncResult> {
  const now = new Date().toISOString();
  const data = { ...submission.data, _last_source: 'github' };

  if (action === 'closed') {
    const stateReason = issue.state_reason;
    const resolution =
      stateReason === 'not_planned'
        ? 'wontfix'
        : stateReason === 'duplicate'
          ? 'duplicate'
          : 'fixed';
    await svc
      .from('community_submissions')
      .update({
        feedback_status: 'done',
        resolved_at: submission.resolved_at ?? now,
        resolution,
        github_last_synced_at: now,
        data,
      })
      .eq('id', submission.id);
    return { action: 'closed', submission_id: submission.id };
  }

  if (action === 'reopened') {
    await svc
      .from('community_submissions')
      .update({
        feedback_status: 'in_progress',
        resolved_at: null,
        resolution: null,
        github_last_synced_at: now,
        data,
      })
      .eq('id', submission.id);
    return { action: 'reopened', submission_id: submission.id };
  }

  if (action === 'edited') {
    const patched = {
      ...data,
      title: issue.title,
      description: issue.body ?? (data.description as string | undefined) ?? '',
    };
    await svc
      .from('community_submissions')
      .update({ data: patched, github_last_synced_at: now })
      .eq('id', submission.id);
    return { action: 'edited', submission_id: submission.id };
  }

  if (action === 'labeled' || action === 'unlabeled') {
    const patched = { ...data, github_labels: normalizeLabels(issue.labels) };
    await svc
      .from('community_submissions')
      .update({ data: patched, github_last_synced_at: now })
      .eq('id', submission.id);
    return { action, submission_id: submission.id };
  }

  if (action === 'assigned' || action === 'unassigned') {
    const patched = {
      ...data,
      github_assignees: (issue.assignees ?? []).map((a) => a.login),
    };
    await svc
      .from('community_submissions')
      .update({ data: patched, github_last_synced_at: now })
      .eq('id', submission.id);
    return { action, submission_id: submission.id };
  }

  return { action, skipped: `unhandled_issue_action_${action}` };
}

/**
 * Apply an `issue_comment.*` action. Handles created/edited/deleted.
 * Dedup by comment id (so webhook vs poller double-delivery is safe).
 */
export async function applyCommentAction(
  svc: SupabaseClient,
  action: 'created' | 'edited' | 'deleted',
  comment: GhComment,
  submission: { id: string; data: Record<string, unknown> },
): Promise<SyncResult> {
  const now = new Date().toISOString();
  const replies = Array.isArray(submission.data.replies)
    ? [...(submission.data.replies as Array<Record<string, unknown>>)]
    : [];

  if (action === 'created') {
    const seen = await markSeen(svc, `gh-comment:${comment.id}`, 'issue_comment');
    if (!seen) return { action: 'comment_dedup', submission_id: submission.id };
    replies.push({
      by: null,
      by_name: `GH:${comment.user.login}`,
      body: comment.body,
      at: comment.created_at,
      emailed: false,
      email_id: null,
      email_error: null,
      github_url: comment.html_url,
      github_comment_id: comment.id,
    });
  } else if (action === 'edited') {
    const idx = replies.findIndex(
      (r) => (r as { github_comment_id?: number }).github_comment_id === comment.id,
    );
    if (idx === -1) return { action: 'comment_edit_not_found', submission_id: submission.id };
    replies[idx] = { ...replies[idx], body: comment.body, edited_at: comment.updated_at };
  } else {
    const idx = replies.findIndex(
      (r) => (r as { github_comment_id?: number }).github_comment_id === comment.id,
    );
    if (idx === -1) return { action: 'comment_delete_not_found', submission_id: submission.id };
    replies[idx] = { ...replies[idx], deleted_at: now };
  }

  const data = { ...submission.data, replies, _last_source: 'github' };
  await svc
    .from('community_submissions')
    .update({ data, github_last_synced_at: now })
    .eq('id', submission.id);
  return { action: `comment_${action}`, submission_id: submission.id };
}

/**
 * Extract issue number from PR body via `Closes #N` / `Fixes #N` / `Resolves #N`.
 */
export function linkedIssueNumbers(body: string | null | undefined): number[] {
  if (!body) return [];
  const re = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/gi;
  const nums = new Set<number>();
  for (const m of body.matchAll(re)) nums.add(Number(m[1]));
  return [...nums];
}
