import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test.describe('Header a11y', () => {
  test.setTimeout(120_000);

  test('no serious/critical violations inside header', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
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

  test('hamburger opens drawer dialog with proper aria state + 44+ target', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const hamburger = page.locator('button[aria-label="Open menu"]').first();
    await expect(hamburger).toBeVisible();

    const box = await hamburger.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

    await hamburger.click();
    await expect(hamburger).toHaveAttribute('aria-expanded', 'true');

    const dialog = page.getByRole('dialog', { name: /navigation/i });
    await expect(dialog).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
  });
});
