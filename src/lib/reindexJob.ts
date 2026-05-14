// Helpers for ReindexTab. Extracted from the component so they can be tested.

export interface ReindexJobLike {
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  total: number;
  processed: number;
  errors: unknown;
  started_at: string | null;
  finished_at: string | null;
}

/**
 * Format a duration between two ISO timestamps. If `end` is null, uses now()
 * (so a still-running job shows live elapsed time on each render).
 */
export function formatJobDuration(
  start: string | null,
  end: string | null,
  now: () => number = Date.now,
): string {
  if (!start) return '—';
  const t0 = new Date(start).getTime();
  if (!Number.isFinite(t0)) return '—';
  const t1 = end ? new Date(end).getTime() : now();
  const ms = Math.max(0, t1 - t0);
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

/**
 * The errors column on search_reindex_jobs is JSONB and may be returned as
 * either an array of strings, a single string, or null. Normalise to string[].
 */
export function normalizeErrors(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => (typeof v === 'string' ? v : JSON.stringify(v)));
  }
  if (typeof value === 'string') return [value];
  return [];
}

/**
 * Progress percent (0..100). Returns null when total is zero (so the UI
 * can hide the progress bar instead of showing 0%).
 */
export function jobProgressPercent(job: Pick<ReindexJobLike, 'total' | 'processed'>): number | null {
  if (job.total <= 0) return null;
  const pct = Math.min(100, Math.max(0, Math.round((job.processed / job.total) * 100)));
  return pct;
}

/**
 * Whether at least one job in the list is still in flight.
 */
export function anyJobInFlight(jobs: Array<Pick<ReindexJobLike, 'status'>>): boolean {
  return jobs.some((j) => j.status === 'running' || j.status === 'pending');
}
