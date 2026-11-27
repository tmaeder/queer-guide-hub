import { test, expect } from '@playwright/test';

// Continental Pride hub landings — server-rendered via Pages Function.
// Verifies the route resolves, JSON-LD breadcrumb is present, and
// sitemap-landings.xml lists the year×region URLs.

const REGIONS = ['europe', 'americas', 'asia', 'oceania', 'africa'] as const;
const REGION_NAMES: Record<(typeof REGIONS)[number], string> = {
  europe: 'Europe',
  americas: 'Americas',
  asia: 'Asia',
  oceania: 'Oceania',
  africa: 'Africa',
};

test.describe('@pride /pride/:year/region/:slug', () => {
  for (const slug of REGIONS) {
    test(`renders Pride 2026 in ${REGION_NAMES[slug]}`, async ({ page }) => {
      const resp = await page.goto(`/pride/2026/region/${slug}`);
      expect(resp?.status()).toBe(200);
      await expect(page).toHaveTitle(new RegExp(`Pride 2026 in ${REGION_NAMES[slug]}`));
      await expect(page.getByRole('heading', { name: `Pride 2026 in ${REGION_NAMES[slug]}` })).toBeVisible();
      // Breadcrumb back to year hub
      await expect(page.getByRole('link', { name: 'Pride 2026', exact: true })).toBeVisible();
    });
  }

  test('emits BreadcrumbList JSON-LD', async ({ page }) => {
    await page.goto('/pride/2026/region/europe');
    const ld = await page.locator('script[type="application/ld+json"]').first().textContent();
    expect(ld).toContain('BreadcrumbList');
    expect(ld).toContain('Europe');
  });

  test('unknown region 404s and leaks no landing markup', async ({ page }) => {
    // This asserted `status === 200` until 2026-09-14, on the premise that an
    // unknown region "falls through to the SPA". It does not, and should not:
    // there is no SPA route for /pride/:year/region/:slug, so functions/
    // _middleware.ts answers with a real 404 rather than the soft-404 that
    // serving the shell at 200 would be. Measured on prod — /pride/2099 and
    // /spaces/not-a-real-tag DO fall through at 200 because the SPA has routes
    // for them; the region path has none. A nonexistent page returning 200 is
    // an SEO defect, so 404 is the behaviour under test, not a regression.
    const resp = await page.goto('/pride/2026/region/antarctica');
    expect(resp?.status()).toBe(404);
    const heading = await page.getByRole('heading', { name: 'Pride 2026 in Antarctica' }).count();
    expect(heading).toBe(0);
  });

  test('sitemap-landings.xml lists only pride landings that render indexable', async ({
    request,
  }) => {
    const resp = await request.get('/sitemap-landings.xml');
    expect(resp.status()).toBe(200);
    const xml = await resp.text();

    // This asserted the year×region CROSS PRODUCT until 2026-11-22. That rule
    // is what put ~490 noindex pages into the sitemap: a landing below
    // MIN_LANDING_EVENTS renders noindex, so a region with two Pride events
    // must NOT be listed. The invariant is now the one Google cares about —
    // every listed year/region page is indexable.
    const urls = [...xml.matchAll(/<loc>([^<]*\/pride\/\d{4}(?:\/region\/[a-z]+)?)<\/loc>/g)].map(
      (m) => new URL(m[1]).pathname,
    );
    // Positive control: an empty match set satisfies "every listed page is
    // indexable" vacuously.
    expect(urls.length, 'no /pride/:year or region URLs in the sitemap').toBeGreaterThan(0);
    for (const path of urls) {
      const page = await request.get(path);
      expect(page.status(), path).toBe(200);
      expect(await page.text(), `${path} is listed but renders noindex`).not.toMatch(
        /<meta name="robots" content="noindex/,
      );
    }

    // A year beyond currentYear+1 is not publishable — the landing resolver
    // returns null for it.
    const max = new Date().getUTCFullYear() + 1;
    expect(xml).not.toContain(`/pride/${max + 1}`);
  });
});
