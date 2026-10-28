import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { waitForAppReady } from './support/appReady';
import { REDUCED_MOTION } from './support/reducedMotion';
import { CONTRAST_HELPERS, INVISIBLE_FLOOR } from './support/contrast';

/**
 * The compact ink header — the state no spec had ever entered.
 *
 * Every axe sweep and every screenshot baseline in this suite loads a page and
 * asserts at `scrollY = 0`. The header's compact branch only renders past the
 * scroll threshold, so it was unswept by construction, and two real defects
 * lived there undisturbed until they were measured by hand on prod
 * (2026-10-10, at 1100px and 1440px):
 *
 *   1. The signed-out "Sign in" button computed `color: rgb(17,17,17)` on a
 *      `rgb(17,17,17)` plate — a contrast ratio of **1.00**, i.e. literally
 *      invisible, at both 1100px and 1440px. Confirmed by this spec against
 *      prod before the fix: exactly **one** control, which is what the
 *      original hand measurement found.
 *
 *      An intermediate draft of this comment claimed EIGHT, and that number
 *      came from a broken probe rather than from the page — the first version
 *      parsed colours with a regex and so misread every Tailwind v4
 *      `oklab(… / α)` value as near-black. See `support/contrast.ts`. The
 *      hand measurement was right and the first automation was wrong, which is
 *      the opposite of the usual direction and worth remembering.
 *   2. `nav[aria-label]` inside the bar contained **zero** links — the whole
 *      Intent Router was absent from the collapsed state.
 *
 * SCOPE, stated because it is easy to over-read: the contrast case measures
 * TEXT against its background. It cannot see the other half of the same
 * defect — `variant="default"` is `bg-foreground`, so the contribute button
 * was an ink plate on an ink bar with a perfectly legible paper label and no
 * silhouette at all. That one is caught by the `reversed` variant existing,
 * not by this probe.
 *
 * Both are the same shape: a state that only exists after an interaction, and
 * a suite that never performs it. So this spec's first job is to prove it
 * ACTUALLY REACHED that state — see the control in `enterCompact`.
 *
 * What this spec also did was REFUTE a third claimed defect. The hook was
 * said to latch so hard that the bar never re-expanded at `scrollY: 0`; the
 * "expands again" case below PASSED against prod on the unfixed code, so that
 * claim was false and the comment asserting it has been corrected. A guard
 * that only ever confirms what you already believe is not pulling its weight.
 */

test.use(REDUCED_MOTION);

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

// Above the `enter` edge of useCompactHeader's hysteresis band (80px) with
// room to spare, and far enough that no sub-pixel scroll restoration lands us
// back inside the band.
const PAST_THRESHOLD = 600;

/**
 * The site header, addressed by ROLE rather than by tag.
 *
 * `page.locator('header')` is ambiguous and the first run of this spec proved
 * it: `/rights` carries EIGHT `<header>` elements, because every page section
 * uses one for its own heading row. Playwright's strict mode rejected the
 * match, and the failure surfaced as "the header never entered its compact
 * state" — a message about the wrong thing entirely, which is exactly how a
 * selector bug gets mistaken for the defect under test. Only a top-level
 * `<header>` takes the `banner` role, so this resolves to exactly one.
 *
 * The in-page `evaluate` blocks below scope on `header[class*="site-header"]`
 * for the same reason — `document.querySelector('header')` would have returned
 * whichever section header came first in the DOM.
 */
const siteHeader = (page: import('@playwright/test').Page) => page.getByRole('banner');

/** The axe include selector, scoped the same way. */
const SITE_HEADER_SEL = 'header[class*="site-header"]';

/**
 * Scroll into the compact state and PROVE it, rather than assuming the scroll
 * took. A spec that merely scrolls and then asserts "no violations" reports a
 * clean sweep when the state was never entered — which is how this surface
 * stayed unmeasured.
 */
async function enterCompact(page: import('@playwright/test').Page) {
  // App chrome can mount before the rights data replaces its short loader.
  // Wait for the real page before asking the browser to scroll it.
  await page
    .getByRole('heading', { name: 'LGBTQ+ rights and safety, country by country', exact: true })
    .waitFor({ state: 'visible', timeout: 15_000 });
  // ScrollManager deliberately abandons its landing-position settle only on a
  // real wheel/touch/key gesture. A programmatic scroll races that settle and
  // can be put back at zero, never exercising the compact header at all.
  await page.mouse.wheel(0, PAST_THRESHOLD);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(80);
  const header = siteHeader(page);
  await expect(
    header,
    'the header never entered its compact state — every assertion after this would be vacuous',
  ).toHaveClass(/island-ink/);
  // Contrast is a settled-state assertion: wait for actual finite colour
  // transitions rather than sampling an intermediate frame or sleeping 600ms.
  await page.waitForFunction(
    (selector) => {
      const node = document.querySelector(selector);
      return (
        node &&
        node
          .getAnimations({ subtree: true })
          .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
          .every((animation) => !animation.pending && animation.playState !== 'running')
      );
    },
    SITE_HEADER_SEL,
    { timeout: 5_000 },
  );
  return header;
}

test.describe('Header, compact ink state', () => {
  test.setTimeout(120_000);

  // 1100 sits in the 768–1279 band where the tabs are icon-only, which is the
  // width the nav-loss and the 40px-target defects were both measured at.
  // 1440 is the ordinary desktop case. A single viewport would have missed the
  // band entirely, since `intent-nav.spec.ts` runs at exactly 1280.
  for (const width of [1100, 1440]) {
    test(`keeps the primary nav at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/rights');
      await waitForAppReady(page);

      const header = await enterCompact(page);

      const nav = header.locator('nav[aria-label]');
      await expect(nav, 'the compact bar dropped its nav landmark').toHaveCount(1);
      // Seven intents. Asserting ">0" would pass against a bar that kept one.
      await expect(nav.locator('a')).toHaveCount(7);

      // And the reader's position survives the collapse: the active route is
      // still marked. This is the signal the dropped active-intent chip used
      // to carry, now carried by the tab's own rule.
      await expect(header.locator('a[aria-current="page"]')).toHaveCount(1);
    });

    test(`has no invisible control at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/rights');
      await waitForAppReady(page);
      await enterCompact(page);

      // Measured from `getComputedStyle`, never against a hardcoded hex. The
      // plate colour is a token and the variants are tokens; pinning either as
      // a literal here would make this spec a second source for both.
      const bad = await page.evaluate(
        ({ helpers, floor, sel }) => {
          eval(helpers);
          // @ts-expect-error — defined by the injected helper source.
          return __lowContrastControls(document.querySelector(sel), floor);
        },
        { helpers: CONTRAST_HELPERS, floor: INVISIBLE_FLOOR, sel: SITE_HEADER_SEL },
      );

      expect(bad, 'the contrast probe did not find the site header').not.toBeNull();

      expect(
        bad,
        `Controls under 3:1 against the ink plate. A ratio of 1.00 is the\n` +
          `original defect: \`ghost\` is \`text-foreground\`, so on ink its label\n` +
          `was the same colour as the bar. Use \`reversed\` / \`ghostReversed\`.\n\n` +
          JSON.stringify(bad, null, 2),
      ).toEqual([]);
    });
  }

  test('no serious/critical axe violations in the compact bar', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/rights');
    await waitForAppReady(page);
    await enterCompact(page);

    const results = await new AxeBuilder({ page })
      // Scoped, not bare `header` — the page has eight of those.
      .include(SITE_HEADER_SEL)
      .disableRules(['link-in-text-block'])
      .withTags(WCAG_TAGS)
      .analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });

  test('expands again at the top of the page', async ({ page }) => {
    // This one is a REGRESSION GUARD, not a repair, and it earned its place by
    // disproving the defect it was written for. The hook was claimed to latch
    // so hard that the bar never re-expanded at `scrollY: 0` — this case was
    // run against prod on the unfixed, latching code and PASSED, so the real
    // gesture does deliver an event at rest and the claim was wrong.
    //
    // It stays because the property is worth holding: whatever the hook does
    // internally, the bar must come back at the top of the page. It uses the
    // real gesture and never a synthetic `scroll` event, which is the only
    // form that can tell the two apart.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/rights');
    await waitForAppReady(page);

    const header = await enterCompact(page);

    await page.mouse.wheel(0, -PAST_THRESHOLD * 2);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);

    await expect(
      header,
      'the bar stayed collapsed back at the top of the page (the latch defect)',
    ).not.toHaveClass(/island-ink/);
    await expect(header.locator('nav[aria-label] a')).toHaveCount(7);
  });

  // Every width at which the compact state exists, not just the narrowest.
  // This ran at 768 only and caught the regression there — but the bar was
  // 64px at 1100 and 1440 too, so a single viewport happened to be enough and
  // would not have been if the overflow had been width-dependent.
  for (const width of [768, 1100, 1440]) {
    test(`the bar never grows past its own pinned-height token at ${width}px`, async ({ page }) => {
      // Two ways this breaks, and the second one bit the change that added
      // this guard. (1) The row was `flex-wrap`: a wrapped row grows past the
      // token, which silently re-introduces the sticky-bar overlap index.css
      // documents as a fixed production bug (header bottom 82 vs bar top 64 at
      // 1440). (2) The tab row carried into the collapse is `h-12`, and the
      // row's `py-2` put it at 48 + 16 = **64px against a 60px token** —
      // measured here, on prod, the moment that change deployed.
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/rights');
      await waitForAppReady(page);
      await enterCompact(page);

      const { actual, token } = await page.evaluate(() => {
        const el = document.querySelector('header[class*="site-header"]')!;
        const probe = document.createElement('div');
        probe.style.cssText = 'position:fixed;visibility:hidden;height:var(--header-pinned-h)';
        document.body.appendChild(probe);
        const token = probe.getBoundingClientRect().height;
        probe.remove();
        return { actual: el.getBoundingClientRect().height, token };
      });

      // The token must resolve — a zero would make the comparison meaningless.
      expect(token, 'could not resolve --header-pinned-h').toBeGreaterThan(0);
      // 1px of tolerance for sub-pixel layout, nothing more. A wrap would add
      // a whole row and the padding bug added four.
      expect(actual, `compact bar is ${actual}px against a ${token}px token`).toBeLessThanOrEqual(
        token + 1,
      );
    });
  }
});

test.describe('Header intent tabs, text navigation at 1100px', () => {
  test.setTimeout(120_000);

  test('every tab is 44×44 and named by more than its title', async ({ page }) => {
    // Measured on prod at 1100px before the fix: all 7 tabs were 40px wide and
    // every `innerText` was `""`, leaving `title` as the only name source.
    //
    // `innerText`, NOT `textContent` — and that distinction is the whole
    // reason this assertion exists in this shape. `textContent` INCLUDES
    // `display:none` descendants, so a check written with it reads the hidden
    // label and reports the tab as named. The first attempt at measuring this
    // did exactly that and had to be thrown away.
    await page.setViewportSize({ width: 1100, height: 900 });
    await page.goto('/rights');
    await waitForAppReady(page);

    const tabs = page.getByRole('banner').locator('nav[aria-label] a');
    await expect(tabs).toHaveCount(7);

    const report = await page.evaluate(() => {
      const links = Array.from(
        document.querySelectorAll('header[class*="site-header"] nav[aria-label] a'),
      );
      return links.map((a) => {
        const r = a.getBoundingClientRect();
        return {
          title: a.getAttribute('title'),
          ariaLabel: a.getAttribute('aria-label'),
          innerText: (a as HTMLElement).innerText.trim(),
          w: Math.round(r.width),
          h: Math.round(r.height),
        };
      });
    });

    // Navigation is intentionally text-only at this width. Each destination
    // must have a visible name as well as its 44px minimum interactive target.
    expect(
      report.every((t) => t.innerText.length > 0),
      'text navigation must label every destination at 1100px',
    ).toBe(true);

    const unnamed = report.filter((t) => !t.ariaLabel && !t.innerText);
    expect(
      unnamed,
      `Tabs named only by \`title\`. \`title\` is last-resort in accname, is not\n` +
        `surfaced to touch, and is suppressed by some AT configurations.\n\n` +
        JSON.stringify(unnamed, null, 2),
    ).toEqual([]);

    const small = report.filter((t) => t.w < 44 || t.h < 44);
    expect(
      small,
      `Tabs under the project's 44px target. The base rule in index.css only\n` +
        `applies its 44px min-WIDTH arm to \`button[aria-label]\`, so these\n` +
        `anchors match neither arm and need \`w-11\` explicitly.\n\n` +
        JSON.stringify(small, null, 2),
    ).toEqual([]);
  });
});
