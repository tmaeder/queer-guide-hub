import { test, expect } from '@playwright/test';

// D6 regression guard. Share and Favorite icon buttons on directory
// cards must meet the 44x44 touch target at mobile widths.

const MIN_TAP = 44;

test.describe('Venues — card tap targets (D6)', () => {
  test('Share + Favorite are ≥44x44 at 375px viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/venues');
    await page.waitForLoadState('domcontentloaded');

    // Wait for at least one card to render.
    const shareBtn = page.locator('button[aria-label^="Share "]').first();
    await shareBtn.waitFor({ state: 'visible', timeout: 20_000 });

    const shareBox = await shareBtn.boundingBox();
    expect(shareBox, 'Share button has no bounding box').not.toBeNull();
    expect(shareBox!.width).toBeGreaterThanOrEqual(MIN_TAP);
    expect(shareBox!.height).toBeGreaterThanOrEqual(MIN_TAP);

    // Favorite button is adjacent in the same overlay.
    const favBtn = page
      .locator('button[aria-label="Add to favorites"], button[aria-label="Remove from favorites"]')
      .first();
    await favBtn.waitFor({ state: 'visible', timeout: 10_000 });

    const favBox = await favBtn.boundingBox();
    expect(favBox, 'Favorite button has no bounding box').not.toBeNull();
    expect(favBox!.width).toBeGreaterThanOrEqual(MIN_TAP);
    expect(favBox!.height).toBeGreaterThanOrEqual(MIN_TAP);
  });
});
