import { supabase } from '@/integrations/supabase/client';

/**
 * Fire-and-forget telemetry insert that cannot fail silently.
 *
 * THE BUG THIS EXISTS FOR: `supabase.from(...).insert(...)` **resolves** with
 * `{ error }` rather than throwing. Every telemetry writer in this codebase
 * wrapped it in `try { await ... } catch {}` — which catches nothing an insert
 * rejection produces. A CHECK violation, an RLS refusal or a missing column was
 * therefore discarded without even a `console.debug`, and the resulting absence
 * of rows is indistinguishable from users not doing the thing.
 *
 * That is not hypothetical. `docs/audits/2026-08-21-signup-consent-gap.md`
 * records `signup_validation_error` sitting in the TypeScript union and not in
 * the DB CHECK: Postgres rejected every insert, the writer swallowed it, and
 * the funnel's "3,675 views, 4 completions, ZERO validation errors" was read as
 * a finding about users. It was a finding about a row that could not be written.
 *
 * So: still never throws to the caller (analytics must not break the UI), but
 * a rejection is now reported twice — to the console for local work, and to
 * Sentry for production, where nobody is watching a console. Sentry is already
 * consent-gated and already initialized in `src/sentry.ts`, so this adds no new
 * data flow; the payload is the table name and the Postgres error code, never
 * the row.
 */

type TelemetryRow = Record<string, unknown>;

/** Reported so a rejection is visible without importing Sentry eagerly. */
async function report(table: string, code: string | undefined, message: string): Promise<void> {
  console.error(`[telemetry] insert into ${table} rejected: ${code ?? '?'} ${message}`);
  try {
    // Dynamic import: this module is pulled into route chunks that do not
    // otherwise need the Sentry SDK, and telemetry must not enlarge them.
    const Sentry = await import('@sentry/react');
    Sentry.captureMessage('telemetry_insert_rejected', {
      level: 'warning',
      extra: { table, code, message },
    });
  } catch {
    // Sentry absent or not consented — the console line above still stands.
  }
}

/**
 * Insert a telemetry row, reporting a rejection instead of swallowing it.
 * Resolves `true` when the row was written.
 */
export async function insertTelemetry(table: string, row: TelemetryRow): Promise<boolean> {
  try {
    // @ts-expect-error — `table` is a runtime string; the generated Supabase
    // types cannot narrow it, and every call site passes a literal that the
    // drift tests check against the DB constraints instead.
    const { error } = await supabase.from(table).insert(row);
    if (error) {
      void report(table, error.code, error.message);
      return false;
    }
    return true;
  } catch (err) {
    // A thrown error here is a transport failure (offline, CORS, aborted),
    // not a rejected row. Worth a console line, not a Sentry event — an
    // offline user is not a defect.
    console.debug(`[telemetry] insert into ${table} failed`, err);
    return false;
  }
}
