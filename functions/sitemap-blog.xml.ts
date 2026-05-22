import { fetchRows, urlsetXml, xmlResponse, ORIGIN, type Env, type SitemapEntry } from './_lib/sitemap';

export const onRequest: PagesFunction<Env> = async ({ env }) => {
  // P4.4 / P1.1 — gate on seo_indexable + published_at so drafts and
  // editorial-noindexed posts don't leak into the sitemap. blog_posts
  // table is provisioned; SPA blog route lands in a follow-up phase.
  const rows = await fetchRows(
    env,
    'blog_posts',
    'slug,updated_at',
    'slug=not.is.null&seo_indexable=eq.true&published_at=not.is.null',
    5000,
  ).catch(() => []);
  const entries: SitemapEntry[] = rows
    .filter((r) => typeof r.slug === 'string' && (r.slug as string).length > 0)
    .map((r) => ({
      loc: `${ORIGIN}/blog/${encodeURIComponent(r.slug as string)}`,
      lastmod: typeof r.updated_at === 'string' ? (r.updated_at as string).slice(0, 10) : undefined,
      changefreq: 'weekly',
      priority: 0.6,
    }));
  return xmlResponse(urlsetXml(entries), 3600);
};
