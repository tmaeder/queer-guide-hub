/**
 * Backfill job registry — turns supervised maintenance scripts into one-click,
 * selection-scoped admin actions. Surfaced in the data-table bulk bar via
 * DataTableBackfillActions when a list's config declares `backfillJobs`.
 *
 * Only edge functions that accept a per-id list belong here (the action runs on
 * the rows the operator selected). Whole-corpus batch sweeps (geocode,
 * fetch-images, llm-enrich) are NOT id-scoped — those belong in a global
 * Data Ops panel, not a per-selection bulk action.
 */
export interface BackfillJob {
  key: string;
  /** Button / menu label. */
  label: string;
  /** Edge function to invoke (admin-authed). */
  fn: string;
  /** Build the invoke body from the selected row ids. */
  buildBody: (ids: string[]) => Record<string, unknown>;
  /** Optional window.confirm copy before running. */
  confirm?: string;
}

/** Keyed by the table the list edits. */
export const BACKFILL_JOBS: Record<string, BackfillJob[]> = {
  events: [
    {
      key: 'liveness',
      label: 'Re-check liveness',
      fn: 'event-liveness-checker',
      buildBody: (ids) => ({ event_ids: ids, dry_run: false }),
    },
  ],
};

export function backfillJobsFor(table: string): BackfillJob[] {
  return BACKFILL_JOBS[table] ?? [];
}
