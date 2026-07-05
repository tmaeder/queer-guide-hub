import { test, expect } from '@playwright/test';

// P1-4 — unknown /tags/<slug> must render an explicit 404 instead
// of silently bouncing back to the overview.

test.describe('@p1-4 /tags/[slug] 404', () => {
  test('unknown slug renders the not-found component', async ({ page }) => {
    await page.goto('/tags/asdfgibberish-totally-not-a-real-tag-12345');
    // The not-found state resolves only after the tag list loads and the
    // per-slug lookup returns null — a two-step async chain. Let the network
    // settle first so a cold prod load doesn't race the assertion timeout.
    await page.waitForLoadState('networkidle').catch(() => {});
    await expect(page.getByTestId('tag-not-found')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: /tag not found/i })).toBeVisible();
    await page.getByRole('button', { name: /browse all resources/i }).click();
    await expect(page).toHaveURL(/\/tags\/?$/);
  });
});
