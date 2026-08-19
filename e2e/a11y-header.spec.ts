import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { waitForAppReady } from './support/appReady';

// Route transitions fade opacity 0->1 (LayoutShell motion.div). axe blends that
// opacity into computed text color, flagging transient mid-fade frames as contrast
// failures. Emulate reduced motion (LayoutShell skips the fade) so axe analyzes the
// settled DOM - the same render real reduced-motion users get.
test.use({ reducedMotion: 'reduce' });

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test.describe('Header a11y', () => {
  test.setTimeout(120_000);

  test('no serious/critical violations inside header', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
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

test.describe('Search a11y wiring', () => {
  test.setTimeout(120_000);

  test('the open search panel IS the element the input points at', async ({ page }) => {
    // `aria-controls` and the panel id are set in two different places, so they
    // can drift apart silently — a rebase once dropped the prop on the panel
    // and left the homepage hero input referencing an id that did not exist.
    // A dangling aria-controls is invisible in every visual check.
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await page.locator('main h1').waitFor({ timeout: 30_000 });
    await page.waitForTimeout(1000);

    // Addressed by its own mount, never `.first()`: opening a search MOVES its
    // field into the modal, so document order changes mid-test and `.first()`
    // silently switches to the other mount.
    const input = page.locator('input[aria-controls="qg-search-listbox-hero"]');
    await input.click();
    await input.fill('berlin');
    await page.waitForTimeout(2500);

    await expect(page.locator('#qg-search-listbox-hero')).toHaveCount(1);

    // And no id is claimed twice, whichever mounts are on the page.
    const ids = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[id^="qg-search-listbox"]')).map((e) => e.id),
    );
    expect(new Set(ids).size).toBe(ids.length);
  });
});

test.describe('Header mobile a11y', () => {
  test.setTimeout(120_000);

  test('no hamburger drawer; search opens the discovery hub', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await waitForAppReady(page);

    // The legacy hamburger drawer is gone. Nothing collapses into a menu.
    await expect(page.locator('button[aria-label="Open menu"]')).toHaveCount(0);

    // Below `sm` the search FIELD is replaced by a search ICON — design panel
    // 06 ("Mobile, 390px": brand, search, avatar). This is not the legacy
    // "Open search" toggle, which expanded a second inline field in the bar:
    // the icon opens the same full-screen hub the field opened, and exactly
    // one `role="combobox"` exists at a time either way.
    await expect(page.locator('button[aria-label="Open search"]')).toHaveCount(0);
    const trigger = page.getByRole('button', { name: 'Search', exact: true });
    await expect(trigger).toBeVisible();
    // A field at this width squeezed to 14.7px and failed axe `target-size`.
    const box = await trigger.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(24);
    expect(box!.height).toBeGreaterThanOrEqual(24);
    // React hydration / Suspense boundaries can lag before handlers bind.
    await page.waitForTimeout(500);

    await trigger.click();
    const search = page.locator('input[role="combobox"]').first();
    await expect(search).toBeVisible();
    await expect(search).toBeFocused();
    await expect(search).toHaveAttribute('aria-expanded', 'true');

    // The full-screen hub exposes the prominent mode switcher.
    const modes = page.getByRole('radiogroup', { name: /mode/i });
    await expect(modes).toBeVisible();
    expect(await modes.getByRole('radio').count()).toBe(6);

    await page.getByRole('button', { name: /close search/i }).click();
    await expect(modes).toBeHidden();
  });
});
