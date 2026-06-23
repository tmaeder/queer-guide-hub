import { test, expect } from '@playwright/test';

// P1-1 — filter / search / sort / view state lives in URL query params.

test.describe('@p1-1 /tags URL state', () => {
  test('hydrates state from URL on direct visit', async ({ page }) => {
    await page.goto('/tags?sort=alphabetical&dir=asc&view=list&hasImage=1');
    await expect(page).toHaveURL(
      /\/tags\?.*sort=alphabetical.*dir=asc.*view=list.*hasImage=1/,
    );
  });

  test('typing in search updates the URL', async ({ page }) => {
    await page.goto('/tags?q=les');
    const search = page.getByRole('textbox', { name: /search resources/i }).first();
    await expect(search).toBeVisible({ timeout: 15_000 });
    await search.fill('lesbian');
    await expect(page).toHaveURL(/\/tags\?.*q=lesbian/, { timeout: 5_000 });
  });

  test('default values are not written to URL (clean links)', async ({ page }) => {
    await page.goto('/tags?sort=usage&dir=desc&view=grid&usage=all&hasImage=0&cat=all');
    await expect(page).toHaveURL(/\/tags\??$/);
  });
});
