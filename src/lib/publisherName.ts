// Resolve the real news-site name to display, never the generic adapter label "rss-news".
//
// The DB backfill + trg_set_publisher_name keep news_articles.publisher_name clean, but this is a
// defense-in-depth guard so a generic label can never reach the UI even if the pipeline regresses.
// Mirrors the SQL derive_publisher_from_url fallback (strip www., title-case first host segment).

const GENERIC_SOURCE_LABELS = new Set(['rss-news', 'rss_news', 'rss']);

const isGeneric = (v?: string | null): boolean =>
  !v || GENERIC_SOURCE_LABELS.has(v.trim().toLowerCase());

// Hosts that aggregate/redirect and cannot identify a real outlet — skip host derivation for these.
const AGGREGATOR_HOSTS = [
  'news.google.com',
  'google.com',
  'newsdata.io',
  'gnews.io',
  'newsapi.org',
  'thenewsapi.com',
  'headtopics.com',
  'msn.com',
  'flipboard.com',
  'bing.com',
];

function publisherFromUrl(url?: string | null): string {
  if (!url) return '';
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
  if (!host || AGGREGATOR_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return '';
  const segment = host.split('.')[0].replace(/[-_]/g, ' ').trim();
  if (!segment) return '';
  return segment.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Pick the publisher name to render. Never returns a generic adapter label.
 * Order: real publisher_name → host derived from the article URL → source (feed) name → ''.
 */
export function resolvePublisherName(input: {
  publisherName?: string | null;
  url?: string | null;
  sourceName?: string | null;
}): string {
  const { publisherName, url, sourceName } = input;
  if (!isGeneric(publisherName)) return (publisherName as string).trim();
  const fromUrl = publisherFromUrl(url);
  if (fromUrl) return fromUrl;
  if (!isGeneric(sourceName)) return (sourceName as string).trim();
  return '';
}
