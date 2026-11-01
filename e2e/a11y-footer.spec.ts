import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { waitForAppReady } from './support/appReady';
import { REDUCED_MOTION } from './support/reducedMotion';
import { CONTRAST_HELPERS, INVISIBLE_FLOOR } from './support/contrast';

/**
 * Footer a11y — the sweep that did not exist.
 *
 * As of 2026-10-10, TEN specs called `.exclude('footer')`
 * (`a11y-public-routes`, `a11y-events`, `a11y-event-detail`, `a11y-admin`,
 * `help-a11y`, `tags-a11y` twice, `going-out-subway`, `legal-pages`) and the
 * one header-scoped sweep used `.include('header')`. So **axe had never once
 * run over the footer** — the single most reversed surface in the product, a
 * full ink plate carrying ~30 links, three dropdown controls and a documented
 * history of ink-on-ink text (see the `[&_button]:text-background` comment in
 * Footer.tsx, which exists because two ~100px-wide switchers rendered
 * completely invisible on every page).
 *
 * Why its own file rather than dropping the excludes: those excludes were
 * added for a reason this spec does not know, and widening ten specs at once
 * is a change with ten blast radii. One scoped sweep is reversible.
 */

test.use(REDUCED_MOTION);

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

// axe takes a CSS selector, not a role, so the scope is spelled out. `>` from
// the app root: the site footer is a direct child of the shell's flex column
// wrapper, never nested inside page content.
const SITE_FOOTER_SEL = '#root footer';

// `/` carries the FULL footer (the ink plate). `/settings` carries the COMPACT
// paper variant — a different component branch entirely, with its own markup,
// its own nav landmark and no switchers, so sweeping only one proves nothing
// about the other. See COMPACT_FOOTER_ROOTS in src/lib/locale.ts.
const ROUTES = [
  { path: '/', variant: 'full' },
  { path: '/settings', variant: 'compact' },
] as const;

test.describe('Footer a11y', () => {
  test.setTimeout(120_000);

  for (const { path, variant } of ROUTES) {
    test(`no serious/critical violations in the ${variant} footer`, async ({ page }) => {
      await page.goto(path);
      await waitForAppReady(page);

      // By ROLE, not by tag. `page.locator('footer')` is ambiguous on any page
      // whose sections use their own <footer>, and the sibling header spec hit
      // exactly that (eight <header> elements on /tags/rights-by-country). Only a top-level
      // <footer> takes the `contentinfo` role.
      const footer = page.getByRole('contentinfo');

      // POSITIVE CONTROL. "No violations inside the footer" is trivially true
      // of a page with no footer — and `/settings` is behind an auth gate that
      // can redirect to `/auth`, where the compact footer may not render at
      // all. Without this, the whole assertion below is vacuous in exactly the
      // environment it ships to. If the footer is genuinely absent, say so and
      // skip rather than report a clean sweep.
      const count = await footer.count();
      test.skip(count === 0, `no <footer> on ${path} — nothing to sweep`);
      await expect(footer.first()).toBeAttached();
      await footer.first().scrollIntoViewIfNeeded();
      await expect(footer.first().getByRole('link').first()).toBeVisible();

      // Second control: the footer must have real CONTENT, not just exist. An
      // empty landmark also passes axe.
      const links = await footer.first().locator('a').count();
      expect(links, `the ${variant} footer rendered no links`).toBeGreaterThan(3);

      const results = await new AxeBuilder({ page })
        .include(SITE_FOOTER_SEL)
        // Same disable as the header sweep: the global `li a:not(.no-underline)`
        // rule underlines inline links, and axe flags footer nav links sitting
        // in a flex row as "link in text block" even though no prose surrounds
        // them.
        .disableRules(['link-in-text-block'])
        .withTags(WCAG_TAGS)
        .analyze();

      const blocking = results.violations.filter(
        (v) => v.impact === 'serious' || v.impact === 'critical',
      );
      expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
    });
  }

  test('the full footer carries no ink-on-ink control', async ({ page }) => {
    // Axe's colour-contrast rule does not reliably reach a control whose own
    // background is transparent over a parent fill, which is the exact shape
    // that made the compact header's Sign-in button invisible at a ratio of
    // 1.00. So this measures the composite directly, the same way that defect
    // was found — read the computed colour, read the nearest painted
    // background, and compute the ratio in the browser.
    await page.goto('/');
    await waitForAppReady(page);

    const footer = page.getByRole('contentinfo');
    await footer.scrollIntoViewIfNeeded();
    await expect(footer.getByRole('button', { name: 'Toggle theme' })).toBeVisible();
    // This subtree mounts after the initial readiness probe; settle its styles
    // and fonts before sampling the composited colours.
    await waitForAppReady(page);

    const bad = await page.evaluate(
      ({ helpers, floor }) => {
        // The helper is injected as source and eval'd in page scope: a
        // Playwright `evaluate` callback cannot close over an imported
        // function, and inlining it in three specs is how the oklab bug would
        // have survived in two of them.
        eval(helpers);
        const footers = Array.from(document.querySelectorAll('#root footer'));
        // @ts-expect-error — defined by the injected helper source.
        return __lowContrastControls(footers[footers.length - 1], floor);
      },
      { helpers: CONTRAST_HELPERS, floor: INVISIBLE_FLOOR },
    );

    // The probe must have FOUND the footer. A null return means the selector
    // missed, and "no low-contrast controls" would then be vacuously true.
    expect(bad, 'the contrast probe did not find the site footer').not.toBeNull();

    expect(
      bad,
      `Footer controls measuring under 3:1 against their own painted background.\n` +
        `A ratio near 1.00 means the control is invisible — the shape that made\n` +
        `the language and currency switchers disappear on every page, and the\n` +
        `compact header's Sign-in button after that.\n\n` +
        JSON.stringify(bad, null, 2),
    ).toEqual([]);
  });
});
