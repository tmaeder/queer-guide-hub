/**
 * "Showing 6 of 31,659" for a capped preview of a larger set.
 *
 * The tag page printed the total ("Tagged on 32423", sidebar "31659 venues")
 * beside a preview that said "20 tagged", which reads as a contradiction. The
 * preview line states both numbers, from one source, formatted for the locale.
 * The total is never smaller than what is shown: counts and the preview come
 * from different queries, and a stale count must not read "Showing 6 of 4".
 */
export interface PreviewCount {
  shown: number;
  total: number;
  /** True when the preview is a subset and a full-results link is warranted. */
  partial: boolean;
}

export function previewCount(shown: number, total: number | null | undefined): PreviewCount {
  const s = Math.max(0, shown);
  const t = Math.max(s, total ?? 0);
  return { shown: s, total: t, partial: t > s };
}

export function formatCount(value: number, locale?: string): string {
  try {
    return new Intl.NumberFormat(locale || undefined).format(value);
  } catch {
    return new Intl.NumberFormat('en').format(value);
  }
}
