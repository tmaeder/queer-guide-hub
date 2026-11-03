import { test, expect } from '@playwright/test';
import { waitForAppReady } from './support/appReady';
import { REDUCED_MOTION } from './support/reducedMotion';

/**
 * The chrome at a non-default locale.
 *
 * No spec covered this. `help-language-switcher.spec.ts` round-trips DE → EN →
 * DE on `/help` and asserts only the URL, so nothing checked that the chrome
 * still FITS once its strings are translated — and the desktop intent row is
 * `overflow-hidden` (Header.tsx), which means an over-long set of labels does
 * not wrap, does not scroll and shows no indicator. It silently amputates the
 * trailing tabs.
 *
 * That is not a theoretical budget. `navigation.ts` set it as "≤11 chars — six
 * locales share one flex row", and there are ELEVEN locales, of which `ar`
 * "تعرّف على أشخاص" (15), `de` "Leute treffen" (13) and `es` "Conocer gente"
 * (13) already exceed it. The comment has been corrected; this is the part
 * that fails when the row actually overflows.
 *
 * Also covers the skip link, which was unguarded on the public shell: a grep
 * over `e2e/` finds the ADMIN skip link asserted and the public one at
 * `LayoutShell.tsx` asserted nowhere. Under RTL it additionally has to land on
 * the correct side, which a physical `left-2` got wrong.
 */

test.use(REDUCED_MOTION);

// de and es are the long-label Latin cases; ar is both long AND right-to-left,
// so it is the one that exercises the logical-property fixes as well.
const LOCALES = ['de', 'es', 'ar'] as const;

test.describe('Chrome fits at every locale', () => {
  test.setTimeout(180_000);

  for (const locale of LOCALES) {
    // 1280 is the `xl` threshold where all seven labels appear, i.e. the
    // tightest case. 1440 is the ordinary desktop width. Below `xl` the tabs
    // are icon-only and cannot overflow on label length.
    for (const width of [1280, 1440]) {
      test(`the intent row does not amputate tabs — ${locale} @ ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`/${locale}/tags/rights-by-country`);
        await waitForAppReady(page);

        const nav = page.getByRole('banner').locator('nav[aria-label]');
        await expect(nav).toHaveCount(1);
        // Control: all seven must be in the DOM. Overflow hides them visually
        // without removing them, so a count assertion alone cannot see the
        // defect — but a count under seven means something else broke and
        // every measurement below would be about the wrong row.
        await expect(nav.locator('a')).toHaveCount(7);

        const fit = await page.evaluate(() => {
          const el = document.querySelector('header[class*="site-header"] nav[aria-label]')!;
          const links = Array.from(el.querySelectorAll('a'));
          const navBox = el.getBoundingClientRect();
          // The clipping box is the nav's own overflow-hidden WRAPPER, so
          // measure each tab against what is actually visible rather than
          // against the viewport.
          const clip = (el.parentElement ?? el).getBoundingClientRect();
          return {
            scrollW: el.scrollWidth,
            clientW: el.clientWidth,
            navW: Math.round(navBox.width),
            clipW: Math.round(clip.width),
            // A tab whose right edge is past the clip's is cut off.
            clipped: links
              .map((a) => {
                const r = a.getBoundingClientRect();
                return {
                  label: a.getAttribute('aria-label'),
                  right: Math.round(r.right),
                  limit: Math.round(clip.right),
                };
              })
              .filter((t) => t.right > t.limit + 1),
          };
        });

        expect(fit.clientW, 'nav measured zero width').toBeGreaterThan(0);
        expect(
          fit.clipped,
          `Tabs clipped by the row's \`overflow-hidden\` at ${locale}/${width}px.\n` +
            `There is no wrap, no scroll and no indicator — they are simply gone.\n` +
            `Shorten the label, or give the row a different collapse.\n\n` +
            JSON.stringify(fit, null, 2),
        ).toEqual([]);
        expect(
          fit.scrollW,
          `nav overflows its box at ${locale}/${width}px (${fit.scrollW} > ${fit.clientW})`,
        ).toBeLessThanOrEqual(fit.clientW + 1);
      });
    }

    test(`the dock's tab labels stay inside their slots — ${locale} @ 320px`, async ({ page }) => {
      // 320px is the narrowest supported width and the dock's worst case: five
      // flex slots in `100vw - 2 * --island-inset`, so ~58px each, against a
      // fixed `h-14` with an `h-8` icon wrap above the label. `fr`
      // "Parcourir" and `ko` "둘러보기" wrapped to two lines and spilled out.
      await page.setViewportSize({ width: 320, height: 844 });
      await page.goto(`/${locale}/`);
      await waitForAppReady(page);

      const dock = page.locator('nav.fixed ul');
      await expect(dock).toHaveCount(1);
      const tabs = dock.locator('a');
      expect(await tabs.count(), 'the dock rendered no tabs').toBeGreaterThan(3);

      const overflowing = await page.evaluate(() => {
        const ul = document.querySelector('nav.fixed ul')!;
        const ulBox = ul.getBoundingClientRect();
        return Array.from(ul.querySelectorAll('a'))
          .map((a) => {
            const r = a.getBoundingClientRect();
            return {
              label: (a as HTMLElement).innerText.trim(),
              h: Math.round(r.height),
              bottomOverflow: Math.round(r.bottom - ulBox.bottom),
              scrollH: a.scrollHeight,
              clientH: a.clientHeight,
            };
          })
          .filter((t) => t.scrollH > t.clientH + 1);
      });

      expect(
        overflowing,
        `Dock labels taller than their slot at ${locale}/320px — the label wrapped\n` +
          `to a second line and spilled out of the fixed h-14 box.\n\n` +
          JSON.stringify(overflowing, null, 2),
      ).toEqual([]);
    });
  }
});

test.describe('Public skip link', () => {
  test.setTimeout(120_000);

  test('exists, reaches main, and sits on the correct side under RTL', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/ar/tags/rights-by-country');
    await waitForAppReady(page);

    // It is `sr-only` until focused, so it has to be addressed by its href.
    const skip = page.locator('a[href="#main-content"]');
    await expect(skip, 'the public shell renders no skip link').toHaveCount(1);

    // Control: the target it points at must exist, or the link is decoration.
    await expect(page.locator('#main-content')).toHaveCount(1);

    // Confirm the document really is RTL — otherwise the side assertion below
    // is testing LTR and passes for the wrong reason.
    const dir = await page.evaluate(() => document.documentElement.dir);
    expect(dir, 'ar did not set dir=rtl, so this is not an RTL test').toBe('rtl');

    await skip.focus();
    const box = await skip.boundingBox();
    expect(box, 'skip link did not become visible on focus').not.toBeNull();
    // Under RTL the link belongs on the RIGHT. `focus:left-2` put it on the
    // left — the one corner an RTL keyboard user is not looking at.
    const vw = page.viewportSize()!.width;
    expect(
      box!.x,
      `skip link at x=${box!.x} in a ${vw}px RTL viewport — it is pinned to the ` +
        `wrong side (use the logical \`start-*\`, not \`left-*\`)`,
    ).toBeGreaterThan(vw / 2);
  });
});
