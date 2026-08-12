import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { waitForAppReady } from './support/appReady';

/**
 * /help earns its own a11y spec.
 *
 * It was NOT in `a11y-public-routes.spec.ts`'s ROUTES list, so the only
 * automated accessibility coverage it ever had was the CI axe sweep in
 * `scripts/a11y-routes.mjs` — which runs on a schedule, not on the PR that
 * breaks it. This is the crisis page; a serious violation here is the one that
 * matters most and was the least likely to be caught before merge.
 *
 * 320px is deliberate and not decorative: it is the WCAG 1.4.10 reflow width,
 * and the triage panel is the densest block on the site (an ink-flooded card
 * carrying an h1, a country control, a phone CTA and a four-up channel grid).
 * If anything on this page overflows, it overflows there.
 */

test.use({ reducedMotion: 'reduce' });

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const VIEWPORTS = [
  { name: 'reflow 320', width: 320, height: 800 },
  { name: 'desktop 1280', width: 1280, height: 900 },
];

for (const vp of VIEWPORTS) {
  test(`/help has no serious/critical axe violations at ${vp.name}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/help');
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

test('/help does not scroll horizontally at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/help');
  await page.waitForSelector('main h1', { timeout: 30_000 });
  await waitForAppReady(page);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'horizontal overflow in px').toBeLessThanOrEqual(0);
});

test('the emergency numbers survive a failed i18n load', async ({ page }) => {
  // The life-safety guarantee: EmergencyBand and the triage panel render from
  // inline English defaults, so a dead locale bundle must not blank them. This
  // is the regression that inline defaults exist to prevent.
  await page.route('**/locales/*.json', (r) => r.abort());
  await page.goto('/help');
  await page.waitForSelector('main h1', { timeout: 30_000 });

  await expect(page.getByRole('heading', { name: /in acute danger/i })).toBeVisible();
  await expect(page.locator('a[href="tel:112"]').first()).toBeVisible();
});
