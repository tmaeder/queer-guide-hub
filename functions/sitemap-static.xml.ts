/**
 * /sitemap-static.xml — hand-curated static routes. Excludes auth/user-only.
 */
import { urlsetXml, xmlResponse, ORIGIN, type Env } from './_lib/sitemap';
import { STATIC_ROUTE_META, isIndexable } from './_lib/routeMeta';

const today = () => new Date().toISOString().slice(0, 10);

export const onRequest: PagesFunction<Env> = async () => {
  const lastmod = today();
  const entries = Object.keys(STATIC_ROUTE_META)
    .filter(isIndexable)
    .map((path) => ({
      loc: `${ORIGIN}${path === '/' ? '' : path}`,
      lastmod,
      changefreq: path === '/' ? ('daily' as const) : ('weekly' as const),
      priority: path === '/' ? 1.0 : 0.7,
    }));
  return xmlResponse(urlsetXml(entries), 3600);
};
