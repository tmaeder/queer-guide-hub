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

  test('Tab navigation on /trips shows a visible outline at every step', async ({ page }) => {
    // Programmatic .focus() is unreliable for :focus-visible (Chromium quirk:
    // matches() returns true but computed style does not apply the rule).
    // Real keyboard Tab is the only valid way to assert focus-visible styling.
    await page.goto('/trips');
    await page.waitForLoadState('networkidle');

    const offenders: string[] = [];
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Tab');
      // MUI applies `transition: all` to its buttons, so outline-width
      // animates from 0→2px after focus. Wait for the transition to settle
      // (250ms covers MUI's 200ms transition with margin).
      await page.waitForTimeout(250);
      const result = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        if (!el.matches(':focus-visible')) return null;
        const s = window.getComputedStyle(el);
        const width = parseFloat(s.outlineWidth);
        return {
          ok: s.outlineStyle !== 'none' && width > 0,
          tag: el.tagName.toLowerCase(),
          cls: (el.className?.toString() ?? '').slice(0, 200),
          text: (el.textContent ?? '').slice(0, 60).trim(),
          aria: el.getAttribute('aria-label') ?? '',
          width: s.outlineWidth,
          style: s.outlineStyle,
        };
      });
      if (result && !result.ok) offenders.push(JSON.stringify(result));
    }
    expect(offenders, `Tab steps missing focus outline: ${offenders.join(', ')}`).toEqual([]);
  });
});
