import { expect, type APIRequestContext } from '@playwright/test';
import { anonHeaders, SUPABASE_REST_URL } from './anonKey';

type IndexedTag = { slug: string; updated_at: string | null; publication_role: string };

async function indexedTags(request: APIRequestContext) {
  const headers = await anonHeaders(request);
  const rows: IndexedTag[] = [];
  for (let offset = 0; offset < 20_000; offset += 1000) {
    const response = await request.get(
      `${SUPABASE_REST_URL}/rest/v1/unified_tags?select=slug,updated_at,publication_role` +
        `&status=eq.active&seo_indexable=is.true&slug=not.is.null&order=slug.asc&limit=1000&offset=${offset}`,
      { headers },
    );
    expect(response.ok(), 'Indexable tag registry must be readable').toBe(true);
    const page = (await response.json()) as IndexedTag[];
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
  throw new Error('Indexable tag registry exceeded the bounded pagination limit');
}

// sitemap-tags.xml is cached for one hour. Check every entry whose publication
// state predates that window, rather than pinning the editable corpus to 500 or
// 1,000 rows. Current indexed entries also provide a non-vacuous positive control.
export async function assertCurrentTagSitemap(request: APIRequestContext, xml: string) {
  expect(xml).toMatch(/<urlset\b/);
  const slugs = new Set(
    [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => {
      const url = new URL(match[1]);
      expect(url.pathname).toMatch(/^\/tags\/[^/]+$/);
      return decodeURIComponent(url.pathname.slice('/tags/'.length));
    }),
  );
  const indexed = await indexedTags(request);
  expect(indexed.length, 'The registry must contain indexable tags').toBeGreaterThan(0);
  expect(slugs.size, 'The tag sitemap must contain parsed entries').toBeGreaterThan(0);
  expect(
    indexed.some((tag) => slugs.has(tag.slug)),
    'Sitemap must list a current indexed tag',
  ).toBe(true);
  const stableBefore = Date.now() - 3660_000;
  for (const tag of indexed) {
    if (!tag.updated_at || Date.parse(tag.updated_at) <= stableBefore) {
      expect(slugs.has(tag.slug), `Sitemap omitted stable indexed tag ${tag.slug}`).toBe(true);
    }
  }
  return slugs;
}

export async function currentArticleTagSlug(request: APIRequestContext) {
  const articles = (await indexedTags(request)).filter((tag) => tag.publication_role === 'article');
  expect(articles.length, 'An indexed article must exist for the crawler control').toBeGreaterThan(
    0,
  );
  const stableBefore = Date.now() - 3660_000;
  return (
    articles.find((tag) => !tag.updated_at || Date.parse(tag.updated_at) <= stableBefore) ??
    articles[0]
  ).slug;
}
