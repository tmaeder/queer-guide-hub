import { test, expect } from '@playwright/test';

// P1-4 — unknown /resources/<slug> must render an explicit 404 instead
// of silently bouncing back to the overview.

test.describe('@p1-4 /resources/[slug] 404', () => {
  test('unknown slug renders the not-found component', async ({ page }) => {
    await page.goto('/resources/asdfgibberish-totally-not-a-real-tag-12345');
    await expect(page.getByTestId('tag-not-found')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('heading', { name: /tag not found/i })).toBeVisible();
    // Browse-all button must allow recovery to the landing.
    await page.getByRole('button', { name: /browse all resources/i }).click();
    await expect(page).toHaveURL(/\/resources\/?$/);
  });
});
