import { test, expect } from '@playwright/test';

// Final smoke suite for the 2026-05-04 /resources fix campaign, updated for
// the Help-first /resources rework (fa32e121b): the pure overview now shows
// CrisisStrip + TopicHubGrid + OrgsDirectory and has NO filter bar — the
// search/filter bar only renders once a filter param (e.g. ?q=) is active.
//
// Detail tests live alongside each fix — see:
//   e2e/resources-graph.spec.ts          (P0-1)
//   e2e/help-locale.spec.ts              (P0-2)
//   e2e/resources-age-gate.spec.ts       (P0-3)
//   e2e/resources-not-found.spec.ts      (P1-4)
//   e2e/resources-url-state.spec.ts      (P1-1)

test.describe('@smoke /tags campaign happy path', () => {
  test('search round-trip', async ({ page }) => {
    await page.goto('/tags?q=les');
    const search = page.getByRole('textbox', { name: /search resources/i }).first();
    await expect(search).toBeVisible({ timeout: 15_000 });
    await search.fill('lesbian');
    await expect(page).toHaveURL(/q=lesbian/, { timeout: 5_000 });
  });

  test('view-mode toggles persist in URL', async ({ page }) => {
    await page.goto('/tags?view=list');
    await expect(page).toHaveURL(/view=list/);
  });

  test('category route renders directly', async ({ page }) => {
    await page.goto('/tags/c/identity-expression');
    await expect(page.getByTestId('tag-not-found')).toHaveCount(0);
  });

  test('unknown slug renders the 404 component', async ({ page }) => {
    await page.goto('/tags/asdfgibberish-not-real');
    // Not-found resolves after the tag list loads + the per-slug lookup returns
    // null; let the network settle so a cold prod load doesn't race the timeout.
    await page.waitForLoadState('networkidle').catch(() => {});
    await expect(page.getByTestId('tag-not-found')).toBeVisible({ timeout: 15_000 });
  });

  test('overview renders topic hubs', async ({ page }) => {
    await page.goto('/tags');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('a[href*="/tags/"]').first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test('/help renders and has a heading', async ({ page }) => {
    await page.goto('/help');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });
  });
});
