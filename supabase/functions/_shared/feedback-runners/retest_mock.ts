// Mock retest runner. Synchronous: returns a fabricated pass/fail so the UI
// can be exercised without a real test runner attached. Deterministic by
// retest id so tests are stable.

import type { RetestRunner } from './types.ts';

const FAIL_ON = (Deno.env.get('FEEDBACK_RETEST_MOCK_FAIL_PREFIX') ?? '').toLowerCase();

export const mockRetestRunner: RetestRunner = {
  name: 'mock',
  async dispatch({ retestId, kind }) {
    const externalRef = `mock-retest-${retestId.slice(0, 8)}`;
    const shouldFail = FAIL_ON.length > 0 && retestId.toLowerCase().startsWith(FAIL_ON);
    const status = shouldFail ? 'failed' : 'passed';
    return {
      externalRef,
      syncResult: {
        status,
        result: {
          kind,
          passed: shouldFail ? 0 : 1,
          failed: shouldFail ? 1 : 0,
          skipped: 0,
          duration_ms: 1234,
          log_excerpt: shouldFail
            ? `Mock retest failed: pretend assertion mismatch in ${kind}.`
            : `Mock retest passed: ${kind} green.`,
          screenshots: [],
          mock: true,
        },
      },
    };
  },
};
