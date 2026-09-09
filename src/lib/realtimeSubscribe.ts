import * as Sentry from '@sentry/react';

/**
 * Containment for Supabase Realtime.
 *
 * `RealtimeChannel.subscribe()` opens the shared socket SYNCHRONOUSLY, and
 * `RealtimeClient.connect()` rethrows anything the WebSocket constructor throws
 * as `WebSocket not available: <message>`. Called from a `useEffect` body that
 * throw propagates straight to the nearest React error boundary, so a client
 * that cannot open a socket at all loses the whole route rather than just the
 * live updates.
 *
 * Measured on prod (`community_submissions`, content_type='api_error'):
 * `/community` 2026-09-09 and `/community/feed` 2026-09-08 both died with
 * "WebSocket not available: Failed to construct 'WebSocket': Failed to create a
 * WebSocket: the provided URL is invalid." — a message no Chromium build emits
 * (real Chromium says "The URL '<url>' is invalid." and names the URL), i.e. a
 * replaced `WebSocket` global in the visitor's environment. Nothing we ship can
 * make that environment work; what we control is that live refresh is a
 * nicety and its transport must never be load-bearing for rendering.
 *
 * Failures are reported, never swallowed: Sentry gets the exception tagged
 * `subsystem: 'realtime'` and the console gets it in dev.
 */

/** Minimal shape we need — avoids importing realtime-js types into every caller. */
export interface SafeChannel {
  unsubscribe?: () => unknown;
}

export interface SubscribeSafelyOptions {
  /**
   * Builds AND subscribes the channel. Runs inside the guard, so a throw from
   * `.channel()`, `.on()` or `.subscribe()` is contained identically.
   */
  subscribe: () => SafeChannel | null | undefined;
  /** Tears the channel down. Also guarded — `removeChannel` can throw on a half-built channel. */
  teardown: (channel: SafeChannel) => void;
  /** Identifies the call site in the Sentry report. */
  context: string;
}

/** True when this runtime can construct a WebSocket at all. */
export function isWebSocketAvailable(): boolean {
  return typeof WebSocket === 'function';
}

function report(error: unknown, context: string, reason: string) {
  // Never throw from error reporting.
  try {
    Sentry.captureException(error, {
      level: 'warning',
      tags: { subsystem: 'realtime', realtime_context: context, realtime_reason: reason },
    });
  } catch {
    /* reporting is best-effort */
  }
  try {
    console.error(`[realtime] ${context} degraded to non-live (${reason}):`, error);
  } catch {
    /* console can be absent in exotic runtimes */
  }
}

/**
 * Subscribe to a realtime channel without ever letting a transport failure
 * escape. Returns the cleanup function to hand back from `useEffect`.
 */
export function subscribeSafely({
  subscribe,
  teardown,
  context,
}: SubscribeSafelyOptions): () => void {
  if (!isWebSocketAvailable()) {
    // Provably cannot work — don't construct a channel whose subscribe() would
    // throw. Still reported, so "no realtime here" is visible rather than silent.
    report(
      new Error('WebSocket is not available in this environment'),
      context,
      'no-websocket',
    );
    return () => {};
  }

  let channel: SafeChannel | null | undefined;
  try {
    channel = subscribe();
  } catch (error) {
    report(error, context, 'subscribe-failed');
    return () => {};
  }

  if (!channel) return () => {};

  const opened = channel;
  return () => {
    try {
      teardown(opened);
    } catch (error) {
      report(error, context, 'teardown-failed');
    }
  };
}
