import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { waitForAppReady } from './support/appReady';
import { REDUCED_MOTION, assertReducedMotion } from './support/reducedMotion';
import { dismissCookieBanner } from './support/consentBanner';
import { CONTRAST_HELPERS, INVISIBLE_FLOOR } from './support/contrast';

/**
 * The phone dock and the nav sheet — neither had any axe coverage.
 *
 * The dock sits OUTSIDE `header`, so the header-scoped sweep misses it; it is
 * `md:hidden`, so the public-route sweep at 1280 renders it not at all; and the
 * footer sweeps exclude it by omission. The sheet is absent from
 * `a11y-dialogs.spec.ts` despite that file's own header advertising focus-trap
 * coverage for "the most-used public dialogs" — its three cases are the search
 * popover, an event card and the consent banner.
 *
 * Both are ink surfaces with reversed type, which is the condition that
 * produced every contrast defect in this chrome so far.
 */

// `storageState` is ASKED for, not assumed. The chromium project carries the
// admin storageState whenever the E2E_ADMIN_* secrets resolve, so a spec that
// merely never signs in is signed IN — and the dock renders different
// destinations for a signed-in user. Same reasoning as mobile-bottom-nav.spec.
test.use({ ...REDUCED_MOTION, storageState: { cookies: [], origins: [] } });

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const PHONE = { width: 390, height: 844 };

test.describe('Mobile dock a11y', () => {
  test.setTimeout(120_000);

  test('no serious/critical violations in the dock', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('/');
    await waitForAppReady(page);
    await dismissCookieBanner(page);

    const dock = page.locator('nav.fixed');
    // POSITIVE CONTROL: the dock is `md:hidden`, so at any desktop width this
    // whole sweep would pass over nothing.
    await expect(dock, 'the dock did not render at 390px').toHaveCount(1);
    expect(await dock.locator('a').count(), 'the dock rendered no tabs').toBeGreaterThan(3);

    const results = await new AxeBuilder({ page })
      .include('nav.fixed')
      .disableRules(['link-in-text-block'])
      .withTags(WCAG_TAGS)
      .analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });

  test('the contribute button is not clipped by the island', async ({ page }) => {
    // The old raised control was cropped by 4px despite an intact hit target,
    // so what this test is FOR is the clip relationship, not a particular size.
    // It used to assert `btnH >= 80` and that pinned a transient: #4888
    // ("enlarge website icons") took the control 56px -> 80px, this spec was
    // written against that state in #4904, and #4912 ("revert the 64px floor")
    // deliberately put it back to `-mt-8 h-14 w-14` = 56px. The spec then failed
    // nightly for the revert having worked. The durable claim is the TAP TARGET
    // FLOOR, which both designs clear: `src/index.css` gives every bare <button>
    // min-height 44px, the dock's own comment specifies "48px targets", and
    // WCAG 2.5.8 AA asks 24px. 44 is this repo's own floor, so it holds whether
    // the control is 56px or 80px and still catches a genuine collapse.
    await page.setViewportSize(PHONE);
    await page.goto('/');
    await waitForAppReady(page);
    await dismissCookieBanner(page);

    const probe = await page.evaluate(() => {
      const ul = document.querySelector('nav.fixed ul');
      if (!ul) return null;
      const btn = ul.querySelector('button[aria-label]');
      if (!btn) return null;
      const u = ul.getBoundingClientRect();
      const b = btn.getBoundingClientRect();
      return {
        overflow: getComputedStyle(ul).overflow,
        hasDockClass: ul.classList.contains('island-dock'),
        // NOTE this is OVERHANG, not clipping. The contribute control is
        // deliberately raised above the row (`-mt-8`), so a non-zero value here
        // is the intended design; it only becomes a crop if the row's overflow
        // clips. Asserting `overhang === 0` is what made this test fail with the
        // self-contradicting message "clipped by visible overflow".
        overhang: Math.max(0, u.top - b.top) + Math.max(0, b.bottom - u.bottom),
        btnH: Math.round(b.height),
        // Positive control: the contribute button is the ONLY <button aria-label>
        // in the dock (every NavTab renders a LocalizedLink with a visible label
        // and no aria-label). If a sibling button ever lands before it, the
        // selector above would silently start measuring that one instead, so
        // assert the count rather than trusting first-match.
        labelledButtons: ul.querySelectorAll('button[aria-label]').length,
      };
    });

    expect(probe, 'could not find the dock or its contribute button').not.toBeNull();
    // The control is raised above the dock row (`-mt-8`), so what has to hold is
    // that the row does not CLIP it — `.island-dock` exists for exactly this and
    // its own CSS comment says "`overflow: visible` is the whole rule". Bare
    // `.island` is `overflow: hidden`, which is the crop this test was written
    // after. Overhang on its own is the intended raised design.
    expect(probe!.hasDockClass).toBe(true);
    expect(
      probe!.overflow,
      `dock overflow is "${probe!.overflow}"; bare .island is overflow:hidden and ` +
        `would crop the raised control — .island-dock must win`,
    ).toBe('visible');
    expect(
      probe!.labelledButtons,
      'expected exactly one aria-labelled button in the dock (the contribute control); ' +
        'a sibling button would make the height/clip probe measure the wrong element',
    ).toBe(1);
    expect(
      probe!.btnH,
      `contribute control is ${probe!.btnH}px, under this repo's 44px button floor`,
    ).toBeGreaterThanOrEqual(44);
    // Second half of the same invariant, so either failure mode is caught: if the
    // row ever goes back to a clipping overflow, nothing may overhang it.
    const clips = !['visible', 'clip'].includes(probe!.overflow) ? probe!.overhang : 0;
    expect(
      clips,
      `contribute control overhangs its row by ${probe!.overhang}px while overflow ` +
        `is "${probe!.overflow}", so ${probe!.overhang}px is cropped`,
    ).toBe(0);
  });
});

test.describe('Mobile nav sheet a11y', () => {
  test.setTimeout(120_000);

  async function openSheet(page: import('@playwright/test').Page) {
    await page.setViewportSize(PHONE);
    await page.goto('/venues');
    await waitForAppReady(page);
    // The consent banner is fixed to the bottom and INTERCEPTS taps on the
    // dock. Without this the click below times out at 120s on a tab that is
    // present, visible and correctly addressed — measured, three times.
    await dismissCookieBanner(page);
    // Explore opens the sheet on a plain tap (the long-press used to be the
    // only route, which is an undiscoverable gesture for primary navigation).
    await page.locator('nav.fixed a[href$="/search"]').click();
    const sheet = page.getByRole('dialog');
    await expect(sheet, 'the Explore tab did not open the sheet').toBeVisible();
    // `toBeVisible()` resolves as soon as the sheet is in the box model, which
    // is DURING its slide-and-fade — and a contrast sweep on an animating
    // element measures a frame nobody reads.
    //
    // This is the defect `support/reducedMotion.ts` already documents by
    // signature: axe reported the intent subtitles at 3.19:1 with
    // `#a3a39f on #50504d`, and NEITHER colour is a token in this system —
    // `--muted-foreground` ships `#545454`. Read directly once the sheet has
    // settled, the same text measures `rgb(84, 84, 84)` on
    // `rgb(226, 226, 218)`, a true 5.7:1. Those are `--muted-foreground` and
    // the sheet surface composited at partial opacity, exactly as that file
    // records for `/venues` ("4 runs in 6", `#787878` / `#7a7a79` / `#8d8d8b`).
    //
    // So: prove the emulation is live rather than trusting the declaration
    // (`test.use({ reducedMotion })` is a silent no-op in this Playwright, and
    // the helper exists because of it), then wait on the ANIMATIONS rather than
    // on a timeout. `getAnimations()` is the deterministic signal — a fixed
    // 1200ms wait still failed, because the sheet is a hand-rolled dialog whose
    // entrance is not covered by the stylesheet's reduced-motion kill switch.
    await assertReducedMotion(page);
    await sheet.locator('a').first().waitFor({ state: 'visible' });
    await page.waitForFunction(
      () => {
        const d = document.querySelector('[role="dialog"]');
        if (!d) return false;
        const running = d.getAnimations({ subtree: true }).filter((a) => a.playState === 'running');
        return running.length === 0 && getComputedStyle(d).opacity === '1';
      },
      undefined,
      { timeout: 15_000 },
    );
    return sheet;
  }

  test('no serious/critical violations in the open sheet', async ({ page }) => {
    const sheet = await openSheet(page);
    // Control: the sheet must have real content. An empty dialog passes axe.
    expect(await sheet.locator('a').count(), 'the sheet rendered no links').toBeGreaterThan(10);

    const results = await new AxeBuilder({ page })
      .include('[role="dialog"]')
      // `color-contrast` is disabled HERE ONLY, and replaced by a direct pixel
      // measurement in the next case rather than dropped.
      //
      // axe misreads this surface, and the evidence is that it reports two
      // colours that exist NOWHERE in the token system: `#a3a39f` on
      // `#50504d`, for 3.19:1. The shipped `--muted-foreground` is `#545454`
      // and the sheet surface is `rgb(226, 226, 218)`; read directly off the
      // settled page that text measures **5.7:1**. Investigated rather than
      // assumed — the opacity chain is `1` at every level with no running
      // animation, `assertReducedMotion` passes, and waiting on
      // `getAnimations()` to drain changes nothing, so it is not the mid-fade
      // sampling that `support/reducedMotion.ts` documents for /venues.
      //
      // Whatever axe is compositing against (most likely the dialog's own
      // scrim, which overlaps the text in its model), it is not what a reader
      // sees. The replacement check below paints the real layer stack into a
      // canvas and reads the pixel, which is also how the compact header's
      // genuine 1.00-ratio defect was confirmed.
      .disableRules(['link-in-text-block', 'color-contrast'])
      .withTags(WCAG_TAGS)
      .analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });

  test('no invisible control in the open sheet', async ({ page }) => {
    // The replacement for the disabled `color-contrast` above. Same helper the
    // header and footer sweeps use: paint the real background layer stack into
    // a 1x1 canvas, paint the text over it, read the pixel back. The browser
    // does the colour-space conversion and the alpha compositing, so it cannot
    // misread an `oklab()` value or a translucent layer — the two mistakes the
    // first hand-rolled version of this made.
    await openSheet(page);
    const bad = await page.evaluate(
      ({ helpers, floor }) => {
        eval(helpers);
        // @ts-expect-error - defined by the injected helper source.
        return __lowContrastControls(document.querySelector('[role="dialog"]'), floor);
      },
      { helpers: CONTRAST_HELPERS, floor: INVISIBLE_FLOOR },
    );
    expect(bad, 'the contrast probe did not find the open sheet').not.toBeNull();
    expect(
      bad,
      `Sheet controls under 3:1 against their own painted background.\n\n` +
        JSON.stringify(bad, null, 2),
    ).toEqual([]);
  });

  test('marks the current route in the sheet', async ({ page }) => {
    // `aria-current` was absent from EVERY row in this sheet — intents, the
    // destination grid and the legal rows — while the desktop nav, both footer
    // variants and the dock all set it. A reader on /venues who opened the
    // sheet got no indication of where they already were.
    const sheet = await openSheet(page);
    // The DESTINATION row for the current route, named explicitly rather than
    // counted. `toHaveCount(1)` was wrong: on /venues TWO rows legitimately
    // mark themselves — the `/venues` destination by exact path, and the
    // intent that CLAIMS /venues as one of its children (isIntentActive
    // matches on prefix, which is the whole point of the intent model). A
    // count is the wrong shape for a question about which row.
    await expect(
      sheet.locator('a[href$="/venues"][aria-current="page"]'),
      'the /venues row in the sheet is not marked as the current route',
    ).toHaveCount(1);
    // And at least one, which also catches the sheet rendering no rows at all.
    expect(await sheet.locator('a[aria-current="page"]').count()).toBeGreaterThan(0);
  });

  test('heading levels nest rather than flatten', async ({ page }) => {
    // The sheet's title is an h2 (from SheetTitle), then "What are you here
    // for?", "Browse everything" and EVERY cluster heading were all h3 — so
    // the clusters, which are subsections of "Browse everything", shared its
    // level. Axe's `heading-order` cannot see this: it only fires on a SKIPPED
    // level, and h3 → h3 skips nothing.
    await openSheet(page);
    const levels = await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"]')!;
      return Array.from(d.querySelectorAll('h1,h2,h3,h4,h5,h6')).map((h) => ({
        tag: h.tagName,
        text: (h.textContent || '').trim().slice(0, 32),
      }));
    });
    expect(levels.length, 'the sheet rendered no headings').toBeGreaterThan(3);
    // The cluster headings are h4. Asserting "some h4 exists" is enough to
    // catch a regression to a flat h3 list without pinning the exact cluster
    // set, which is config-driven and may legitimately change.
    expect(
      levels.some((h) => h.tag === 'H4'),
      `every heading in the sheet is at the same level — the cluster headings ` +
        `nest under "Browse everything" and should be h4.\n\n` +
        JSON.stringify(levels, null, 2),
    ).toBe(true);
  });
});
