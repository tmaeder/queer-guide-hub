import * as Sentry from '@sentry/react';
import { fileError } from '@/utils/autoFileError';

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
 * Failures are reported, never swallowed — through THREE channels, because in
 * production the first two reach almost nobody:
 *
 *  1. `console.error` — `vite.config.ts` sets esbuild `drop: ['console',
 *     'debugger']` for `mode === 'production'`, so this call does not exist in
 *     a shipped bundle. Dev only.
 *  2. `Sentry.captureException` — `src/sentry.ts` never calls `Sentry.init`
 *     unless `localStorage['queer-guide-cookie-consent'].preferences.analytics
 *     === true`, and it fails closed (absent key, version mismatch or a parse
 *     throw all read as "no consent"). Without init, capture is a no-op.
 *  3. `fileError` — the `upsert_api_error` path this repo already treats as
 *     operational rather than analytics (it files window errors, unhandled
 *     rejections and 404s with no consent check). This is the only one that
 *     survives a real visitor.
 *
 * Channel 3 exists because CONTAINING the crash deleted the evidence of it.
 * Before containment the failure surfaced through `ErrorBoundary` → `fileError`,
 * which is how it was ever measured: `community_submissions` rows
 * `error_boundary:47ec0343` (/community, 2026-09-09) and `error_boundary:c9a9bb9c`
 * (/community/feed, 2026-09-08). With the throw contained and no third channel,
 * an identical visitor would now produce no record anywhere.
 */

/**
 * The channel handle is opaque here — this module never inspects it, it only
 * hands it back to `teardown`. Generic rather than a structural interface so
 * the caller's own `RealtimeChannel` type flows through untouched, and so no
 * caller is measured against a shape we invented. (An interface whose members
 * are all optional is a *weak type*: TS then rejects any object literal with no
 * property in common with it, TS2559.)
 */
export interface SubscribeSafelyOptions<TChannel> {
  /**
   * Builds AND subscribes the channel. Runs inside the guard, so a throw from
   * `.channel()`, `.on()` or `.subscribe()` is contained identically.
   */
  subscribe: () => TChannel | null | undefined;
  /** Tears the channel down. Also guarded — `removeChannel` can throw on a half-built channel. */
  teardown: (channel: TChannel) => void;
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
  // Durable, non-consent-gated record. `fileError` is itself total (its whole
  // body is a try/catch and the RPC call is fire-and-forget), but it is wrapped
  // anyway: this sits ON the degradation path, so a reporting failure must never
  // resurrect the crash the reporting exists to record.
  //
  // Volume is bounded by `fileError` itself: the fingerprint is
  // `degraded:hash(kind|name|routeTemplate|normalizedMessage)` and a
  // sessionStorage key gates one network call per fingerprint per tab, while the
  // RPC dedups across sessions and bumps `occurrence_count`. Reason and context
  // ride in the message so they separate fingerprints; nothing volatile does. A
  // visitor whose WebSocket is permanently broken therefore files at most one
  // call per (context, reason, route) per tab — two, for the two routes that use
  // this hook — however many times the effect re-runs.
  try {
    const message = error instanceof Error ? error.message : String(error);
    fileError({
      kind: 'degraded',
      error: { name: 'RealtimeDegraded', message: `${context} (${reason}): ${message}` },
      routePath: typeof window !== 'undefined' ? window.location.pathname : '/',
      extra: { subsystem: 'realtime', realtime_context: context, realtime_reason: reason },
    });
  } catch {
    /* reporting is best-effort and must not escape */
  }
}

/**
 * Subscribe to a realtime channel without ever letting a transport failure
 * escape. Returns the cleanup function to hand back from `useEffect`.
 */
export function subscribeSafely<TChannel>({
  subscribe,
  teardown,
  context,
}: SubscribeSafelyOptions<TChannel>): () => void {
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

  let channel: TChannel | null | undefined;
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
