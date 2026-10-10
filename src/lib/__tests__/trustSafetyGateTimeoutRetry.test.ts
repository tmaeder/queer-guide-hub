import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `Trust & safety gates` is a REQUIRED check that calls the live prod RPC
 * `trust_safety_gate_status()` over PostgREST, where `authenticator` pins
 * `statement_timeout = 8s`. A 57014 there means the RPC ran out of time, so NO
 * gate was evaluated at all — the opposite of a gate being breached — and the
 * PR goes red for a reason unrelated to its diff.
 *
 * It fired on #4275 (green on the previous head 20 minutes earlier, identical
 * diff). Measured on the live instance at that moment: the function is 294 ms /
 * 55,096 blocks / zero temp spill cold-planned, 800 ms warm, against the
 * 8,000 ms ceiling — 27x headroom. Contention, not cost.
 *
 * Three of the four gate scripts already retried on 57014; this one never got
 * it. These assertions guard the port, and they are anchored the way the
 * sibling's own guard records as necessary — on the RETRY and on the DELAY,
 * never on the presence of the string, because printing `57014` in an error
 * message satisfies a bare match while the retry is gone.
 */
describe('check-trust-safety-gates.mjs — 57014 retry', () => {
  const SCRIPT = readFileSync(
    join(process.cwd(), 'scripts/check-trust-safety-gates.mjs'),
    'utf8',
  );

  // Counting `process.exit(1)` over the RAW file is satisfied by a COMMENTED-OUT
  // copy of it — measured: commenting out the terminal exit, which softens the
  // CRITICAL gate into a warning, survived that assertion. Anything counted
  // rather than matched is counted here instead. Line-start only, because this
  // script's prose legitimately contains `//` mid-line in URLs.
  const CODE = SCRIPT.split('\n')
    .filter((l) => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*'))
    .join('\n');

  it('retries once on 57014 instead of failing a required check', () => {
    // Anchored from the 57014 branch INTO a second call, so a mutation that
    // keeps the detection and drops the retry fails here.
    expect(SCRIPT).toMatch(/includes\('57014'\)[\s\S]{0,600}?await callGates\(\)/);
  });

  it('delays the retry, which is the whole fix', () => {
    // #3996 measured this on the sibling script: an immediate retry puts both
    // attempts inside the SAME contention window and both time out. The anchor
    // runs from the branch THROUGH an awaited timer and INTO the retry call.
    expect(SCRIPT).toMatch(
      /includes\('57014'\)[\s\S]{0,600}?await new Promise[\s\S]{0,160}?setTimeout\([\s\S]{0,240}?await callGates\(\)/,
    );
  });

  it('keeps the delay a reviewable literal', () => {
    const m = SCRIPT.match(/RETRY_DELAY_MS\s*=\s*([0-9_]+)/);
    expect(m, 'RETRY_DELAY_MS must be a literal so its magnitude is reviewable').not.toBeNull();
    const ms = Number((m ? m[1] : '0').replace(/_/g, ''));
    // Far enough out to sample a DIFFERENT load window; an instant retry
    // re-samples the same one and both attempts time out (#3996).
    expect(ms).toBeGreaterThanOrEqual(10_000);
  });

  it('retries ONLY on 57014, so a real gate breach still fails at once', () => {
    // The guard condition must test the body, not merely `!res.ok`. A retry on
    // any failure would retry a genuine CRITICAL breach into silence.
    expect(SCRIPT).toMatch(/if\s*\(!res\.ok\s*&&\s*body\?\.includes\('57014'\)\)/);
    // Exactly one retry call site: two would double the window silently.
    expect(CODE.match(/await callGates\(\)/g) ?? []).toHaveLength(2);
  });

  it('prints the response body on failure, not just the status', () => {
    // Diagnosing the #4275 occurrence needed a query against prod because the
    // log read `HTTP 500` and named no cause. A failed probe must say why.
    expect(SCRIPT).toMatch(/HTTP \$\{res\.status\}: \$\{body\}/);
  });

  it('still fails hard on a breached CRITICAL gate', () => {
    // The retry must not have softened the thing this gate exists to do.
    expect(CODE).toContain('CRITICAL gate(s) breached');
    // Two live exits: the RPC-unreachable one and the breached-gate one.
    // Over CODE, not SCRIPT — see the note on the stripper above.
    expect(CODE.match(/process\.exit\(1\)/g) ?? []).toHaveLength(2);
  });
});
