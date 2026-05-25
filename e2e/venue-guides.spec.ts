import { test, expect } from '@playwright/test';

// Smoke specs for the venue editorial guides (V0–V3). Runs against
// E2E_BASE_URL (defaults to https://queer.guide). Relies on the 2 seeded
// Berlin guides being published on prod.

test.describe('Venues — editorial guides', () => {
  test.setTimeout(120_000);

  test('/venues renders the Guides stream', async ({ page }) => {
    await page.goto('/venues');
    await page.waitForLoadState('domcontentloaded');
    const guidesSection = page.getByRole('region', { name: /^guides$/i });
    await expect(guidesSection).toBeVisible({ timeout: 30_000 });
    await expect(
      guidesSection.getByRole('link', { name: /all guides/i }),
    ).toBeVisible();
  });

  test('/venues/guides lists published guides', async ({ page }) => {
    await page.goto('/venues/guides');
    await page.waitForLoadState('domcontentloaded');
    await expect(
      page.getByRole('heading', { name: /venue guides/i, level: 1 }),
    ).toBeVisible({ timeout: 30_000 });
    const guideLinks = page.locator('a[href^="/venues/guides/"]');
    await expect(guideLinks.first()).toBeVisible({ timeout: 30_000 });
  });

  test('/venues/guides/:slug renders hero + intro + at least one pick', async ({ page }) => {
    await page.goto('/venues/guides/berlin-queer-nightlife-starter');
    await page.waitForLoadState('domcontentloaded');
    await expect(
      page.getByRole('heading', { name: /berlin queer nightlife/i, level: 1 }),
    ).toBeVisible({ timeout: 30_000 });
    // The top pick is Berghain bar; "Our pick" tier label appears
    await expect(page.getByText(/^our pick$/i).first()).toBeVisible({
      timeout: 30_000,
    });
    // At-a-glance comparison table renders for guides with ≥2 picks
    await expect(page.getByRole('heading', { name: /at a glance/i })).toBeVisible({
      timeout: 30_000,
    });
    // Article JSON-LD emitted via useMeta
    await page.waitForFunction(
      () =>
        Array.from(document.querySelectorAll('script[type="application/ld+json"]')).some(
          (s) => {
            try {
              return JSON.parse(s.textContent || '')['@type'] === 'Article';
            } catch {
              return false;
            }
          },
        ),
      { timeout: 30_000 },
    );
  });

  test('venue detail surfaces "Featured in" backlink when picked', async ({ page }) => {
    // Berghain is the top pick in the seeded nightlife guide.
    await page.goto('/venues/berghain-1');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByText(/featured in (a|\d+) guides?/i)).toBeVisible({
      timeout: 30_000,
    });
    const guideLink = page
      .locator('a[href*="/venues/guides/berlin-queer-nightlife"]')
      .first();
    await expect(guideLink).toBeVisible({ timeout: 30_000 });
  });
});
