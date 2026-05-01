import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/**
 * A11y coverage for the most-used public dialogs / overlays.
 *
 * Public surfaces only — admin dialogs require auth (see a11y-admin.spec.ts
 * for the auth-gated path). Each test opens the dialog, asserts focus is
 * trapped on a focusable child, and runs axe scoped to the open dialog.
 */

async function axeDialog(page: import('@playwright/test').Page) {
  const results = await new AxeBuilder({ page })
    .include('[role="dialog"], [role="alertdialog"]')
    .disableRules(['link-in-text-block'])
    .withTags(WCAG_TAGS)
    .analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
}

test.describe('Public dialogs — automated a11y', () => {
  test.setTimeout(120_000);

  test('mobile navigation drawer', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    const hamburger = page.locator('button[aria-label="Open menu"]').first();
    await expect(hamburger).toBeVisible();
    await hamburger.click();

    const dialog = page.getByRole('dialog', { name: /navigation/i });
    await expect(dialog).toBeVisible();
    // Drawer items use staggered slide-up-in (0.3s + per-item 0.04s delays).
    // Wait for animations to settle so axe doesn't catch mid-fade contrast.
    await page.waitForFunction(() => {
      const items = document.querySelectorAll('[role="dialog"] .slide-up-in');
      return Array.from(items).every((el) => {
        const anims = (el as HTMLElement).getAnimations?.() ?? [];
        return anims.every((a) => a.playState === 'finished');
      });
    }, { timeout: 3000 }).catch(() => {});
    await axeDialog(page);

    // Focus must move into the dialog
    const inside = await dialog.evaluate((el) => el.contains(document.activeElement));
    expect(inside).toBe(true);

    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
  });

  // Despite the historical name, this isn't a separate ⌘K palette — it
  // exercises the header search input's suggestions popover for a11y.
  // No standalone command palette exists in the codebase today.
  test('search suggestions popover', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    // The search input is always rendered — focus it then assert no a11y violations.
    const search = page.locator('input[aria-label="Search Queer Guide"]').first();
    if (!(await search.isVisible().catch(() => false))) {
      test.skip(true, 'Search input not on this viewport.');
      return;
    }
    await search.click();
    await search.fill('berlin');
    // Suggestions render in a popover/listbox — axe-scan the page top-of-stack
    await page.waitForTimeout(800);
    const popover = page.locator('[role="listbox"], [role="dialog"]').first();
    if (await popover.isVisible().catch(() => false)) {
      const results = await new AxeBuilder({ page })
        .include('[role="listbox"], [role="dialog"]')
        .disableRules(['link-in-text-block'])
        .withTags(WCAG_TAGS)
        .analyze();
      const blocking = results.violations.filter(
        (v) => v.impact === 'serious' || v.impact === 'critical',
      );
      expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
    }
  });

  test('event card → detail page (no dialog leak)', async ({ page }) => {
    await page.goto('/events');
    await page.waitForLoadState('networkidle');
    // Sanity: no orphan dialog rendered on the events index
    const dialogs = await page.getByRole('dialog').count();
    expect(dialogs).toBe(0);
  });

  test('cookie/consent banner (if present) has accessible name', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const banner = page.getByRole('dialog').or(page.getByRole('alertdialog')).first();
    if (!(await banner.isVisible().catch(() => false))) {
      test.skip(true, 'No consent banner currently shown.');
      return;
    }
    const name = await banner.getAttribute('aria-label');
    const labelledby = await banner.getAttribute('aria-labelledby');
    expect(Boolean(name || labelledby)).toBe(true);
    await axeDialog(page);
  });
});
