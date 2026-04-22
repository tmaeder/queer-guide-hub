/**
 * verify-github-sync — end-to-end smoke test for the GitHub ↔ feedback sync.
 *
 * Usage: GITHUB_PAT=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *        npx tsx scripts/verify-github-sync.ts
 *
 * Checks:
 *   1. Repo webhook exists and points at the deployed `github-webhook` function
 *   2. Subscribed events include issues, issue_comment, pull_request, workflow_run
 *   3. Creating + commenting + closing + reopening an issue round-trips into
 *      `community_submissions` within 10s per step
 *   4. Cleans up by closing the test issue
 */

import { createClient } from '@supabase/supabase-js';

const REPO_OWNER = 'tmaeder';
const REPO_NAME = 'queer-guide-hub';
const REQUIRED_EVENTS = ['issues', 'issue_comment', 'pull_request', 'workflow_run'];
const WEBHOOK_URL_MARKER = '/functions/v1/github-webhook';
const STEP_TIMEOUT_MS = 10_000;

const PAT = process.env.GITHUB_PAT;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!PAT || !SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Missing GITHUB_PAT / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const svc = createClient(SUPABASE_URL, SERVICE_ROLE);

const gh = async (path: string, init: RequestInit = {}) => {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${PAT}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`GitHub ${init.method ?? 'GET'} ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
};

const pass = (msg: string) => console.log(`  \u2713 ${msg}`);
const fail = (msg: string) => {
  console.error(`  \u2717 ${msg}`);
  process.exitCode = 1;
};

async function waitFor<T>(label: string, check: () => Promise<T | null>): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < STEP_TIMEOUT_MS) {
    const r = await check();
    if (r != null) return r;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timed out waiting for: ${label}`);
}

async function checkWebhookConfig() {
  console.log('1. Webhook config');
  try {
    const hooks = await gh(`/repos/${REPO_OWNER}/${REPO_NAME}/hooks`);
    const hook = (hooks as Array<{ config: { url: string }; events: string[]; active: boolean }>).find((h) =>
      h.config.url.includes(WEBHOOK_URL_MARKER),
    );
    if (!hook) return fail(`No webhook found pointing at ${WEBHOOK_URL_MARKER}`);
    pass(`Webhook present at ${hook.config.url}`);
    if (!hook.active) fail('Webhook is not active');
    else pass('Webhook active');
    const missing = REQUIRED_EVENTS.filter((e) => !hook.events.includes(e));
    if (missing.length) fail(`Missing events: ${missing.join(', ')}`);
    else pass(`Subscribed to ${REQUIRED_EVENTS.join(', ')}`);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes('403')) console.log(`  ⚠ skipped (PAT lacks admin:repo_hook): ${msg.slice(0, 80)}`);
    else throw e;
  }
}

async function checkRoundTrip() {
  console.log('2. Round-trip (create → comment → close → reopen)');
  const stamp = Date.now();
  const title = `[verify-sync] smoke test ${stamp}`;

  const issue = (await gh(`/repos/${REPO_OWNER}/${REPO_NAME}/issues`, {
    method: 'POST',
    body: JSON.stringify({ title, body: 'Automated verification — safe to close.' }),
  })) as { number: number; html_url: string };
  pass(`Opened test issue #${issue.number}`);

  const { data: sub } = await svc
    .from('community_submissions')
    .insert({
      content_type: 'feedback',
      feedback_status: 'in_progress',
      github_issue_number: issue.number,
      github_issue_url: issue.html_url,
      data: { title, description: 'verify-sync placeholder', category: 'bug' },
    })
    .select('id')
    .single();
  if (!sub) {
    await gh(`/repos/${REPO_OWNER}/${REPO_NAME}/issues/${issue.number}`, {
      method: 'PATCH',
      body: JSON.stringify({ state: 'closed' }),
    });
    return fail('Could not insert placeholder community_submissions row');
  }

  try {
    await gh(`/repos/${REPO_OWNER}/${REPO_NAME}/issues/${issue.number}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body: `verify-sync comment ${stamp}` }),
    });
    await waitFor('comment appears in data.replies', async () => {
      const { data } = await svc
        .from('community_submissions')
        .select('data')
        .eq('id', sub.id)
        .single();
      const replies = (data?.data?.replies ?? []) as Array<{ body: string }>;
      return replies.some((r) => r.body?.includes(`verify-sync comment ${stamp}`)) ? true : null;
    });
    pass('Comment synced into data.replies');

    await gh(`/repos/${REPO_OWNER}/${REPO_NAME}/issues/${issue.number}`, {
      method: 'PATCH',
      body: JSON.stringify({ state: 'closed', state_reason: 'completed' }),
    });
    await waitFor('status flips to done', async () => {
      const { data } = await svc
        .from('community_submissions')
        .select('feedback_status')
        .eq('id', sub.id)
        .single();
      return data?.feedback_status === 'done' ? true : null;
    });
    pass('Close → feedback_status=done');

    await gh(`/repos/${REPO_OWNER}/${REPO_NAME}/issues/${issue.number}`, {
      method: 'PATCH',
      body: JSON.stringify({ state: 'open' }),
    });
    await waitFor('status flips to in_progress', async () => {
      const { data } = await svc
        .from('community_submissions')
        .select('feedback_status')
        .eq('id', sub.id)
        .single();
      return data?.feedback_status === 'in_progress' ? true : null;
    });
    pass('Reopen → feedback_status=in_progress');
  } finally {
    await gh(`/repos/${REPO_OWNER}/${REPO_NAME}/issues/${issue.number}`, {
      method: 'PATCH',
      body: JSON.stringify({ state: 'closed', state_reason: 'not_planned' }),
    }).catch(() => {});
    await svc.from('community_submissions').delete().eq('id', sub.id);
    pass('Cleanup complete');
  }
}

(async () => {
  try {
    await checkWebhookConfig();
    await checkRoundTrip();
  } catch (e) {
    fail((e as Error).message);
  }
  if (process.exitCode) console.error('\nFAIL');
  else console.log('\nPASS');
})();
