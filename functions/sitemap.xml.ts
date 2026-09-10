/**
 * /sitemap.xml — sitemap index. Lists per-type sitemaps; crawlers fan out from here.
 */
import { indexXml, xmlResponse, ORIGIN, type Env } from './_lib/sitemap';

const today = () => new Date().toISOString().slice(0, 10);

export const onRequest: PagesFunction<Env> = async () => {
  const lastmod = today();
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
    { loc: `${ORIGIN}/sitemap-static.xml`, lastmod },
    { loc: `${ORIGIN}/sitemap-landings.xml`, lastmod },
    { loc: `${ORIGIN}/sitemap-news.xml`, lastmod },
    { loc: `${ORIGIN}/sitemap-events.xml`, lastmod },
    { loc: `${ORIGIN}/sitemap-venues.xml`, lastmod },
    { loc: `${ORIGIN}/sitemap-hotels.xml`, lastmod },
    { loc: `${ORIGIN}/sitemap-places.xml`, lastmod },
    { loc: `${ORIGIN}/sitemap-villages.xml`, lastmod },
    { loc: `${ORIGIN}/sitemap-landmarks.xml`, lastmod },
    { loc: `${ORIGIN}/sitemap-personalities.xml`, lastmod },
    { loc: `${ORIGIN}/sitemap-milestones.xml`, lastmod },
    { loc: `${ORIGIN}/sitemap-tags.xml`, lastmod },
    // The 56 glossary category hubs. New URLs as of the 2026-08 rebuild: the
    // category used to be a query param, so no sitemap could have listed them.
    { loc: `${ORIGIN}/sitemap-tag-categories.xml`, lastmod },
  ]);
  return xmlResponse(xml, 3600);
};
