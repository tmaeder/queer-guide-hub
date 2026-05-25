import { test, expect } from '@playwright/test';

// Smoke specs for the marketplace editorial atlas (Phases 0–6 + followups).
// Runs against E2E_BASE_URL (defaults to https://queer.guide). Relies on the
// 3 seeded guides being published on prod.

test.describe('Marketplace — editorial guides', () => {
  test.setTimeout(120_000);

  test('/marketplace renders the Guides stream', async ({ page }) => {
    await page.goto('/marketplace');
    await page.waitForLoadState('domcontentloaded');
    const guidesSection = page.getByRole('region', { name: /^guides$/i });
    await expect(guidesSection).toBeVisible({ timeout: 30_000 });
    // Should have the "All guides" link
    await expect(
      guidesSection.getByRole('link', { name: /all guides/i }),
    ).toBeVisible();
  });

  test('/marketplace/guides lists published guides', async ({ page }) => {
    await page.goto('/marketplace/guides');
    await page.waitForLoadState('domcontentloaded');
    await expect(
      page.getByRole('heading', { name: /marketplace guides/i, level: 1 }),
    ).toBeVisible({ timeout: 30_000 });
    // At least one guide card linking to a guide detail
    const guideLinks = page.locator('a[href^="/marketplace/guides/"]');
    await expect(guideLinks.first()).toBeVisible({ timeout: 30_000 });
  });

  test('/marketplace/guides/:slug renders hero + intro + at least one pick', async ({ page }) => {
    // The "Pride briefs" guide is seeded + featured on prod with 5 picks.
    await page.goto('/marketplace/guides/pride-briefs-queer-owned-underwear-2026');
    await page.waitForLoadState('domcontentloaded');
    // Hero title
    await expect(
      page.getByRole('heading', { name: /pride briefs/i, level: 1 }),
    ).toBeVisible({ timeout: 30_000 });
    // "Our pick" tier label appears (the top pick is "The Emari")
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

  test('guide pick shop-now CTA uses rel="sponsored nofollow"', async ({ page }) => {
    await page.goto('/marketplace/guides/pride-briefs-queer-owned-underwear-2026');
    await page.waitForLoadState('domcontentloaded');
    const shopLinks = page.getByRole('link', { name: /shop now/i });
    await expect(shopLinks.first()).toBeVisible({ timeout: 30_000 });
    const rel = await shopLinks.first().getAttribute('rel');
    expect(rel).toContain('sponsored');
    expect(rel).toContain('nofollow');
    expect(rel).toContain('noopener');
  });

  test('listing detail surfaces "Featured in" backlink when picked', async ({ page }) => {
    // The Emari is the top pick in the seeded underwear guide.
    await page.goto('/marketplace/the-emari');
    await page.waitForLoadState('domcontentloaded');
    // The callout uses "Featured in a guide" / "Featured in N guides"
    await expect(page.getByText(/featured in (a|\d+) guides?/i)).toBeVisible({
      timeout: 30_000,
    });
    // And links back to the guide
    const guideLink = page
      .locator('a[href*="/marketplace/guides/pride-briefs"]')
      .first();
    await expect(guideLink).toBeVisible({ timeout: 30_000 });
  });

  test('/marketplace/missions signed-out shows sign-in prompt', async ({ page }) => {
    await page.goto('/marketplace/missions');
    await page.waitForLoadState('domcontentloaded');
    // Anon path renders the sign-in EmptyState.
    await expect(page.getByText(/sign in to track your progress/i)).toBeVisible({
      timeout: 30_000,
    });
  });
});
