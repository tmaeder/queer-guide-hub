/**
 * /sitemap.xml — sitemap index. Lists per-type sitemaps; crawlers fan out from here.
 */
import { withEdgeCache, partUrls, indexXml, xmlResponse, ORIGIN, type Env } from './_lib/sitemap';

export const onRequest: PagesFunction<Env> = withEdgeCache(async () => {
  // No <lastmod> on index entries: it was today's date on every child, every
  // day, which tells a crawler nothing. Each child's <url> carries its own.
  // Order is roughly desire-to-crawl: static + landings first (highest
  // editorial value), then high-velocity content, then directories.
  // News is back in the index now that /news/:slug is a first-class page.
  //
  // sitemap-blog.xml was removed 2026-09-10. It had never published a single
  // URL: its generator queried a `blog_posts` table that DOES NOT EXIST (its own
  // comment claimed the table was "provisioned"), and the `.catch(() => [])`
  // around that fetch turned the missing relation into an empty list, so the
  // endpoint served a valid empty <urlset> with HTTP 200 forever. Three layers
  // hid it: the swallowed error, the 200 status, and `minEntries: 0` in
  // scripts/sitemap-freshness.mjs. `/blog` itself is a single CMS page
  // (CMSRoutePage slug="blog"), not a post archive, so it belongs to
  // sitemap-static.xml — there is no per-post URL space to advertise. Do not
  // re-add this without a real table AND a real /blog/:slug route.
  const xml = indexXml([
    { loc: `${ORIGIN}/sitemap-static.xml` },
    { loc: `${ORIGIN}/sitemap-landings.xml` },
    ...partUrls('/sitemap-news.xml').map((loc) => ({ loc })),
    { loc: `${ORIGIN}/sitemap-podcasts.xml` },
    { loc: `${ORIGIN}/sitemap-events.xml` },
    ...partUrls('/sitemap-venues.xml').map((loc) => ({ loc })),
    { loc: `${ORIGIN}/sitemap-hotels.xml` },
    { loc: `${ORIGIN}/sitemap-places.xml` },
    { loc: `${ORIGIN}/sitemap-villages.xml` },
    { loc: `${ORIGIN}/sitemap-personalities.xml` },
    { loc: `${ORIGIN}/sitemap-milestones.xml` },
    { loc: `${ORIGIN}/sitemap-tags.xml` },
    // The 56 glossary category hubs. New URLs as of the 2026-08 rebuild: the
    // category used to be a query param, so no sitemap could have listed them.
    { loc: `${ORIGIN}/sitemap-tag-categories.xml` },
    // Marketplace makers. New 2026-09-19, and last in the order for the reason
    // it could not exist sooner: `/marketplace/brands/:slug` had NO crawler
    // head until that day, so every maker page served the generic SPA shell and
    // a sitemap would have advertised ~871 identical-looking pages.
    { loc: `${ORIGIN}/sitemap-brands.xml` },
    // Listings and guides: both got a crawler head (listings) or a discovery
    // path (guides) on 2026-11-22. sitemap-landmarks.xml is NOT listed: it
    // advertised /place/:slug, which has no crawler head (1 URL, 6 rows).
    ...partUrls('/sitemap-marketplace.xml').map((loc) => ({ loc })),
    { loc: `${ORIGIN}/sitemap-guides.xml` },
    // Festival brands: crawler head + safety-gated view since 99991795355942.
    { loc: `${ORIGIN}/sitemap-festivals.xml` },
    // Observance hubs (/days/:slug): crawler head since observances phase 2.
    { loc: `${ORIGIN}/sitemap-days.xml` },
  ]);
  return xmlResponse(xml, 3600);
});
