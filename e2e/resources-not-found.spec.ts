import { test, expect } from '@playwright/test';

// P1-4 — unknown /tags/<slug> must render an explicit 404 instead
// of silently bouncing back to the overview.

test.describe('@p1-4 /tags/[slug] 404', () => {
  test('unknown slug renders the not-found component', async ({ page }) => {
    await page.goto('/tags/asdfgibberish-totally-not-a-real-tag-12345');
    await expect(page.getByTestId('tag-not-found')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('heading', { name: /tag not found/i })).toBeVisible();
    await page.getByRole('button', { name: /browse all resources/i }).click();
    await expect(page).toHaveURL(/\/tags\/?$/);
  });
});
