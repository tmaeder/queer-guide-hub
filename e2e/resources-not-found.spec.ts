import { test, expect } from '@playwright/test';

// P1-4 — unknown /tags/<slug> must render an explicit 404 instead
// of silently bouncing back to the overview.
//
// /tags/:slug is a detail route, so the Cloudflare Pages middleware hard-404s
// unknown slugs at the edge (functions/_middleware.ts notFoundHtml) — a real
// 404 status + a static "This page doesn't exist" page, consistent with every
// other detail route. The SPA `tag-not-found` component only renders on a
// client-side navigation to a broken tag link, not on a hard load.

test.describe('@p1-4 /tags/[slug] 404', () => {
  test('unknown slug returns a hard 404, not the overview', async ({ page }) => {
    const res = await page.goto('/tags/asdfgibberish-totally-not-a-real-tag-12345');
    expect(res?.status(), 'unknown tag slug must be a real 404').toBe(404);
    await expect(
      page.getByRole('heading', { name: /doesn'?t exist|page not found/i }),
    ).toBeVisible({ timeout: 10_000 });
    // Must be noindexed, and must NOT be the tag overview.
    const robots = await page.locator('meta[name="robots"]').first().getAttribute('content');
    expect(robots ?? '').toMatch(/noindex/);
  });
});
