/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const captureException = vi.fn();
vi.mock('@sentry/react', () => ({ captureException: (...a: unknown[]) => captureException(...a) }));

import { subscribeSafely, isWebSocketAvailable } from '../realtimeSubscribe';

// The exact string prod reported on /community and /community/feed.
const PROD_MESSAGE =
  "WebSocket not available: Failed to construct 'WebSocket': Failed to create a WebSocket: the provided URL is invalid.";

describe('subscribeSafely', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    captureException.mockClear();
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
