// GitHub Actions fix runner. Fires a repository_dispatch event with the prompt;
// the workflow runs Claude headless and POSTs progress back to the
// claude-routine-callback edge function.
//
// Required env (configure as Supabase function secrets):
//   FEEDBACK_FIX_GH_REPO=tmaeder/queer-guide-hub
//   FEEDBACK_FIX_GH_TOKEN=ghp_... (PAT or fine-grained token with workflow scope)
//   FEEDBACK_FIX_GH_EVENT=claude-fix
// The workflow YAML lives at .github/workflows/claude-fix.yml and is documented
// in docs/plans/2026-04-30-feedback-claude-loop.md.

import type { FixRunner } from './types.ts';

export const githubActionsFixRunner: FixRunner = {
  name: 'github_actions',
  async dispatch({ runId, storyId, prompt, callbackUrl, hmacSecret }) {
    const repo = Deno.env.get('FEEDBACK_FIX_GH_REPO');
    const token = Deno.env.get('FEEDBACK_FIX_GH_TOKEN');
    const eventType = Deno.env.get('FEEDBACK_FIX_GH_EVENT') ?? 'claude-fix';
    if (!repo || !token) {
      throw new Error('github_actions runner requires FEEDBACK_FIX_GH_REPO + FEEDBACK_FIX_GH_TOKEN');
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
          run_id: runId,
          story_id: storyId,
          prompt,
          callback_url: callbackUrl,
          hmac_secret: hmacSecret,
        },
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`github_actions dispatch failed (${res.status}): ${text}`);
    }

    return { externalRef: `gh:${eventType}:${runId}` };
  },
};
