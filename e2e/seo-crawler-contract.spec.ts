import { test, expect, type APIRequestContext } from '@playwright/test';
import { anonHeaders } from './support/anonKey';

// What a crawler is served, asserted against the deployed site (SEO plan
// phases 1-4, 2026-11-22). Request-only: every check reads raw HTML/XML with a
// Googlebot UA, the same bytes Google indexes before it renders anything.
// Data is DERIVED from the live sitemaps and the anon PostgREST role, never
// hardcoded, so a check cannot pass by pointing at a row that went away.

const BOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? 'https://xqeacpakadqfxjxjcewc.supabase.co';

async function bot(request: APIRequestContext, path: string, maxRedirects = 0) {
  const res = await request.get(path, { headers: { 'User-Agent': BOT }, maxRedirects });
  return { res, html: await res.text() };
}
const canonicalOf = (html: string) =>
  /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1] ?? null;
const robotsOf = (html: string) => /<meta name="robots" content="([^"]+)"/.exec(html)?.[1] ?? '';
const locs = (xml: string) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const jsonLd = (html: string): Record<string, unknown>[] =>
  [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].flatMap(
    (m) => {
      try {
        const v = JSON.parse(m[1]);
        return Array.isArray(v) ? v : [v];
      } catch {
        return [];
      }
    },
  );
const pathOf = (url: string) => new URL(url).pathname + new URL(url).search;

test.describe('@seo crawler contract', () => {
  test('locale prefixes canonicalise to the English URL and emit no hreflang', async ({
    request,
  }) => {
    for (const [path, want] of [
      ['/de', 'https://queer.guide/'],
      ['/fr/venues', 'https://queer.guide/venues'],
      ['/es/city/berlin', 'https://queer.guide/city/berlin'],
    ]) {
      const { res, html } = await bot(request, path);
      expect(res.status(), path).toBe(200);
      expect(canonicalOf(html), path).toBe(want);
      expect(html.match(/hreflang=/g) ?? [], path).toHaveLength(0);
    }
  });

  test('a page has exactly one <h1>', async ({ request }) => {
    for (const path of ['/', '/city/berlin', '/venues']) {
      const { html } = await bot(request, path);
      expect(html.match(/<h1[\s>]/g) ?? [], path).toHaveLength(1);
    }
  });

  test('robots.txt keeps crawlers out of signed-in and query surfaces', async ({ request }) => {
    const txt = await (await request.get('/robots.txt')).text();
    for (const p of ['/admin', '/auth', '/search', '/settings']) {
      expect(txt).toContain(`Disallow: ${p}`);
    }
    expect(txt).toContain('Sitemap: https://queer.guide/sitemap.xml');
  });

  test('retired hubs redirect in one hop', async ({ request }) => {
    for (const path of ['/countries', '/villages']) {
      const { res } = await bot(request, path);
      expect(res.status(), path).toBe(301);
      expect(res.headers().location, path).toMatch(/\/travel$/);
    }
  });

  test('the sitemap index lists split parts and nothing without a crawler head', async ({
    request,
  }) => {
    const children = locs(await (await request.get('/sitemap.xml')).text());
    expect(children.length).toBeGreaterThanOrEqual(61);
    for (const t of ['venues', 'news', 'marketplace']) {
      expect(
        children.filter((c) => c.includes(`/sitemap-${t}.xml?part=`)),
        t,
      ).toHaveLength(16);
    }
    expect(children.some((c) => c.includes('sitemap-landmarks'))).toBe(false);
    expect(children.some((c) => c.includes('sitemap-guides.xml'))).toBe(true);
  });

  test('a sitemap part is a non-empty urlset and an invalid part 404s', async ({ request }) => {
    const part = await request.get('/sitemap-venues.xml?part=3');
    expect(part.status()).toBe(200);
    expect(locs(await part.text()).length).toBeGreaterThan(500);
    expect((await request.get('/sitemap-venues.xml?part=z')).status()).toBe(404);
  });

  test('no pride landing in the sitemap renders noindex', async ({ request }) => {
    const xml = await (await request.get('/sitemap-landings.xml')).text();
    const pride = locs(xml).filter((u) => u.includes('/pride/'));
    // Positive control: an empty set satisfies "none is noindex" vacuously.
    expect(pride.length).toBeGreaterThan(0);
    for (const u of pride.slice(0, 25)) {
      const { res, html } = await bot(request, pathOf(u));
      expect(res.status(), u).toBe(200);
      expect(robotsOf(html), u).not.toMatch(/noindex/);
    }
  });

  test('a marketplace listing from the sitemap is an indexable Product', async ({ request }) => {
    const url = locs(await (await request.get('/sitemap-marketplace.xml?part=5')).text())[0];
    expect(url, 'no listing in sitemap-marketplace part 5').toBeTruthy();
    const { res, html } = await bot(request, pathOf(url));
    expect(res.status()).toBe(200);
    expect(robotsOf(html)).not.toMatch(/noindex/);
    expect(canonicalOf(html)).toBe(url);
    expect(html).toContain('<meta property="og:type" content="product">');
    const product = jsonLd(html).find((d) => d['@type'] === 'Product');
    expect(product, 'Product JSON-LD').toBeTruthy();
    const offer = product!.offers as Record<string, unknown> | undefined;
    if (offer?.price !== undefined) expect(offer.priceCurrency).toMatch(/^[A-Z]{3}$/);
    const crumbs = jsonLd(html).find((d) => d['@type'] === 'BreadcrumbList');
    expect(JSON.stringify(crumbs)).toContain('https://queer.guide/marketplace');
  });

  test('unknown listing and organization slugs are real 404s', async ({ request }) => {
    for (const path of [
      '/marketplace/zz-no-such-listing-e2e',
      '/organizations/zz-no-such-org-e2e',
    ]) {
      const { res } = await bot(request, path);
      expect(res.status(), path).toBe(404);
    }
  });

  test('a venue-identity organization is noindex; the venue is the indexed page', async ({
    request,
  }) => {
    const res = await request.get(
      `${SUPABASE_URL}/rest/v1/organizations?select=slug&primary_venue_id=not.is.null&status=eq.active&duplicate_of_id=is.null&safety_gated=eq.false&slug=not.is.null&limit=1`,
      { headers: await anonHeaders(request) },
    );
    expect(res.ok(), `organizations -> HTTP ${res.status()}`).toBeTruthy();
    const rows = (await res.json()) as { slug: string }[];
    expect(rows.length, 'no venue-identity org readable by anon').toBe(1);
    const page = await bot(request, `/organizations/${rows[0].slug}`);
    expect(page.res.status()).toBe(200);
    expect(robotsOf(page.html)).toMatch(/noindex/);
  });

  test('place breadcrumbs go through /travel, not the /places redirect stub', async ({
    request,
  }) => {
    const { html } = await bot(request, '/city/berlin');
    const crumbs = JSON.stringify(jsonLd(html).find((d) => d['@type'] === 'BreadcrumbList'));
    expect(crumbs).toContain('https://queer.guide/travel');
    expect(crumbs).not.toContain('https://queer.guide/places');
  });

  test('events carry a real status and never a currency-less price', async ({ request }) => {
    const sample = locs(await (await request.get('/sitemap-events.xml')).text()).slice(0, 10);
    expect(sample.length).toBeGreaterThan(0);
    let checked = 0;
    for (const u of sample) {
      const ev = jsonLd((await bot(request, pathOf(u))).html).find((d) => d['@type'] === 'Event');
      if (!ev) continue;
      checked += 1;
      expect(String(ev.eventStatus), u).toMatch(/^https:\/\/schema\.org\/Event/);
      const offer = ev.offers as Record<string, unknown> | undefined;
      if (offer?.price !== undefined) expect(offer.priceCurrency, u).toMatch(/^[A-Z]{3}$/);
    }
    expect(checked, 'no Event JSON-LD found in the sample').toBeGreaterThan(0);
  });

  test('routes with no crawler head are noindex', async ({ request }) => {
    for (const path of ['/place/anything-e2e', '/news/story/anything-e2e']) {
      const { html } = await bot(request, path);
      expect(robotsOf(html), path).toMatch(/noindex/);
    }
  });

  test('hubs give crawlers item links', async ({ request }) => {
    for (const [path, prefix] of [
      ['/news', '/news/'],
      ['/marketplace', '/marketplace/'],
    ]) {
      const { html } = await bot(request, path);
      const items = html.match(new RegExp(`href="${prefix}[a-z0-9-]+"`, 'g')) ?? [];
      expect(items.length, path).toBeGreaterThanOrEqual(20);
    }
  });
});
