/**
 * Minimal concurrency-limited mapper. Runs up to `limit` async tasks in
 * parallel, preserves input order in the output, and surfaces rejections
 * per-item so a single failure doesn't abort the batch.
 *
 * Deliberately no external dependency — p-limit would work too but a ~20-line
 * utility keeps the scraper lean.
 */
export async function mapWithLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<Array<{ ok: true; value: R } | { ok: false; error: Error }>> {
  const results: Array<{ ok: true; value: R } | { ok: false; error: Error }> = new Array(items.length);
  let next = 0;
  const n = Math.max(1, Math.min(limit, items.length));

  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      try {
        const value = await fn(items[i], i);
        results[i] = { ok: true, value };
      } catch (err) {
        results[i] = { ok: false, error: err as Error };
      }
    }
  }

  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}
