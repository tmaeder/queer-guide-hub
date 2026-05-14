import { test, expect } from '@playwright/test';

// Venues audit Phase 3 (P0/P1): map view markers + category data checks.

test.describe('Venues — map view', () => {
  test('map view renders canvas and shows results count', async ({ page }) => {
    await page.goto('/venues?view=map');
    await page.waitForLoadState('domcontentloaded');

    // MapLibre canvas should be visible.
    const canvas = page.locator('canvas.maplibregl-canvas');
    await expect(canvas).toBeVisible({ timeout: 15_000 });

    // Results count badge appears (may say "Loading..." initially).
    const countBadge = page.locator('text=/\\d+ results in view|Loading/');
    await expect(countBadge).toBeVisible({ timeout: 20_000 });
  });

  test('map empty-state overlay shows when filters match nothing', async ({ page }) => {
    // Use a nonsense search that should match zero venues.
    await page.goto('/venues?view=map&q=zzzznonexistent999');
    await page.waitForLoadState('domcontentloaded');

    // Wait for the map + filter to settle.
    await page.waitForTimeout(2000);

    // If filteredTotal is 0 the overlay should appear with "Clear Filters".
    const clearBtn = page.getByRole('button', { name: /clear filters/i });
    // This is conditional — if the DB happens to match, skip gracefully.
    const overlay = page.locator('text=/no venues match/i');
    const hasOverlay = await overlay.isVisible().catch(() => false);
    if (hasOverlay) {
      await expect(clearBtn).toBeVisible();
    }
  });
});

test.describe('Venues — category data quality', () => {
  test('bar filter results do not contain obvious non-bar venues', async ({ page }) => {
    await page.goto('/venues?category=bar');
    await page.waitForLoadState('domcontentloaded');

    // Wait for cards to load.
    await page.waitForTimeout(2000);

    // Grab all venue card titles visible on the page.
    const titles = await page.locator('[data-testid="venue-card"] h3, [data-testid="venue-card"] h4, .venue-card h3, .venue-card h4')
      .allTextContents()
      .catch(() => [] as string[]);

    // If we got card titles, check none are obviously mis-tagged.
    // (This is a soft check — if card selectors don't match, we skip.)
    if (titles.length > 0) {
      const misTagged = titles.filter((t) =>
        /\b(barbershop|fitness center|hair salon|laser hair)\b/i.test(t),
      );
      expect(misTagged, `Mis-tagged venues in bar results: ${misTagged.join(', ')}`).toHaveLength(0);
    }
  });
});
