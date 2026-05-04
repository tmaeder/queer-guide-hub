import { test, expect } from '@playwright/test';

// P1-1 — filter / search / sort / view state lives in URL query params.

test.describe('@p1-1 /resources URL state', () => {
  test('hydrates state from URL on direct visit', async ({ page }) => {
    await page.goto('/resources?sort=alphabetical&dir=asc&view=list&hasImage=1');
    // Page must render without bouncing back to defaults.
    await expect(page).toHaveURL(
      /\/resources\?.*sort=alphabetical.*dir=asc.*view=list.*hasImage=1/,
    );
  });

  test('typing in search updates the URL', async ({ page }) => {
    await page.goto('/resources');
    const search = page.getByRole('textbox', { name: /search resources/i }).first();
    await search.fill('lesbian');
    await expect(page).toHaveURL(/\/resources\?.*q=lesbian/, { timeout: 5_000 });
  });

  test('default values are not written to URL (clean links)', async ({ page }) => {
    await page.goto('/resources?sort=usage&dir=desc&view=grid&usage=all&hasImage=0&cat=all');
    // After hydration the URL should normalise to no params (defaults are
    // implicit). We accept either fully-clean or just the absence of any
    // of the default markers.
    await expect(page).toHaveURL(/\/resources\??$/);
  });
});
