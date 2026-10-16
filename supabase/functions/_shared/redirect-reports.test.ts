// Guard for `publicReportRequest`'s handling of the `redirect_public_report_check`
// RPC payload.
//
// WHY THIS EXISTS. `ReportDb.rpc` declared `data: any`, so `check.data.version`,
// `check.data.retryAfter` and `check.data.passwordHash` were unchecked property
// reads on an untyped value — one of three `@typescript-eslint/no-explicit-any`
// code-scanning alerts open on the repo. Narrowing the interface to `unknown`
// forces those reads through the file's existing `record()` helper, and
// `record()` THROWS on a non-object where a raw property read would have thrown
// a TypeError. Both land in the same catch, but "both land in the same catch"
// is a claim, so these cases assert the status codes rather than restating it.
//
// WHAT THIS DOES NOT PROVE, stated rather than implied. Mutation-tested 1/2:
// neutering the `retryAfter` branch fails the suite (so it is not vacuous), but
// replacing `record(check.data)` with a bare `as Record<string, unknown>` cast
// SURVIVES — both produce the same 503, because a raw TypeError and `record()`'s
// Error land in the same catch. That is the honest result: this file pins the
// RESPONSE CONTRACT across a type-only refactor, which is exactly what such a
// refactor has to preserve. It cannot distinguish the two narrowing styles, and
// a test claiming to would be measuring nothing.
//
// There is no network and no Deno-specific API in this path: `publicReportRequest`
// takes a `Request`, a `db` with one `rpc` method, a secret and a CORS map. That
// is the whole reason this module is the one covered here and the webhook
// dispatcher is not — that one needs a TCP + TLS socket mock to reach any of its
// branches, which would be a far larger fixture than the change it guards.

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { publicReportRequest, type ReportDb } from './redirect-reports.ts';

const SECRET = 'test-secret';
const CORS = { 'Access-Control-Allow-Origin': '*' };
const ID = '11111111-2222-4333-8444-555555555555';

function req(method = 'GET') {
  return new Request('https://example.test/report', {
    method,
    headers: { Authorization: `Bearer qg_report_${ID}` },
  });
}

/** A db whose `rpc` answers each named procedure from a lookup. */
function db(answers: Record<string, { data?: unknown; error?: unknown }>): ReportDb {
  return {
    rpc(name: string) {
      const hit = answers[name] ?? { data: null, error: null };
      return Promise.resolve({
        data: hit.data ?? null,
        error: (hit.error ?? null) as { code?: string; message?: string } | null,
      });
    },
  };
}

Deno.test('a rate-limited check returns 429 and echoes Retry-After', async () => {
  const res = await publicReportRequest(
    req(),
    db({ redirect_public_report_check: { data: { retryAfter: 42 } } }),
    SECRET,
    CORS,
  );
  assertEquals(res.status, 429);
  assertEquals(res.headers.get('Retry-After'), '42');
});

Deno.test('a password-protected report asks for the password with 401', async () => {
  const res = await publicReportRequest(
    req(),
    db({ redirect_public_report_check: { data: { passwordHash: 'argon2id$whatever' } } }),
    SECRET,
    CORS,
  );
  assertEquals(res.status, 401);
  assertEquals((await res.json()).passwordRequired, true);
});

// The regression this file is really for. Before the narrowing these were raw
// property reads on `any`; a null or scalar payload threw a TypeError. `record()`
// throws its own Error instead — the assertion is that the RESPONSE is unchanged.
for (const [label, data] of [
  ['null', null],
  ['a scalar', 7],
  ['an array', []],
] as const) {
  Deno.test(`a check payload that is ${label} degrades to 503, not an unhandled throw`, async () => {
    const res = await publicReportRequest(
      req(),
      db({ redirect_public_report_check: { data } }),
      SECRET,
      CORS,
    );
    assertEquals(res.status, 503);
  });
}

Deno.test('a missing report (P0002) is 404, not 503', async () => {
  const res = await publicReportRequest(
    req(),
    db({ redirect_public_report_check: { error: { code: 'P0002' } } }),
    SECRET,
    CORS,
  );
  assertEquals(res.status, 404);
});

// Positive control. Every assertion above is a non-200, so all of them would
// still pass if the Authorization header stopped being parsed and the function
// short-circuited to 404 before ever calling `rpc`. This one proves the token
// IS read and the happy path IS reachable: the check clears, the read returns a
// well-formed report, and the body comes back as a published dashboard.
Deno.test('CONTROL: a clean check + read returns 200 with the report', async () => {
  const snapshot = '2026-10-16T00:00:00.000Z';
  const res = await publicReportRequest(
    req(),
    db({
      redirect_public_report_check: { data: { version: 'v1' } },
      redirect_public_report_read: {
        data: {
          allowIndexing: false,
          // All four keys, because `publicDateRange` only skips an EXPLICIT null —
          // an absent `earliest`/`latest` is `undefined` and throws. Second thing
          // the control caught that reading the validator had not.
          dateRange: {
            start: '2026-10-01T00:00:00.000Z',
            end: '2026-10-15T00:00:00.000Z',
            earliest: null,
            latest: null,
          },
          title: 'Campaign',
          includeConversions: false,
          linkCount: 3,
          scopeMode: 'snapshot',
          expiresAt: null,
          report: {
            snapshot,
            interval: 'day',
            // `count()` rejects a missing clicks total, so `{}` is not a valid
            // fixture here — the control caught exactly that on its first run.
            totals: { clicks: 0 },
            revenue: [],
            series: [],
            breakdowns: {},
          },
        },
      },
    }),
    SECRET,
    CORS,
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.title, 'Campaign');
  assertEquals(body.linkCount, 3);
});
