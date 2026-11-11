import { assert, assertEquals, assertFalse } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { isTransientOutage, STALE_ESCALATE_MIN } from './staleness.ts';

Deno.test('a fresh snapshot makes a failed fetch weather, not a failure', () => {
  assert(isTransientOutage(0));
  assert(isTransientOutage(5));
  assert(isTransientOutage(STALE_ESCALATE_MIN - 1));
});

Deno.test('at and past the threshold it escalates so auto-pause can still fire', () => {
  assertFalse(isTransientOutage(STALE_ESCALATE_MIN));
  assertFalse(isTransientOutage(STALE_ESCALATE_MIN + 1));
  assertFalse(isTransientOutage(10_000));
});

Deno.test('an unreadable snapshot escalates rather than passing indefinitely', () => {
  assertFalse(isTransientOutage(Infinity));
});

Deno.test('the threshold stays under the health check 120 min hard fail', () => {
  // If this ever exceeds 120, check-pipeline-health goes red while the automation
  // still reports success — the health check would become the only witness.
  assert(STALE_ESCALATE_MIN < 120);
  assertEquals(STALE_ESCALATE_MIN, 60);
});
