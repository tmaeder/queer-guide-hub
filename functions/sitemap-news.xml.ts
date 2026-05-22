import { urlsetXml, xmlResponse, type Env } from './_lib/sitemap';

/**
 * P1.2 — /news/* is being de-indexed (hard remove via 410 Gone in
 * public/_redirects). Emitting individual article URLs here would tell
 * Google to recrawl URLs that now serve 410. Returning an empty urlset
 * keeps the sitemap endpoint valid (the sitemap index still references
 * it) while listing nothing.
 *
 * If/when news comes back as a first-class indexable section, restore
 * the previous implementation that paginates news_articles by
 * seo_indexable=eq.true.
 */
export const onRequest: PagesFunction<Env> = async () => {
  return xmlResponse(urlsetXml([]), 3600);
};
