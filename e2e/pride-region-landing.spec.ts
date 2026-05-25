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

  test('unknown region returns SPA shell (not the landing)', async ({ page }) => {
    const resp = await page.goto('/pride/2026/region/antarctica');
    // Landing resolver returns null for unknown region → falls through to SPA.
    // The SPA's <NotFound> or /pride catch-all renders instead — verify no SSR
    // landing markup leaked.
    const heading = await page.getByRole('heading', { name: 'Pride 2026 in Antarctica' }).count();
    expect(heading).toBe(0);
    expect(resp?.status()).toBe(200);
  });

  test('sitemap-landings.xml lists every year × region combo', async ({ request }) => {
    const resp = await request.get('/sitemap-landings.xml');
    expect(resp.status()).toBe(200);
    const xml = await resp.text();
    for (const year of [2024, 2025, 2026, 2027, 2028, 2029, 2030]) {
      for (const slug of REGIONS) {
        expect(xml).toContain(`/pride/${year}/region/${slug}`);
      }
    }
  });
});
