import { test, expect } from '@playwright/test';
import { gotoReady } from './support/appReady';

/**
 * The route-change focus effect (`AppRoutes`, src/routes.tsx) must fire on
 * navigation and ONLY on navigation.
 *
 * It used to be gated by a one-shot `isFirstRender` ref, which is not the same
 * question. Its dependency array also carries `t` (the announcement is
 * translated), and react-i18next hands back a fresh `t` identity once i18next
 * emits `initialized` — shortly AFTER first paint, by which point the one-shot
 * flag was already spent. So the effect ran on the very first page load and
 * called `main.focus({ preventScroll: false })`; focusing a `tabIndex={-1}`
 * <main> scrolls it into view, which moved the document ~127px with no user
 * input. `useCompactHeader` latches at >40px and only releases below 4px, so
 * the header collapsed to its one-line state and the entire desktop Intent
 * Router row disappeared — /venues and /people unreachable from desktop chrome
 * on every fresh load, the exact defect the Intent Router work was done to
 * prevent.
 *
 * Test 1 guards the cause (no self-scroll), test 2 guards that the fix did not
 * simply delete the a11y behaviour it was gating (WCAG 2.4.3).
 */

test.use({ reducedMotion: 'reduce' });

test('a fresh load does not scroll the document by itself', async ({ page }) => {
  await gotoReady(page, '/');
  // Generous settle: the regression appeared ~1s after first paint, once
  // i18next finished initialising. A short wait would pass on the broken build.
  await page.waitForTimeout(3000);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test.describe('route change focus', () => {
  test.skip(({ isMobile }) => !!isMobile, 'drives the desktop nav row');

  test('client-side navigation still moves focus to main', async ({ page }) => {
    await gotoReady(page, '/');
    const nav = page.locator('header nav[aria-label="Primary"]');
    await expect(nav).toBeVisible();

    await nav.locator('a').first().click();
    await expect(page).toHaveURL(/\/going-out$/);

    await expect
      .poll(() => page.evaluate(() => document.activeElement?.id ?? ''))
      .toBe('main-content');
  });
});
