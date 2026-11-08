import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The gate scripts are REQUIRED checks that call live prod RPCs over PostgREST.
 * A gate script has THREE outcomes and only two are about the gate: it passed,
 * it was breached, or IT WAS NEVER EVALUATED. The third must read as neither of
 * the others, or a PR goes red for a reason unrelated to its diff.
 *
 * TWO conditions are a non-evaluation, and only one was handled until
 * 2026-10-14:
 *   - Postgres 57014, `authenticator`'s 8s statement_timeout. Fired on #4275;
 *     measured then at 294 ms / 55,096 blocks cold, 800 ms warm against the
 *     8,000 ms ceiling — 27x headroom, so contention, not cost.
 *   - A TRANSPORT STALL, where `fetch` THROWS instead of returning a response.
 *     A branch reading `57014` out of a response body is then structurally
 *     unreachable and the script dies on an unhandled rejection with a raw
 *     stack trace. Measured on #4404's head 09fdf873f: check-trust-safety-
 *     gates.mjs:32 (18:26:19 -> 18:31:21) and check-data-quality-gates.mjs:34
 *     (18:26:22 -> 18:31:25) — two jobs, two runners, both the FIRST call, both
 *     dead at exactly five minutes (undici's headers timeout), four seconds
 *     apart, on a documentation-only diff.
 *
 * The CLASSIFICATION now lives in scripts/lib/gate-rpc.mjs and is tested
 * BEHAVIOURALLY in gateRpcNotEvaluated.test.ts — a source assertion cannot tell
 * a live guard from a dead one, which is the defect above. What is asserted
 * here is ADOPTION and the per-script invariants a shared helper cannot carry.
 *
 * All three adopters are covered, not just the one that was fixed first: the
 * helper exists so they cannot drift apart, and a test for one of them does not
 * notice the other two reverting to a bare fetch.
 */

const ADOPTERS = [
  {
    file: 'scripts/check-trust-safety-gates.mjs',
    call: 'callGates',
    rpc: 'trust_safety_gate_status',
  },
  // The retry lives in callWithRetry(), whose single-call parameter is callOnce.
  { file: 'scripts/check-data-quality-gates.mjs', call: 'callOnce', rpc: 'release_gate_checks' },
  { file: 'scripts/check-tag-hygiene.mjs', call: 'callStats', rpc: 'tag_hygiene_stats' },
] as const;

const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf8');

// Counting over the RAW file is satisfied by a COMMENTED-OUT copy — measured:
// commenting out the terminal exit, which softens a CRITICAL gate into a
// warning, survived that assertion. Anything COUNTED is counted over this.
// Line-start only, because the prose legitimately contains `//` mid-line.
const stripComments = (s: string) =>
  s
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*'))
    .join('\n');

describe.each(ADOPTERS)('$file — non-evaluation retry', ({ file, call, rpc }) => {
  const SCRIPT = read(file);
  const CODE = stripComments(SCRIPT);

  it('routes its RPC through the shared helper, so it cannot throw', () => {
    expect(CODE).toMatch(/import \{[^}]*callRpc[^}]*\} from '\.\/lib\/gate-rpc\.mjs'/);
    // The RPC call itself must go through callRpc. A bare `fetch` on this path
    // is the defect: it throws, and the retry below can never see it.
    expect(CODE).toMatch(new RegExp(`callRpc\\(\`\\$\\{BASE\\}/rest/v1/rpc/${rpc}\``));
    expect(CODE).not.toMatch(new RegExp(`fetch\\(\`\\$\\{BASE\\}/rest/v1/rpc/${rpc}\``));
  });

  it('gates the retry on notEvaluated(), not on a hand-rolled body match', () => {
    // A local `body?.includes('57014')` is the shape that missed the throw.
    // Keeping the decision in one place is why the helper exists.
    expect(CODE).toMatch(new RegExp(`if \\(notEvaluated\\(res\\)\\)`));
    expect(CODE).not.toContain("body?.includes('57014')");
  });

  it('retries exactly once, and the retry is DELAYED', () => {
    // #3996 measured this: an immediate retry puts both attempts inside the
    // SAME contention window and both fail seconds apart. The 2026-10-14 stall
    // lasted about nine minutes. Anchored from the branch THROUGH an awaited
    // timer and INTO the second call, so dropping any link fails here.
    expect(CODE).toMatch(
      new RegExp(
        `notEvaluated\\(res\\)[\\s\\S]{0,900}?await new Promise[\\s\\S]{0,200}?setTimeout\\([\\s\\S]{0,300}?await ${call}\\(\\)`,
      ),
    );
    // Exactly two call sites: two retries would double the window silently.
    expect(CODE.match(new RegExp(`await ${call}\\(\\)`, 'g')) ?? []).toHaveLength(2);
  });

  it('keeps the delay a reviewable literal of at least 10s', () => {
    const m = CODE.match(/RETRY_DELAY_MS\s*=\s*([0-9_]+)/);
    expect(m, 'RETRY_DELAY_MS must be a literal so its magnitude is reviewable').not.toBeNull();
    expect(Number((m ? m[1] : '0').replace(/_/g, ''))).toBeGreaterThanOrEqual(10_000);
  });

  it('a non-evaluation still FAILS the check — it never becomes a pass', () => {
    // "We could not look" reading as "nothing found" is the vacuous green this
    // repo keeps recording. The retry must not have softened that.
    expect(CODE).toMatch(/if \(!res\.ok\) \{[\s\S]{0,400}?process\.exit\(1\)/);
  });

  it('prints the response body on failure, not just the status', () => {
    // Diagnosing #4275 needed a query against prod because the log read
    // `HTTP 500` and named no cause. A failed probe must say why.
    expect(CODE).toMatch(/HTTP \$\{res\.status\}: \$\{res\.body\}/);
  });
});

describe('check-trust-safety-gates.mjs — gate semantics', () => {
  const SCRIPT = read('scripts/check-trust-safety-gates.mjs');
  const CODE = stripComments(SCRIPT);

  it('still fails hard on a breached CRITICAL gate', () => {
    expect(CODE).toContain('CRITICAL gate(s) breached');
    // Two live exits: the RPC-unreachable one and the breached-gate one.
    expect(CODE.match(/process\.exit\(1\)/g) ?? []).toHaveLength(2);
  });
});

describe('check-data-quality-gates.mjs — every gate RPC gets the retry', () => {
  // #5209 (2026-11-08): release_gate_checks timed out, retried and passed, then
  // event_quality_gate_checks timed out in the same load window with no retry
  // and failed the PR. The retry must cover every RPC this script calls.
  const CODE = stripComments(read('scripts/check-data-quality-gates.mjs'));

  it.each(['release_gate_checks', 'personality_quality_gate_checks', 'event_quality_gate_checks'])(
    '%s is called through callWithRetry',
    (rpc) => {
      expect(CODE).toMatch(new RegExp(`await callWithRetry\\('${rpc}'`));
    },
  );

  it('calls no gate RPC outside the helper', () => {
    const rpcs = CODE.match(/rest\/v1\/rpc\/(\w+)/g) ?? [];
    expect(rpcs.length).toBe(3);
    expect(CODE.match(/await callWithRetry\(/g) ?? []).toHaveLength(3);
  });
});

describe('no gate script re-introduces a throwing fetch on its primary RPC', () => {
  it('every adopter is free of a bare fetch', () => {
    // The helper only helps where it is used. This is the drift check.
    for (const { file } of ADOPTERS) {
      const code = stripComments(read(file));
      expect(code, `${file} must not call fetch() directly`).not.toMatch(/[^.\w]fetch\(/);
    }
  });
});
