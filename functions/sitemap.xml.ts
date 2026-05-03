/**
 * /sitemap.xml — sitemap index. Lists per-type sitemaps; crawlers fan out from here.
 */
import { indexXml, xmlResponse, ORIGIN, type Env } from './_lib/sitemap';

const today = () => new Date().toISOString().slice(0, 10);

export const onRequest: PagesFunction<Env> = async () => {
  const lastmod = today();
  const xml = indexXml([
    { loc: `${ORIGIN}/sitemap-static.xml`, lastmod },
    { loc: `${ORIGIN}/sitemap-venues.xml`, lastmod },
    { loc: `${ORIGIN}/sitemap-events.xml`, lastmod },
    { loc: `${ORIGIN}/sitemap-news.xml`, lastmod },
    { loc: `${ORIGIN}/sitemap-blog.xml`, lastmod },
    { loc: `${ORIGIN}/sitemap-personalities.xml`, lastmod },
    { loc: `${ORIGIN}/sitemap-places.xml`, lastmod },
  ]);
  return xmlResponse(xml, 3600);
};
