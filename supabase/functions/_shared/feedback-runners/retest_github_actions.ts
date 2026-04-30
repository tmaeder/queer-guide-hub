// GitHub Actions retest runner. Fires repository_dispatch event 'feedback-retest'
// with the routine run + retest ids; the workflow runs the requested check
// (typecheck/lint/unit/e2e/targeted) and POSTs results back to
// feedback-retest-callback.

import type { RetestRunner } from './types.ts';

export const githubActionsRetestRunner: RetestRunner = {
  name: 'github_actions',
  async dispatch({ retestId, routineRunId, storyId, kind, callbackUrl, hmacSecret }) {
    const repo = Deno.env.get('FEEDBACK_FIX_GH_REPO');
    const token = Deno.env.get('FEEDBACK_FIX_GH_TOKEN');
    const eventType = Deno.env.get('FEEDBACK_RETEST_GH_EVENT') ?? 'feedback-retest';
    if (!repo || !token) {
      throw new Error('github_actions retest runner requires FEEDBACK_FIX_GH_REPO + FEEDBACK_FIX_GH_TOKEN');
    }

    const res = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        event_type: eventType,
        client_payload: {
          retest_id: retestId,
          routine_run_id: routineRunId,
          story_id: storyId,
          kind,
          callback_url: callbackUrl,
          hmac_secret: hmacSecret,
        },
      }),
    });

    if (!res.ok) {
      throw new Error(`github_actions retest dispatch failed (${res.status}): ${await res.text().catch(() => '')}`);
    }
    return { externalRef: `gh:${eventType}:${retestId}` };
  },
};
