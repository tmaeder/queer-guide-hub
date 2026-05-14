/**
 * Shared Sentry helper for Supabase edge functions.
 *
 * No-ops when `SENTRY_DSN` is not set (for local dev / new envs).
 * In prod, set the DSN once via Supabase dashboard or CLI:
 *
 *   supabase secrets set SENTRY_DSN=<dsn>
 *
 * Usage in a function:
 *
 *   import { initSentry, captureError, withSentry } from "../_shared/sentry.ts";
 *
 *   initSentry("my-function-name");        // optional, called from withSentry
 *
 *   serve((req) =>
 *     withSentry("my-function-name", async () => {
 *       // ...handler logic
 *     })
 *   );
 *
 * Or for finer control:
 *
 *   try {
 *     // ...
 *   } catch (err) {
 *     captureError(err, { context: "post-fetch" });
 *     throw err;
 *   }
 */

import * as Sentry from "npm:@sentry/deno@^8";

let initialized = false;

/**
 * Initialize Sentry once per process. Safe to call repeatedly.
 * No-op when SENTRY_DSN env var is unset.
 */
export function initSentry(functionName: string): void {
  if (initialized) return;
  const dsn = Deno.env.get("SENTRY_DSN");
  if (!dsn) return;

  try {
    Sentry.init({
      dsn,
      environment: Deno.env.get("SENTRY_ENVIRONMENT") ?? "production",
      release: Deno.env.get("SENTRY_RELEASE"),
      // Edge functions are short-lived; tracing adds latency we don't need yet.
      tracesSampleRate: 0,
      // Sample 100% of error events but use beforeSend filters below.
      sampleRate: 1,
      // Tag every event with which function emitted it.
      initialScope: {
        tags: { edge_function: functionName, runtime: "deno" },
      },
      // Filter expected/noisy errors before they hit the project.
      beforeSend(event, hint) {
        const message =
          (hint?.originalException as Error | undefined)?.message ?? "";
        // Drop known abort/cancellation noise.
        if (
          message.includes("aborted") ||
          message.includes("AbortError") ||
          message.includes("client closed connection")
        ) {
          return null;
        }
        return event;
      },
    });
    initialized = true;
  } catch {
    // Sentry init failed (bad DSN, network); swallow so the function still runs.
  }
}

/**
 * Capture an error with optional context. Safe to call before/without initSentry.
 */
export function captureError(
  err: unknown,
  context?: Record<string, unknown>,
): void {
  if (!initialized) return;
  try {
    if (context) {
      Sentry.withScope((scope) => {
        scope.setContext("custom", context);
        Sentry.captureException(err);
      });
    } else {
      Sentry.captureException(err);
    }
  } catch {
    // never let Sentry break a request
  }
}

/**
 * Wrap a serve handler so any thrown error gets reported and re-thrown.
 * Initializes Sentry on first call.
 */
export async function withSentry<T>(
  functionName: string,
  handler: () => Promise<T>,
): Promise<T> {
  initSentry(functionName);
  try {
    return await handler();
  } catch (err) {
    captureError(err, { function: functionName });
    throw err;
  }
}
