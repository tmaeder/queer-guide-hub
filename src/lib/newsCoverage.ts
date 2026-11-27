/**
 * Coverage language and de-duplication for grouped news stories.
 *
 * A story cluster is a set of feed rows, not a set of independent reports.
 * The DB's `corroboration_count` counts distinct FEEDS, so an aggregator feed
 * (Google News) re-listing a Washington Blade piece counts twice. Nothing here
 * claims verification or independence: we say how many articles and how many
 * publishers, and we mark what the metadata can actually show (an aggregator
 * listing of a report we already have, an identical headline from another
 * publisher).
 */
import { isAggregatorUrl, resolvePublisherName } from './publisherName';

export interface CoverageArticleInput {
  id: string;
  title: string;
  url: string;
  published_at: string | null;
  publisher_name?: string | null;
  canonical_url?: string | null;
  fingerprint?: string | null;
}

export interface CoverageItem<T extends CoverageArticleInput = CoverageArticleInput> {
  article: T;
  /** Publisher to show: the outlet, never the aggregator feed when the title names the outlet. */
  publisher: string;
  /** Aggregator feeds (by name) that also listed this same report. */
  alsoListedBy: string[];
  /** Earlier publisher that ran the identical headline, when this is a later copy. */
  sameHeadlineAs: string | null;
}

/** Lower-case, alphanumerics only — "LGBTQ+ rights" and "LGBTQ rights" compare equal. */
export function normalizeHeadline(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** URL without query, fragment, protocol, `www.` or trailing slash. */
export function normalizeArticleUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.replace(/&#0?38;/g, '&'));
    return (u.hostname.replace(/^www\./, '') + u.pathname.replace(/\/+$/, '')).toLowerCase();
  } catch {
    return null;
  }
}

/** Aggregator headlines end with " - Publisher" (Google News convention). */
function splitAggregatorTitle(title: string): { headline: string; outlet: string | null } {
  const m = title.match(/^(.*\S)\s+[-–|]\s+([^-–|]{2,60})$/);
  return m ? { headline: m[1], outlet: m[2].trim() } : { headline: title, outlet: null };
}

const key = (s: string) => normalizeHeadline(s);

/**
 * Order oldest-first, collapse rows that are the same report, and annotate the
 * relationships the metadata supports. Duplicates are: the same canonical or
 * article URL, the same fingerprint, or the same publisher with the same
 * headline (including an aggregator listing whose title names that publisher).
 */
export function buildCoverage<T extends CoverageArticleInput>(articles: T[]): CoverageItem<T>[] {
  const sorted = [...articles].sort(
    (a, b) => Date.parse(a.published_at ?? '') - Date.parse(b.published_at ?? '') || 0,
  );
  const items: CoverageItem<T>[] = [];
  const seenUrl = new Map<string, CoverageItem<T>>();
  const seenFp = new Map<string, CoverageItem<T>>();
  const seenPubHeadline = new Map<string, CoverageItem<T>>();
  const firstByHeadline = new Map<string, CoverageItem<T>>();
  const pending: { article: T; outlet: string; headline: string; feed: string }[] = [];

  for (const article of sorted) {
    const aggregated = isAggregatorUrl(article.url);
    const feed = (article.publisher_name ?? '').trim();
    if (aggregated) {
      const { headline, outlet } = splitAggregatorTitle(article.title);
      pending.push({ article, outlet: outlet ?? feed, headline, feed });
      continue;
    }
    const publisher = resolvePublisherName({ publisherName: feed, url: article.url });
    const urlKey = normalizeArticleUrl(article.canonical_url) ?? normalizeArticleUrl(article.url);
    const headline = key(article.title);
    const dupe =
      (urlKey && seenUrl.get(urlKey)) ||
      (article.fingerprint && seenFp.get(article.fingerprint)) ||
      seenPubHeadline.get(`${key(publisher)}|${headline}`);
    if (dupe) continue;
    const earlier = firstByHeadline.get(headline);
    const item: CoverageItem<T> = {
      article,
      publisher,
      alsoListedBy: [],
      sameHeadlineAs:
        earlier && key(earlier.publisher) !== key(publisher) ? earlier.publisher : null,
    };
    items.push(item);
    if (urlKey) seenUrl.set(urlKey, item);
    if (article.fingerprint) seenFp.set(article.fingerprint, item);
    seenPubHeadline.set(`${key(publisher)}|${headline}`, item);
    if (!earlier) firstByHeadline.set(headline, item);
  }

  // Aggregator rows: fold into the direct report they re-list, else keep them
  // as their own row named after the outlet the headline credits.
  for (const p of pending) {
    const match = seenPubHeadline.get(`${key(p.outlet)}|${key(p.headline)}`);
    if (match) {
      if (p.feed && !match.alsoListedBy.includes(p.feed)) match.alsoListedBy.push(p.feed);
      continue;
    }
    const item: CoverageItem<T> = {
      article: p.article,
      publisher: p.outlet,
      alsoListedBy: [],
      sameHeadlineAs: null,
    };
    items.push(item);
    seenPubHeadline.set(`${key(p.outlet)}|${key(p.headline)}`, item);
  }

  return items.sort(
    (a, b) =>
      Date.parse(a.article.published_at ?? '') - Date.parse(b.article.published_at ?? '') || 0,
  );
}

/** Distinct publishers among coverage items (by normalised name). */
export function countPublishers(items: Pick<CoverageItem, 'publisher'>[]): number {
  return new Set(items.map((i) => key(i.publisher)).filter(Boolean)).size;
}

/**
 * Factual coverage label. Never "corroborated" / "verified": a list of
 * similar articles does not establish either.
 */
export function coverageLabel(
  articleCount: number,
  publisherCount: number,
): { key: string; defaultValue: string; count: number; publishers: number } {
  if (publisherCount > 1 && publisherCount < articleCount) {
    return {
      key: 'news.coverageArticlesPublishers',
      defaultValue: 'Coverage in {{count}} articles from {{publishers}} publishers',
      count: articleCount,
      publishers: publisherCount,
    };
  }
  if (publisherCount > 1) {
    return {
      key: 'news.coverageFromPublishers',
      defaultValue: 'Coverage from {{publishers}} publishers',
      count: articleCount,
      publishers: publisherCount,
    };
  }
  return {
    key: 'news.coverageArticles',
    defaultValue: 'Coverage in {{count}} articles',
    count: articleCount,
    publishers: publisherCount,
  };
}
