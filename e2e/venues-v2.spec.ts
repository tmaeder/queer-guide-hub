import { test, expect } from '@playwright/test';

// /venues v2 happy-path smoke. Verifies that the personalized + gamified
// experience renders for anonymous visitors: hero, rails, quick-filter chips,
// canonical grid, and that filter chips collapse the rails section.

test.describe('Venues v2', () => {
  test.setTimeout(60_000);

  test('renders hero + rails + grid when no filters', async ({ page }) => {
    await page.goto('/venues');
    await page.waitForLoadState('domcontentloaded');

    // Hero — featured venue section.
    const hero = page.getByRole('region', { name: /featured venue/i });
    await expect(hero).toBeVisible({ timeout: 15_000 });

    // At least one rail must show up. We check the two that don't depend on
    // geo permission or a logged-in user.
    await expect(page.getByRole('heading', { level: 2, name: /new this month/i })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: /editor.?s picks/i })).toBeVisible();

    // Quick-filter chips.
    await expect(page.getByRole('button', { name: /open now/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /distance|price/i }).first()).toBeVisible();

    // Canonical venue card grid eventually contains links.
    await page.waitForSelector('a[href*="/venues/"]', { timeout: 15_000 });
    const cardCount = await page.locator('a[href*="/venues/"]').count();
    expect(cardCount).toBeGreaterThan(0);
  });

  test('shows anonymous personalization promo instead of "For your taste"', async ({ page }) => {
    await page.goto('/venues');
    await page.waitForLoadState('domcontentloaded');

    // Anonymous users should NOT see the "For your taste" rail heading.
    const forYou = page.getByRole('heading', { level: 2, name: /for your taste/i });
    expect(await forYou.count()).toBe(0);

    // Instead, the promo section is present.
    const promo = page.getByRole('region', { name: /personalize your venues/i });
    await expect(promo).toBeVisible();

    // Promo has a CTA that targets the onboarding flow.
    const cta = promo.getByRole('link', { name: /get started/i });
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute('href', /onboarding\/venues|\/auth/);
  });

  test('selecting a category filter hides rails and shows the matching grid heading', async ({
    page,
  }) => {
    await page.goto('/venues');
    await page.waitForLoadState('domcontentloaded');

    // Wait for the page to settle so the rails are present first.
    await expect(page.getByRole('heading', { level: 2, name: /new this month/i })).toBeVisible({
      timeout: 15_000,
    });

    // Click a category chip from the chip row (Bar is always present).
    const barChip = page.getByRole('button', { name: /^Bar$/ }).first();
    await barChip.click();

    // Rails should now be replaced by the canonical "Matching venues" heading.
    const matching = page.getByRole('heading', { level: 2, name: /matching venues/i });
    await expect(matching).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('heading', { level: 2, name: /new this month/i })).toHaveCount(0);

    // URL reflects the filter.
    await expect(page).toHaveURL(/[?&]category=bar/);
  });

  test('view toggle switches to map', async ({ page }) => {
    await page.goto('/venues');
    await page.waitForLoadState('domcontentloaded');

    const mapToggle = page.getByRole('button', { name: /map view/i });
    await mapToggle.click();

    await expect(page).toHaveURL(/[?&]view=map/);
  });
});
