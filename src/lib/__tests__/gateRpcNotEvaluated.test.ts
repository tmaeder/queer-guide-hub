import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error - plain .mjs helper, no types; exercised behaviourally on purpose.
import { callRpc, notEvaluated, stallReason, NO_RESPONSE } from '../../../scripts/lib/gate-rpc.mjs';

/**
 * Behavioural, not source-text. A source assertion cannot tell a live guard
 * from a dead one — the rule this repo has recorded repeatedly — and the whole
 * defect being fixed here is a branch that was present in the file and
 * structurally unreachable at run time.
 *
 * The condition: a gate script has three outcomes and only two are about the
 * gate — passed, breached, or NEVER EVALUATED. `fetch` THROWS on a transport
 * stall rather than returning a response, so a retry gated on reading `57014`
 * out of a response body can never see it. Measured 2026-10-14 on #4404's head:
 * two different gate scripts in two different jobs both died at exactly five
 * minutes (undici's headers timeout) on their first RPC call, four seconds
 * apart, on a documentation-only diff.
 */
describe('scripts/lib/gate-rpc.mjs', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  const res = (init: {
    ok: boolean;
    status: number;
    text?: () => Promise<string>;
    json?: () => Promise<unknown>;
  }) => init as unknown as Response;

  it('does not throw when fetch throws, and reports no HTTP response', async () => {
    const err = Object.assign(new TypeError('fetch failed'), {
      cause: { code: 'UND_ERR_HEADERS_TIMEOUT' },
    });
    globalThis.fetch = vi.fn().mockRejectedValue(err);

    const r = await callRpc('https://example.invalid/rest/v1/rpc/x', { method: 'POST' });

    expect(r.ok).toBe(false);
    expect(r.status).toBe(NO_RESPONSE);
    // The cause has to survive into the log, or the run says "it failed" and
    // names nothing — the #4275 lesson, one layer lower.
    expect(r.body).toContain('UND_ERR_HEADERS_TIMEOUT');
    expect(r.data).toBeNull();
  });

  it('classifies a fetch throw as NOT EVALUATED — the branch that was unreachable', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    const r = await callRpc('https://example.invalid/x', {});
    expect(notEvaluated(r)).toBe(true);
    expect(stallReason(r)).toBe('no HTTP response (transport stall)');
  });

  it('still classifies a 57014 body as NOT EVALUATED', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      res({
        ok: false,
        status: 500,
        text: async () => '{"code":"57014","message":"canceling statement"}',
      }),
    );
    const r = await callRpc('https://example.invalid/x', {});
    expect(notEvaluated(r)).toBe(true);
    expect(stallReason(r)).toBe('Postgres statement_timeout (57014)');
  });

  it('classifies a 503 PGRST002 as NOT EVALUATED', async () => {
    // Measured 2026-10-17: PostgREST answers this when it cannot reach
    // Postgres at all, so it never loaded the schema to route the call, let
    // alone ran the gate. Before this arm existed it failed `No API-role
    // writes on SECURITY DEFINER views` on #4470 during a saturation stall —
    // reporting a security gate that never ran as a security FAILURE.
    globalThis.fetch = vi.fn().mockResolvedValue(
      res({
        ok: false,
        status: 503,
        text: async () =>
          '{"code":"PGRST002","message":"Could not query the database for the schema cache. Retrying."}',
      }),
    );
    const r = await callRpc('https://example.invalid/x', {});
    expect(notEvaluated(r)).toBe(true);
    expect(stallReason(r)).toBe('PostgREST could not reach Postgres (PGRST002)');
  });

  it('does NOT widen to a bare 503 carrying some other body', async () => {
    // The arm matches the PGRST002 CODE, not the status. A 503 that is not
    // PostgREST declining to serve is the server answering, and retrying it is
    // how a genuine breach gets retried into silence.
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(res({ ok: false, status: 503, text: async () => 'upstream unavailable' }));
    const r = await callRpc('https://example.invalid/x', {});
    expect(notEvaluated(r)).toBe(false);
    expect(stallReason(r)).toBeNull();
  });

  it('classifies a Cloudflare 522 as NOT EVALUATED', async () => {
    // Measured 2026-10-17: `release_gate_checks` came back
    //   HTTP 522: <!DOCTYPE html>…
    // during a saturation window (35 active backends). It matched NO other arm —
    // real status so not NO_RESPONSE, Cloudflare HTML so neither PGRST002 nor
    // 57014 — fell through to "the server answered", and hard-failed with no
    // retry on a PR whose diff could not affect it.
    globalThis.fetch = vi.fn().mockResolvedValue(
      res({
        ok: false,
        status: 522,
        text: async () =>
          '<!DOCTYPE html><html><head><title>522 Connection timed out</title></head></html>',
      }),
    );
    const r = await callRpc('https://example.invalid/x', {});
    expect(notEvaluated(r)).toBe(true);
    expect(stallReason(r)).toBe('Cloudflare could not reach the origin (HTTP 522)');
  });

  it('covers the whole Cloudflare origin range, and nothing either side of it', async () => {
    // 520-527 is safe precisely because PostgREST cannot produce it. 519 and 528
    // are not Cloudflare origin errors, so they must stay "the server answered".
    for (const status of [520, 521, 522, 523, 524, 525, 526, 527]) {
      globalThis.fetch = vi
        .fn()
        .mockResolvedValue(res({ ok: false, status, text: async () => 'cf html' }));
      const r = await callRpc('https://example.invalid/x', {});
      expect(notEvaluated(r), `HTTP ${status} must be a non-evaluation`).toBe(true);
    }
    for (const status of [519, 528]) {
      globalThis.fetch = vi
        .fn()
        .mockResolvedValue(res({ ok: false, status, text: async () => 'something else' }));
      const r = await callRpc('https://example.invalid/x', {});
      expect(notEvaluated(r), `HTTP ${status} must NOT be a non-evaluation`).toBe(false);
    }
  });

  it('does NOT widen to a bare 500, which is how 57014 itself arrives', async () => {
    // THE BOUND THAT MATTERS. A Postgres statement_timeout is delivered as HTTP
    // 500 with the code in the body, so "any 5xx is a non-evaluation" would
    // retry a genuine breach into silence. A 500 naming a real error is the
    // server answering.
    globalThis.fetch = vi.fn().mockResolvedValue(
      res({
        ok: false,
        status: 500,
        text: async () => '{"code":"P0001","message":"CRITICAL gate breached"}',
      }),
    );
    const r = await callRpc('https://example.invalid/x', {});
    expect(notEvaluated(r)).toBe(false);
    expect(stallReason(r)).toBeNull();
  });

  it('names the four non-evaluations APART, so a log says which happened', async () => {
    // They need different fixes — the network, the query, PostgREST's link to
    // Postgres, or the CDN's link to the origin — so collapsing them loses the
    // only actionable half.
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    const transport = await callRpc('https://example.invalid/x', {});
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(res({ ok: false, status: 500, text: async () => '57014' }));
    const timeout = await callRpc('https://example.invalid/x', {});
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(res({ ok: false, status: 503, text: async () => 'PGRST002' }));
    const schema = await callRpc('https://example.invalid/x', {});
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(res({ ok: false, status: 522, text: async () => 'cf html' }));
    const cdn = await callRpc('https://example.invalid/x', {});
    const reasons = [
      stallReason(transport),
      stallReason(timeout),
      stallReason(schema),
      stallReason(cdn),
    ];
    expect(new Set(reasons).size, `reasons collapsed: ${reasons.join(' | ')}`).toBe(4);
  });

  it('does NOT treat a real server answer as a non-evaluation', async () => {
    // The narrowness is the point: retrying any failure would retry a genuine
    // CRITICAL gate breach into silence.
    for (const [status, text] of [
      [403, 'permission denied for function'],
      [404, '{"code":"PGRST202"}'],
      [500, '{"code":"42883","message":"function does not exist"}'],
    ] as const) {
      globalThis.fetch = vi
        .fn()
        .mockResolvedValue(res({ ok: false, status, text: async () => text }));
      const r = await callRpc('https://example.invalid/x', {});
      expect(notEvaluated(r), `HTTP ${status} must fail at once`).toBe(false);
      expect(stallReason(r)).toBeNull();
    }
  });

  it('a successful call is never a non-evaluation and carries parsed data', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      res({
        ok: true,
        status: 200,
        json: async () => [{ gate: 'g', severity: 'critical', failing: 0 }],
      }),
    );
    const r = await callRpc('https://example.invalid/x', {});
    expect(r.ok).toBe(true);
    expect(notEvaluated(r)).toBe(false);
    expect(r.data).toEqual([{ gate: 'g', severity: 'critical', failing: 0 }]);
    expect(r.body).toBeNull();
  });

  it('a 2xx whose body will not parse is not evaluated, and does not claim to be a transport stall', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      res({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError('Unexpected token <');
        },
      }),
    );
    const r = await callRpc('https://example.invalid/x', {});
    expect(r.ok).toBe(false);
    // Real status preserved, so the log does not misreport the network.
    expect(r.status).toBe(200);
    expect(r.body).toContain('did not parse as JSON');
    expect(r.body).not.toContain('before any HTTP response');
  });

  it('an unreadable error body keeps the status rather than losing both', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      res({
        ok: false,
        status: 502,
        text: async () => {
          throw new Error('aborted');
        },
      }),
    );
    const r = await callRpc('https://example.invalid/x', {});
    expect(r.status).toBe(502);
    expect(r.body).toContain('unreadable');
    expect(notEvaluated(r)).toBe(false);
  });

  it('notEvaluated is safe on a null/undefined result', () => {
    expect(notEvaluated(null)).toBe(false);
    expect(notEvaluated(undefined)).toBe(false);
  });
});
