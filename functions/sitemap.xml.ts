/**
 * /sitemap.xml — sitemap index. Lists per-type sitemaps; crawlers fan out from here.
 */
import { indexXml, xmlResponse, ORIGIN, type Env } from './_lib/sitemap';

const today = () => new Date().toISOString().slice(0, 10);

export const onRequest: PagesFunction<Env> = async () => {
  const lastmod = today();
  // P1.6 — sitemap index hygiene. News sitemap is omitted now that
  // /news/:slug is hard-removed (P1.2); leaving the empty sitemap
  // referenced would tell Google to keep coming back to a non-result.
  // Order is roughly desire-to-crawl: static + landings first (highest
  // editorial value), then high-velocity content, then directories.
  const xml = indexXml([
    { loc: `${ORIGIN}/sitemap-static.xml`, lastmod },
    { loc: `${ORIGIN}/sitemap-landings.xml`, lastmod },
    { loc: `${ORIGIN}/sitemap-blog.xml`, lastmod },
    { loc: `${ORIGIN}/sitemap-events.xml`, lastmod },
    { loc: `${ORIGIN}/sitemap-venues.xml`, lastmod },
    { loc: `${ORIGIN}/sitemap-hotels.xml`, lastmod },
    { loc: `${ORIGIN}/sitemap-places.xml`, lastmod },
    { loc: `${ORIGIN}/sitemap-villages.xml`, lastmod },
    { loc: `${ORIGIN}/sitemap-personalities.xml`, lastmod },
    { loc: `${ORIGIN}/sitemap-tags.xml`, lastmod },
  ]);
  return xmlResponse(xml, 3600);
};
