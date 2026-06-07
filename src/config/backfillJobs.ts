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

/**
 * Global (whole-corpus) backfill sweeps for the Data Ops "Backfills" panel.
 * These run one batch per invoke (no per-id selection) and every one supports a
 * dry-run, so the panel's dry-run toggle is honest. backfill-venue-cities is
 * intentionally excluded — it has no dry_run mode.
 */
export interface GlobalBackfillJob {
  key: string;
  label: string;
  description: string;
  fn: string;
  buildBody: (opts: { dryRun: boolean }) => Record<string, unknown>;
}

export const GLOBAL_BACKFILL_JOBS: GlobalBackfillJob[] = [
  {
    key: 'geocode',
    label: 'Geocode staging rows',
    description: 'Geocode pending ingestion rows missing coordinates. One batch of 50.',
    fn: 'pipeline-geocode',
    buildBody: ({ dryRun }) => ({ batch_size: 50, dry_run: dryRun }),
  },
  {
    key: 'images-venues',
    label: 'Fetch venue images',
    description: 'Find cover images for venues that lack one. One batch of 25.',
    fn: 'fetch-images',
    buildBody: ({ dryRun }) => ({
      entity_type: 'venue',
      batchMode: true,
      batchLimit: 25,
      dry_run: dryRun,
    }),
  },
  {
    key: 'images-events',
    label: 'Fetch event images',
    description: 'Find cover images for upcoming events that lack one. One batch of 25.',
    fn: 'fetch-images',
    buildBody: ({ dryRun }) => ({
      entity_type: 'event',
      batchMode: true,
      batchLimit: 25,
      dry_run: dryRun,
    }),
  },
  {
    key: 'llm-news',
    label: 'Enrich news (geo + relevance)',
    description: 'LLM geo-tag and relevance-score news articles missing it. One batch of 20.',
    fn: 'backfill-llm-enrich',
    buildBody: ({ dryRun }) => ({ target: 'news', batch_size: 20, dry_run: dryRun }),
  },
];
