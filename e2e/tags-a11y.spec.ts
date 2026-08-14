import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { waitForAppReady } from './support/appReady';

/**
 * The glossary earns its own a11y spec.
 *
 * It is the densest interactive surface on the public site: a sticky filter
 * spine with a tablist, a 27-button alphabet rail, a taxonomy rail of route
 * links with expanders, and a virtualized result grid — none of which existed
 * before the 2026-08 rebuild, and none of which was covered by
 * `a11y-public-routes.spec.ts`.
 *
 * 320px is the WCAG 1.4.10 reflow width. If anything here overflows, it is the
 * alphabet rail (27 fixed-width buttons) or the horizontal taxonomy rail —
 * both are `overflow-x-auto` on purpose, and the assertion below is that the
 * PAGE does not scroll even though they do.
 */

test.use({ reducedMotion: 'reduce' });

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const VIEWPORTS = [
  { name: 'reflow 320', width: 320, height: 800 },
  { name: 'desktop 1280', width: 1280, height: 900 },
];

for (const vp of VIEWPORTS) {
  test(`/tags has no serious/critical axe violations at ${vp.name}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/tags');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('main h1', { timeout: 30_000 });
    await waitForAppReady(page);

    const results = await new AxeBuilder({ page })
      .exclude('footer')
      .disableRules(['link-in-text-block'])
      .withTags(WCAG_TAGS)
      .analyze();

    const blocking = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });
}

test('a tag page has no serious/critical axe violations', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/tags/lesbian');
  await page.waitForSelector('main h1', { timeout: 30_000 });
  await waitForAppReady(page);

  const results = await new AxeBuilder({ page })
    .exclude('footer')
    .disableRules(['link-in-text-block'])
    .withTags(WCAG_TAGS)
    .analyze();

  const blocking = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
});

test('/tags does not scroll horizontally at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/tags');
  await page.waitForSelector('main h1', { timeout: 30_000 });
  await waitForAppReady(page);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'horizontal overflow in px').toBeLessThanOrEqual(0);
});

test('exactly one h1', async ({ page }) => {
  await page.goto('/tags');
  await page.waitForSelector('main h1', { timeout: 30_000 });
  await expect(page.locator('main h1')).toHaveCount(1);
});

test('the sticky spine does not cover the first result after a letter jump', async ({ page }) => {
  // The filter spine is the page's only sticky element, pinned under the site
  // header. If its offset is wrong, the first row of results sits behind it —
  // which is exactly what a flat `top-16` produced on mobile.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/tags?letter=B');
  await page.waitForSelector('main h1', { timeout: 30_000 });
  await waitForAppReady(page);

  const firstCard = page.locator('a[href*="/tags/"]').last();
  await expect(firstCard).toBeVisible({ timeout: 15_000 });

  const covered = await firstCard.evaluate((el) => {
    const r = el.getBoundingClientRect();
    if (r.top < 0 || r.top > window.innerHeight) return false; // off-screen, not covered
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + 4);
    return !!hit && !el.contains(hit) && hit !== el;
  });
  expect(covered, 'a result is occluded by the sticky spine').toBe(false);
});
