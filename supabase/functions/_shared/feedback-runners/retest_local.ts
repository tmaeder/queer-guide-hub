// Local retest runner. Mirror of localFixRunner — Supabase side is a no-op
// stamping external_ref='local-<retestId>'. The local poller daemon picks up
// retests where runner='local' AND status='running', runs the requested
// check, and calls record_retest_result.

import type { RetestRunner } from './types.ts';

export const localRetestRunner: RetestRunner = {
  name: 'local',
  // deno-lint-ignore require-await
  async dispatch({ retestId }) {
    return { externalRef: `local-${retestId}` };
  },
};
