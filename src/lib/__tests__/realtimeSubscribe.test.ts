/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const captureException = vi.fn();
vi.mock('@sentry/react', () => ({ captureException: (...a: unknown[]) => captureException(...a) }));

const fileError = vi.fn();
vi.mock('@/utils/autoFileError', () => ({ fileError: (...a: unknown[]) => fileError(...a) }));

import { subscribeSafely, isWebSocketAvailable } from '../realtimeSubscribe';

type FiledReport = {
  kind: string;
  error: { name: string; message: string };
  routePath: string;
  extra: Record<string, unknown>;
};

// The exact string prod reported on /community and /community/feed.
const PROD_MESSAGE =
  "WebSocket not available: Failed to construct 'WebSocket': Failed to create a WebSocket: the provided URL is invalid.";

describe('subscribeSafely', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    captureException.mockClear();
    fileError.mockReset();
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('contains a throwing subscribe instead of propagating it', () => {
    const teardown = vi.fn();
    let cleanup: (() => void) | undefined;

    expect(() => {
      cleanup = subscribeSafely({
        context: 'test',
        subscribe: () => {
          throw new Error(PROD_MESSAGE);
        },
        teardown,
      });
    }).not.toThrow();

    // A no-op cleanup, and teardown is never called for a channel that never opened.
    expect(() => cleanup?.()).not.toThrow();
    expect(teardown).not.toHaveBeenCalled();
  });

  it('reports the failure rather than swallowing it', () => {
    subscribeSafely({
      context: 'useCommunityPosts',
      subscribe: () => {
        throw new Error(PROD_MESSAGE);
      },
      teardown: vi.fn(),
    });

    expect(captureException).toHaveBeenCalledTimes(1);
    const [error, options] = captureException.mock.calls[0] as [
      Error,
      { tags: Record<string, string> },
    ];
    expect(error.message).toBe(PROD_MESSAGE);
    expect(options.tags.subsystem).toBe('realtime');
    expect(options.tags.realtime_context).toBe('useCommunityPosts');
    expect(options.tags.realtime_reason).toBe('subscribe-failed');
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('subscribes and tears down normally when the transport works', () => {
    const channel = { id: 'ch' };
    const teardown = vi.fn();
    const cleanup = subscribeSafely({
      context: 'test',
      subscribe: () => channel,
      teardown,
    });

    expect(captureException).not.toHaveBeenCalled();
    cleanup();
    expect(teardown).toHaveBeenCalledWith(channel);
  });

  it('contains a throwing teardown', () => {
    const cleanup = subscribeSafely({
      context: 'test',
      subscribe: () => ({ id: 'ch' }),
      teardown: () => {
        throw new Error('removeChannel blew up');
      },
    });

    expect(() => cleanup()).not.toThrow();
    expect(captureException).toHaveBeenCalledTimes(1);
    const [, options] = captureException.mock.calls[0] as [
      Error,
      { tags: Record<string, string> },
    ];
    expect(options.tags.realtime_reason).toBe('teardown-failed');
  });

  it('never attempts a subscription when WebSocket is unavailable', () => {
    const original = globalThis.WebSocket;
    // @ts-expect-error - deliberately removing the global for this assertion
    delete globalThis.WebSocket;
    try {
      expect(isWebSocketAvailable()).toBe(false);
      const subscribe = vi.fn();
      const cleanup = subscribeSafely({ context: 'test', subscribe, teardown: vi.fn() });
      expect(subscribe).not.toHaveBeenCalled();
      expect(() => cleanup()).not.toThrow();
      // Skipping is still reported — "no realtime here" must not be silent.
      const [, options] = captureException.mock.calls[0] as [
        Error,
        { tags: Record<string, string> },
      ];
      expect(options.tags.realtime_reason).toBe('no-websocket');
    } finally {
      globalThis.WebSocket = original;
    }
  });
});

/**
 * The durable leg. Sentry is consent-gated and fails closed, and `console` is
 * stripped from production bundles by esbuild `drop`, so `fileError` is the only
 * one of the three reporting channels a real visitor actually reaches.
 */
describe('subscribeSafely → fileError (the channel that survives in production)', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    captureException.mockClear();
    fileError.mockReset();
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  // POSITIVE CONTROL. Every assertion below is of the form "a failure files a
  // report"; each would also pass if `subscribeSafely` filed on *every* call, or
  // if the mock were left dirty from a previous test. This pins the other side:
  // a working transport files nothing at all, so a passing suite cannot mean the
  // reporting call is unconditional, and the assertions that follow are only
  // satisfiable by the failure path actually running.
  it('files NOTHING when the transport works', () => {
    const cleanup = subscribeSafely({
      context: 'useCommunityPosts',
      subscribe: () => ({ id: 'ch' }),
      teardown: vi.fn(),
    });
    cleanup();

    expect(fileError).not.toHaveBeenCalled();
  });

  it('files a durable report when a subscribe throws', () => {
    subscribeSafely({
      context: 'useCommunityPosts',
      subscribe: () => {
        throw new Error(PROD_MESSAGE);
      },
      teardown: vi.fn(),
    });

    expect(fileError).toHaveBeenCalledTimes(1);
    const [report] = fileError.mock.calls[0] as [FiledReport];

    // The kind the board files under. Not 'error_boundary': the page did NOT
    // crash, and conflating a contained degradation with a crash would make the
    // crash count wrong in the opposite direction.
    expect(report.kind).toBe('degraded');
    expect(report.error.name).toBe('RealtimeDegraded');
    // Context and reason ride in the message, which `fileError` hashes into the
    // fingerprint — so subscribe-failed and teardown-failed cannot collapse into
    // one board row.
    expect(report.error.message).toContain('useCommunityPosts');
    expect(report.error.message).toContain('subscribe-failed');
    expect(report.error.message).toContain(PROD_MESSAGE);
    expect(report.extra).toMatchObject({
      subsystem: 'realtime',
      realtime_context: 'useCommunityPosts',
      realtime_reason: 'subscribe-failed',
    });
  });

  it('files a durable report when the environment has no WebSocket at all', () => {
    const original = globalThis.WebSocket;
    // @ts-expect-error - deliberately removing the global for this assertion
    delete globalThis.WebSocket;
    try {
      subscribeSafely({ context: 'useCommunityPosts', subscribe: vi.fn(), teardown: vi.fn() });
    } finally {
      globalThis.WebSocket = original;
    }

    expect(fileError).toHaveBeenCalledTimes(1);
    const [report] = fileError.mock.calls[0] as [FiledReport];
    expect(report.kind).toBe('degraded');
    expect(report.extra.realtime_reason).toBe('no-websocket');
  });

  it('gives each reason its own message so fingerprints do not collapse', () => {
    const cleanup = subscribeSafely({
      context: 'useCommunityPosts',
      subscribe: () => ({ id: 'ch' }),
      teardown: () => {
        throw new Error('removeChannel blew up');
      },
    });
    cleanup();

    const [report] = fileError.mock.calls[0] as [FiledReport];
    expect(report.error.message).toContain('teardown-failed');
    expect(report.extra.realtime_reason).toBe('teardown-failed');
  });

  // This sits ON the degradation path. If filing a report could throw, the
  // reporting added to record a contained crash would itself re-raise one — the
  // exact failure #3558 exists to prevent, reintroduced by its own observability.
  it('does not propagate a reporting failure', () => {
    fileError.mockImplementation(() => {
      throw new Error('reporting backend is down');
    });

    expect(() =>
      subscribeSafely({
        context: 'useCommunityPosts',
        subscribe: () => {
          throw new Error(PROD_MESSAGE);
        },
        teardown: vi.fn(),
      }),
    ).not.toThrow();

    // And it really did attempt to file — otherwise this passes vacuously.
    expect(fileError).toHaveBeenCalledTimes(1);
  });

  it('does not propagate a reporting failure from the teardown path either', () => {
    const cleanup = subscribeSafely({
      context: 'useCommunityPosts',
      subscribe: () => ({ id: 'ch' }),
      teardown: () => {
        throw new Error('removeChannel blew up');
      },
    });

    fileError.mockImplementation(() => {
      throw new Error('reporting backend is down');
    });

    expect(() => cleanup()).not.toThrow();
    expect(fileError).toHaveBeenCalledTimes(1);
  });
});
