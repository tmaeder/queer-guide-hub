import { useMeta, type MetaOptions } from './useMeta';

export type DetailMetaStatus = 'loading' | 'notFound' | 'ready';

export interface DetailMetaOptions extends Omit<MetaOptions, 'noIndex'> {
  /** Where the entity fetch currently stands. */
  status: DetailMetaStatus;
  /** Title shown while `status === 'notFound'`. Falls back to `title` if omitted. */
  notFoundTitle?: string;
  /**
   * Extra suppression for a `ready` entity that still should not be indexed
   * (adult-gated, `seo_indexable === false`, safety-gated, …). Ignored on
   * `loading`/`notFound`, which are always suppressed regardless of this flag.
   */
  noIndex?: boolean;
}

/**
 * `useMeta` wrapper for single-entity pages (`/tags/:slug`, `/events/:slug`, …)
 * that makes "no such entity" noindex by construction. Every detail page used
 * to hand-roll this branch, and the class of bug this replaces is a dead slug
 * that ships an indexable `<title>Loading</title>` (or the default title, or a
 * stale one) with no robots tag — a soft 404 that search engines crawl and
 * index like a real page (see TagDetail's fix and CLAUDE.md's
 * `soft_404_returns_http_200` history). `status` makes the omission a type
 * error instead of a silent one: there is no path from here to `useMeta` that
 * skips deciding what "not found" means for THIS page's fetch.
 *
 * Calls `useMeta` exactly once per render (never inside a conditional) so this
 * stays a single valid hook call regardless of which status branch applies.
 */
export function useDetailMeta({
  status,
  notFoundTitle,
  noIndex,
  title,
  ...rest
}: DetailMetaOptions): void {
  const options: MetaOptions =
    status === 'notFound'
      ? { title: notFoundTitle ?? title, noIndex: true }
      : status === 'loading'
        ? { title }
        : { title, ...rest, noIndex };
  useMeta(options);
}
