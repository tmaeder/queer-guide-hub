import { test, expect } from '@playwright/test';

// Continental Pride hub landings — server-rendered via Pages Function.
// Verifies the route resolves, JSON-LD breadcrumb is present, hreflang is
// emitted, and sitemap-landings.xml lists the year×region URLs.

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

  test('sitemap-landings.xml lists every region for every published year', async ({ request }) => {
    const resp = await request.get('/sitemap-landings.xml');
    expect(resp.status()).toBe(200);
    const xml = await resp.text();

    // The years are DERIVED from the sitemap's own /pride/:year entries, never
    // hardcoded. prideYears() is PRIDE_YEAR_MIN..currentYear+1 and landing.ts
    // says in so many words that a frozen constant would be wrong — so the old
    // literal list [2024..2030] was a time bomb that could not pass before
    // 2029, and it duly went red as 2028 fell out of range. What is actually
    // invariant is the CROSS PRODUCT: every year the sitemap publishes carries
    // every region.
    const years = [...new Set([...xml.matchAll(/\/pride\/(\d{4})<\/loc>/g)].map((m) => Number(m[1])))];
    expect(years.length).toBeGreaterThan(0);

    for (const year of years) {
      for (const slug of REGIONS) {
        expect(xml, `year ${year} is published but region ${slug} is missing`).toContain(
          `/pride/${year}/region/${slug}`,
        );
      }
    }

    // Endpoints of the window, so "derived from the sitemap" cannot degrade
    // into "whatever the sitemap happens to say". A year beyond currentYear+1
    // is not publishable — the landing resolver returns null for it — and
    // listing one would be the real defect this test exists to catch.
    const max = new Date().getUTCFullYear() + 1;
    expect(years).toContain(max);
    expect(xml).not.toContain(`/pride/${max + 1}/region/`);
  });
});
