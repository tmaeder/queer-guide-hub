// Local runner. The Supabase side is a no-op: we just stamp the run row
// with external_ref='local-<runId>' so a poller daemon on the developer
// machine (scripts/feedback-runner-local.mjs) can pick it up and execute
// claude headless against a local checkout.
//
// Concretely the dispatch flow becomes:
//   client → claude-routine-dispatch → local.dispatch (no network) →
//   record_routine_progress(status='dispatched', external_ref='local-<id>')
// The local poller then queries for status='dispatched' AND runner='local',
// flips to 'in_progress', runs claude, opens a PR, calls record_fix_proposed.

import type { FixRunner } from './types.ts';

export const localFixRunner: FixRunner = {
  name: 'local',
  // deno-lint-ignore require-await
  async dispatch({ runId }) {
    return { externalRef: `local-${runId}` };
  },
};
