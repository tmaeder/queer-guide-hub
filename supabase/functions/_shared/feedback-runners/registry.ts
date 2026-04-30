// Selects the active fix + retest runner from env vars.
//   FEEDBACK_FIX_RUNNER ∈ {mock, github_actions, webhook, api} — defaults to mock
//   FEEDBACK_RETEST_RUNNER ∈ {mock, github_actions, webhook} — defaults to mock

import type { FixRunner, RetestRunner } from './types.ts';
import { mockFixRunner } from './mock.ts';
import { githubActionsFixRunner } from './github_actions.ts';
import { webhookFixRunner } from './webhook.ts';
import { apiFixRunner } from './api.ts';
import { mockRetestRunner } from './retest_mock.ts';
import { githubActionsRetestRunner } from './retest_github_actions.ts';
import { webhookRetestRunner } from './retest_webhook.ts';

const FIX_RUNNERS: Record<string, FixRunner> = {
  mock: mockFixRunner,
  github_actions: githubActionsFixRunner,
  webhook: webhookFixRunner,
  api: apiFixRunner,
};

const RETEST_RUNNERS: Record<string, RetestRunner> = {
  mock: mockRetestRunner,
  github_actions: githubActionsRetestRunner,
  webhook: webhookRetestRunner,
};

export function pickFixRunner(override?: string): FixRunner {
  const name = override || Deno.env.get('FEEDBACK_FIX_RUNNER') || 'mock';
  const runner = FIX_RUNNERS[name];
  if (!runner) throw new Error(`unknown fix runner: ${name}`);
  return runner;
}

export function pickRetestRunner(override?: string): RetestRunner {
  const name = override || Deno.env.get('FEEDBACK_RETEST_RUNNER') || 'mock';
  const runner = RETEST_RUNNERS[name];
  if (!runner) throw new Error(`unknown retest runner: ${name}`);
  return runner;
}
