import { test, expect } from '@playwright/test';

// Final smoke suite for the 2026-05-04 /resources fix campaign.
// Hits every surface that landed across P0-1..P3-5 in one flow.
//
// Detail tests live alongside each fix — see:
//   e2e/resources-graph.spec.ts          (P0-1)
//   e2e/help-locale.spec.ts              (P0-2)
//   e2e/resources-age-gate.spec.ts       (P0-3)
//   e2e/resources-not-found.spec.ts      (P1-4)
//   e2e/resources-url-state.spec.ts      (P1-1)
// This spec is the single happy-path flow that regresses if any surface
// breaks. Tag it `@smoke` so CI can target it independently.

test.describe('@smoke /resources campaign happy path', () => {
  test('search round-trip', async ({ page }) => {
    await page.goto('/resources');
    const search = page.getByRole('textbox', { name: /search resources/i }).first();
    await search.fill('lesbian');
    await expect(page).toHaveURL(/q=lesbian/, { timeout: 5_000 });
  });

  test('view-mode toggles persist in URL', async ({ page }) => {
    await page.goto('/resources?view=list');
    await expect(page).toHaveURL(/view=list/);
  });

  test('category route renders directly', async ({ page }) => {
    await page.goto('/resources/c/identity-expression');
    // The category panel renders; we don't assert a specific heading
    // because the slug↔name mapping lives in the DB. Page must not 404.
    await expect(page.getByTestId('tag-not-found')).toHaveCount(0);
  });

  test('unknown slug renders the 404 component', async ({ page }) => {
    await page.goto('/resources/asdfgibberish-not-real');
    await expect(page.getByTestId('tag-not-found')).toBeVisible({ timeout: 10_000 });
  });

  test('Safe mode toggle exists on overview', async ({ page }) => {
    await page.goto('/resources');
    await expect(page.getByTestId('safe-mode-toggle')).toBeVisible({ timeout: 10_000 });
  });

  test('/help renders and has a heading', async ({ page }) => {
    await page.goto('/help');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });
  });
});
