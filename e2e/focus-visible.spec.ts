import { test, expect } from '@playwright/test';

/**
 * Regression check for WCAG 2.4.7 Focus Visible on the trip planner surface.
 *
 * Asserts that keyboard focus produces a non-zero outline on interactive
 * elements (buttons, links). If global or component-level CSS silently
 * removes the focus ring again, this test will fail.
 *
 *   E2E_BASE_URL=https://queer.guide npx playwright test e2e/focus-visible.spec.ts
 */

async function outlineOf(locator: ReturnType<typeof import('@playwright/test').Page.prototype.locator>) {
  return locator.evaluate((el) => {
    const s = window.getComputedStyle(el as HTMLElement);
    return {
      outlineStyle: s.outlineStyle,
      outlineWidth: s.outlineWidth,
      outlineColor: s.outlineColor,
    };
  });
}

test.describe('Trip planner — focus visibility', () => {
  test('focused buttons on /trips have a visible outline', async ({ page }) => {
    await page.goto('/trips');
    await page.waitForLoadState('domcontentloaded');

    const button = page.locator('button, [role="button"], a').first();
    await expect(button).toBeVisible({ timeout: 15000 });

    // Tab until something receives :focus-visible. Playwright's page.keyboard
    // input counts as keyboard, so :focus-visible applies.
    await page.keyboard.press('Tab');
    const focused = page.locator(':focus-visible').first();
    await expect(focused).toBeVisible();

    const { outlineStyle, outlineWidth } = await outlineOf(focused);
    expect(outlineStyle).not.toBe('none');
    expect(parseFloat(outlineWidth)).toBeGreaterThan(0);
  });

  test('every visible button on /trips has a focus-visible outline', async ({ page }) => {
    await page.goto('/trips');
    await page.waitForLoadState('networkidle');

    const offenders = await page.evaluate(() => {
      const out: string[] = [];
      const buttons = Array.from(
        document.querySelectorAll<HTMLElement>('button, [role="button"]'),
      );
      for (const b of buttons.slice(0, 30)) {
        if (!b.offsetParent) continue;
        b.focus();
        // Force focus-visible heuristic: if browser didn't set it, skip.
        if (!b.matches(':focus-visible')) continue;
        const s = window.getComputedStyle(b);
        const width = parseFloat(s.outlineWidth);
        if (s.outlineStyle === 'none' || Number.isNaN(width) || width === 0) {
          out.push(
            `${b.tagName.toLowerCase()}${b.className ? '.' + b.className.split(' ')[0] : ''}`,
          );
        }
      }
      return out;
    });

    expect(offenders, `Elements missing focus outline: ${offenders.join(', ')}`).toEqual([]);
  });
});
