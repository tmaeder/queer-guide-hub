import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test.describe('Header a11y', () => {
  test.setTimeout(120_000);

  test('no serious/critical violations inside header', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const results = await new AxeBuilder({ page })
      .include('header')
      .disableRules(['link-in-text-block'])
      .withTags(WCAG_TAGS)
      .analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });
});

test.describe('Header mobile a11y', () => {
  test.setTimeout(120_000);

  test('no hamburger drawer; search opens the discovery hub', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // The legacy hamburger drawer + search-toggle are gone.
    await expect(page.locator('button[aria-label="Open menu"]')).toHaveCount(0);
    await expect(page.locator('button[aria-label="Open search"]')).toHaveCount(0);

    // The search bar is the always-visible mobile discovery affordance.
    const search = page.locator('input[role="combobox"]').first();
    await expect(search).toBeVisible();
    // React hydration / Suspense boundaries can lag before handlers bind.
    await page.waitForTimeout(500);

    await search.click();
    await expect(search).toHaveAttribute('aria-expanded', 'true');

    // The full-screen hub exposes the prominent mode switcher.
    const modes = page.getByRole('radiogroup', { name: /mode/i });
    await expect(modes).toBeVisible();
    expect(await modes.getByRole('radio').count()).toBe(6);

    await page.getByRole('button', { name: /close search/i }).click();
    await expect(modes).toBeHidden();
  });
});
