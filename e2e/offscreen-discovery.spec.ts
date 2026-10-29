import { test, expect } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });
for (const width of [390, 1365]) {
  test(`offscreen venue queries follow the reader at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const railRequests: string[] = [];
    page.on('request', (request) => {
      if (!request.url().includes('/rpc/rpc_venues_ranked')) return;
      const body = request.postDataJSON();
      if (body?.p_limit === 8) railRequests.push(body.p_sort);
    });
    await page.goto('/venues');
    await expect(page.getByRole('region', { name: /featured venue/i })).toBeVisible();
    const recent = page.locator('[data-venue-rail="created_at"]');
    await expect(recent).toBeAttached();
    expect((await recent.boundingBox())!.y).toBeGreaterThan(844);
    expect(railRequests).toEqual([]);
    // A placeholder heading is insufficient: approaching must actually fetch
    // and render linked venue cards, without also starting the later rail.
    await recent.scrollIntoViewIfNeeded();
    await expect.poll(() => railRequests.includes('created_at')).toBe(true);
    await expect(recent.locator('a[href^="/venues/"]').first()).toBeVisible();
    const editors = page.locator('[data-venue-rail="featured"]').last();
    // A tall viewport can approach both neighboring rails at once.
    if (railRequests.includes('featured')) {
      expect((await editors.boundingBox())!.y).toBeLessThanOrEqual(844);
    }
    await editors.scrollIntoViewIfNeeded();
    await expect.poll(() => railRequests.includes('featured')).toBe(true);
    await expect(editors.locator('a[href^="/venues/"]').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });

}
