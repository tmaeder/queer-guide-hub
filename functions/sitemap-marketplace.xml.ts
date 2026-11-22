/**
 * Marketplace listings (/marketplace/:slug). New 2026-11-22, the same day the
 * route got a crawler head (detail.ts marketplaceListingDetail) — before that
 * every listing served the homepage title, so there was nothing to advertise.
 *
 * The filter mirrors `listingIndexable` in detail.ts: SFW or suggestive, with a
 * product image and a price. Keep the two in step, or the sitemap lists pages
 * that render noindex.
 */
import {
  fetchRows,
  urlsetXml,
  xmlResponse,
  ORIGIN,
  type Env,
  type SitemapEntry,
} from './_lib/sitemap';
import { LISTING_INDEXABLE_FILTER } from './_lib/detail';

export const onRequest: PagesFunction<Env> = async ({ env }) => {
  const rows = await fetchRows(
    env,
    'marketplace_listings',
    'slug,updated_at',
    LISTING_INDEXABLE_FILTER,
  );
  const entries: SitemapEntry[] = rows
    .filter((r) => typeof r.slug === 'string' && (r.slug as string).length > 0)
    .map((r) => ({
      loc: `${ORIGIN}/marketplace/${encodeURIComponent(r.slug as string)}`,
      lastmod: typeof r.updated_at === 'string' ? (r.updated_at as string).slice(0, 10) : undefined,
      changefreq: 'weekly',
      priority: 0.5,
    }));
  return xmlResponse(urlsetXml(entries), 3600);
};
