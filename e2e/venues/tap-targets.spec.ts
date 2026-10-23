import { test, expect } from '@playwright/test';

// D6 regression guard. The icon action on directory cards must meet the
// 44x44 touch target at mobile widths.
//
// Favorite is the ONLY card action. Share was removed from VenueCard by the
// editorial-strip redesign (#1086, 2026-05-24) — it lives on the detail page —
// so waiting for a card Share button timed out on every run.

const MIN_TAP = 44;

test.describe('Venues — card tap targets (D6)', () => {
  test('Favorite is ≥44x44 at 375px viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/venues');
    await page.waitForLoadState('domcontentloaded');

    const favBtn = page
      .locator('button[aria-label="Add to favorites"], button[aria-label="Remove from favorites"]')
      .first();
    await favBtn.waitFor({ state: 'visible', timeout: 20_000 });

    const favBox = await favBtn.boundingBox();
    expect(favBox, 'Favorite button has no bounding box').not.toBeNull();
    expect(favBox!.width).toBeGreaterThanOrEqual(MIN_TAP);
    expect(favBox!.height).toBeGreaterThanOrEqual(MIN_TAP);
  });
});
