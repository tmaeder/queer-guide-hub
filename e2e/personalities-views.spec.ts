import { test, expect } from '@playwright/test';

/**
 * Smoke for the new /personalities discovery surfaces:
 *   - Era chip toggles birth_year_min/max filter via ?era=
 *   - View switcher persists in URL (?view=timeline, ?view=map)
 *   - Active filter chip lists the era after applying it
 *   - Tag URL param deep-links and renders an active-filter chip
 */

test.describe('Personalities — discovery + views', () => {
  test('era chip applies birth-year range and shows active chip', async ({ page }) => {
    await page.goto('/personalities', { waitUntil: 'networkidle' });

    // Era buttons are rendered in the editorial block when no filters are active.
    const stonewall = page.getByRole('button', { name: /Stonewall era/i });
    await stonewall.click();

    await expect(page).toHaveURL(/[?&]era=stonewall/);
    await expect(page.getByText(/Era:.*Stonewall/i)).toBeVisible();
  });

  test('view switcher persists in URL across grid → timeline → map', async ({ page }) => {
    await page.goto('/personalities', { waitUntil: 'networkidle' });

    // Tab role is set on the view buttons.
    await page.getByRole('tab', { name: /Timeline/i }).click();
    await expect(page).toHaveURL(/[?&]view=timeline/);
    await expect(page.getByRole('region', { name: /Timeline of personalities/i })).toBeVisible({
      timeout: 10_000,
    });

    await page.getByRole('tab', { name: /Map/i }).click();
    await expect(page).toHaveURL(/[?&]view=map/);
    await expect(page.getByRole('region', { name: /Map of personalities/i })).toBeVisible({
      timeout: 10_000,
    });

    await page.getByRole('tab', { name: /Grid/i }).click();
    // ?view=grid is the default, so it should be stripped from the URL.
    await expect(page).not.toHaveURL(/[?&]view=/);
  });

  test('tag deep-link renders an active filter chip', async ({ page }) => {
    await page.goto('/personalities?tag=writer', { waitUntil: 'networkidle' });
    await expect(page.getByText(/Tag:\s*writer/i)).toBeVisible();
  });
});
