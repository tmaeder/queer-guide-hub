import { describe, expect, it } from 'vitest';

// Kept on ONE line: `@ts-expect-error` suppresses the next LINE, and TS7016 for
// an untyped .mjs is reported at the module specifier. Same shape as
// recoverMigrationDrift.test.ts, and for the same reason.
// @ts-expect-error — .mjs script lib, no type declarations
import {
  classifyRpcFailure,
  retryDelayMs,
  STATEMENT_TIMEOUT_CODE,
} from '../../../scripts/lib/rpc-retry.mjs';

/** The body PostgREST returns when the 8s statement_timeout cancels the call. */
const TIMEOUT_BODY = `{"code":"${STATEMENT_TIMEOUT_CODE}","details":null,"hint":null,"message":"canceling statement due to statement timeout"}`;

describe('classifyRpcFailure', () => {
  it('treats the statement timeout as transient', () => {
    expect(classifyRpcFailure(500, TIMEOUT_BODY)).toBe('transient');
  });

  // The narrowness is the point. A 500 from a real SQL fault — a bad cast, a
  // missing column, the 42804 that this very gate shipped with — is not helped
  // by asking again, and retrying it only triples the time to a red build.
  it('treats a 500 that is NOT a timeout as fatal', () => {
    const bodies = [
      '{"code":"42804","message":"structure of query does not match function result type"}',
      '{"code":"42703","message":"column does not exist"}',
      'Internal Server Error',
      '',
    ];
    for (const b of bodies) expect(classifyRpcFailure(500, b)).toBe('fatal');
  });

  // PostgREST answers an argument-NAME mismatch with PGRST202/404. Retrying
  // that re-asks a question the server will never understand, and the silent
  // 404 is a documented trap in this repo — so it must fail fast, loudly.
  it('treats 404 as fatal even though it looks incidental', () => {
    expect(classifyRpcFailure(404, '{"code":"PGRST202"}')).toBe('fatal');
  });

  it('treats gateway and throttle statuses as transient', () => {
    for (const s of [408, 429, 502, 503, 504]) expect(classifyRpcFailure(s, '')).toBe('transient');
  });

  it('treats auth and permission errors as fatal', () => {
    for (const s of [401, 403]) expect(classifyRpcFailure(s, '')).toBe('fatal');
  });

  // Guards the substring test against a body that merely CONTAINS the digits in
  // another field — the code has to be the reported error, not a row count that
  // happens to read 57014.
  it('does not treat an unrelated status as transient just because the body mentions the code', () => {
    expect(classifyRpcFailure(403, TIMEOUT_BODY)).toBe('fatal');
  });
});

describe('retryDelayMs', () => {
  // Linear, not exponential: the cause is a busy instance, not a rate limit, and
  // the whole budget has to stay well inside a CI step.
  it('backs off linearly and stays inside a CI step', () => {
    expect(retryDelayMs(1)).toBe(2000);
    expect(retryDelayMs(2)).toBe(4000);
    expect(retryDelayMs(3)).toBe(6000);
    // Two waits are spent across three attempts.
    expect(retryDelayMs(1) + retryDelayMs(2)).toBeLessThan(10_000);
  });
});
