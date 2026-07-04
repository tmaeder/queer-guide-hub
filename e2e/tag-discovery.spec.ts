import { test, expect } from '@playwright/test';

/**
 * Tags as a first-class discovery axis (anonymous flows).
 *
 * Run against a local server (the feature ships on a branch not yet on prod):
 *   E2E_BASE_URL=http://127.0.0.1:8080 npx playwright test tag-discovery --project=chromium
 */

// Seed the cookie-consent key so the banner doesn't intercept clicks.
test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    try {
      localStorage.setItem('queer-guide-cookie-consent', 'accepted');
    } catch {
      /* ignore */
    }
  });
});

test.describe('tag discovery', () => {
  test('venue detail shows clickable tag chips that resolve by slug', async ({ page }) => {
    await page.goto('/venues/the-long-island-eagle-tavern');
    await expect(page.getByRole('heading', { name: 'The Long Island Eagle Tavern' })).toBeVisible();

    // Tag chips render as links to the canonical tag page using the slug.
    const bearBar = page.locator('a[href*="/tags/bear-bar"]').first();
    await expect(bearBar).toBeVisible();
    await expect(bearBar).toContainText(/bear bar/i);

    // Clicking resolves the tag page (the slug-resolver fix) — not a 404.
    await bearBar.click();
    await expect(page).toHaveURL(/\/tags\/bear-bar/);
    await expect(page.getByRole('heading', { name: /^Bear Bar$/ })).toBeVisible();
    await expect(page.getByText(/tag not found/i)).toHaveCount(0);
  });

  test('canonical tag page aggregates linked content + has a Follow affordance', async ({
    page,
  }) => {
    await page.goto('/tags/bear-bar');
    await expect(page.getByRole('heading', { name: /^Bear Bar$/ })).toBeVisible();

    // Cross-content aggregation: a venue-vocabulary tag surfaces a Venues section.
    await expect(page.getByRole('heading', { name: 'Venues' })).toBeVisible();

    // Follow affordance present (anon: clicking prompts sign-in, button still renders).
    await expect(page.getByRole('button', { name: /^Follow$/ })).toBeVisible();
  });

  test('marketplace-tagged term shows a Shop section on the tag page', async ({ page }) => {
    await page.goto('/tags/occ-everyday');
    await expect(page.getByRole('heading', { name: 'Everyday' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Shop' })).toBeVisible();
  });

  test('"More like this" cross-entity rail renders on a venue detail', async ({ page }) => {
    await page.goto('/venues/the-long-island-eagle-tavern');
    const rail = page.getByRole('heading', { name: 'More like this' });
    await rail.scrollIntoViewIfNeeded();
    await expect(rail).toBeVisible();
    // The rail links out to other entity detail pages.
    const section = page.locator('section', { has: rail });
    await expect(section.locator('a[href*="/venues/"]').first()).toBeVisible();
  });

  test('search tag filter narrows results via the ?tags= URL', async ({ page }) => {
    await page.goto('/search?q=eagle&types=venue&tags=leather-bar');
    // Results come back (worker filters facets->tags); at least one venue card.
    const firstResult = page.locator('a[href*="/venues/"]').first();
    await expect(firstResult).toBeVisible({ timeout: 15000 });
    // The active tag filter chip is shown and is removable.
    await expect(page.getByText(/leather bar/i).first()).toBeVisible();
  });
});
