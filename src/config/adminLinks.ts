/**
 * adminLink — canonical deep-link builder for the admin console.
 * Keeps the `?status / filter / q / sort / tab` query-param vocabulary in one place
 * so cockpit widgets, the command palette, and cross-page drill-downs stay consistent.
 */

export type ContentFilters = {
  status?: string;
  filter?: string;
  q?: string;
  sort?: string;
  tab?: string;
  from?: string;
};

function withParams(base: string, params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') search.set(k, v);
  }
  const qs = search.toString();
  return qs ? `${base}?${qs}` : base;
}

export const adminLink = {
  /** A content list page, optionally pre-filtered. `type` is the route segment (e.g. 'venues', 'news_articles'). */
  content: (type: string, filters: ContentFilters = {}) =>
    withParams(`/admin/content/${type}`, filters),

  /** The quality tab of an entity page. */
  quality: (type: string) => withParams(`/admin/content/${type}`, { tab: 'quality' }),

  /** Unified inbox (absorbed /admin/review), optionally scoped to a queue tab. */
  review: (tab?: string) => withParams('/admin/inbox', { tab }),

  /** Feedback board scoped to overdue items. */
  reviewOverdue: () => withParams('/admin/feedback', { status: 'overdue' }),

  /** Duplicate clusters review. */
  duplicates: () => '/admin/duplicates',

  /** Automation registry, optionally focused on a slug. */
  automation: (slug?: string) => withParams('/admin/automation', { filter: slug }),
} as const;
