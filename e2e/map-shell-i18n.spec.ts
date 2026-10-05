import { test, expect, type Page } from '@playwright/test';
import { waitForAppReady } from './support/appReady';
import { neutralizeVisitorGeo } from './support/visitorGeo';

/**
 * Map chrome in a non-English locale, and in RTL.
 *
 * The view switcher and the line key are the two surfaces whose labels moved
 * with the subway rebrand: `map.view.*` replaced `map.lens.*`, and `map.lines.*`
 * is new. Both are rendered with `t(key, { defaultValue: … })`, so a missing
 * translation falls back to English and LOOKS fine in English — which is why
 * the assertion has to run in Arabic, where the fallback is visible.
 *
 * **`src/components/map/**` and this spec are in `e2e-i18n.yml`'s
 * `pull_request.paths`.** Without that, map RTL never runs on a PR and the only
 * signal is the nightly, which the `visitorGeo` header records as the place
 * specs fail for reasons the PR run cannot reproduce.
 */

test.describe.configure({ timeout: 120_000 });

/** The map needs the debug handle to prove it drew anything at all. */
async function openMap(page: Page, path: string) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('qg:debug:map', '1');
    } catch {
      /* denied storage is survivable */
    }
  });
  await neutralizeVisitorGeo(page);
  await page.goto(path);
  await waitForAppReady(page);
}

async function mapPresent(page: Page) {
  return page.evaluate(() => Boolean((window as unknown as { __qgMap?: unknown }).__qgMap));
}

test.describe('RTL map chrome', () => {
  test('the document direction really flips on /ar/map', async ({ page }) => {
    await openMap(page, '/ar/map');

    // POSITIVE CONTROL. `i18n.dir` and the `<html dir>` attribute are two
    // different things, and a spec that assumes RTL without checking reports
    // layout findings about an LTR page.
    const dir = await page.evaluate(() => document.documentElement.getAttribute('dir'));
    expect(dir, '/ar/map did not render RTL — every assertion below would be about an LTR page').toBe(
      'rtl',
    );

    expect(await mapPresent(page), 'no map on /ar/map').toBe(true);
    await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible();
  });

  test('no chrome escapes the viewport in RTL', async ({ page }) => {
    await openMap(page, '/ar/map');
    await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible();

    // The command bar is absolutely positioned. Mirrored, an `left-4` that was
    // not converted to a logical property lands off-screen — and the failure is
    // silent, because the element still exists in the DOM.
    //
    // ── A HORIZONTAL SCROLLER'S OFF-SCREEN CHILDREN ARE NOT A DEFECT ─────────
    // The naive "anything under `main` outside the viewport" predicate is
    // over-broad, and it is not an RTL check at all. Measured against prod
    // 2026-10-05, both directions, 1280px viewport:
    //
    //   /ar/map  immediate → 2 flagged, both `div.h-16 w-56 shrink-0
    //                        animate-pulse bg-muted` at left −40 / −272
    //   /map     immediate → THE SAME TWO, mirrored, at left 1096 / 1328
    //   /ar/map  after 8s  → 152 flagged, every one inside
    //                        `div.flex snap-x … overflow-x-auto`
    //                        with scrollWidth 8648 / clientWidth 960
    //
    // That last line is the departures board scrolling as designed, and the
    // identical LTR count is the proof it was never about mirroring. In both
    // directions `document.body.scrollWidth === clientWidth`, i.e. nothing
    // escapes the PAGE. The old predicate passed only on WHEN it sampled — the
    // rail's skeletons (`animate-pulse`, so by definition pre-data) are what it
    // caught, and it reported them as an RTL layout finding.
    //
    // THE TEST IS CLIPPING, NOT SCROLLABILITY, and that distinction is the
    // whole fix. A first draft excluded only `auto|scroll` ancestors and STILL
    // failed on those two skeletons, because their ancestor chain — measured,
    // not assumed — is:
    //
    //   div.flex gap-2 overflow-hidden p-2   [overflowX = hidden]   ← parent
    //   div.pointer-events-auto w-[min(960px,100%)]   [visible]
    //   …
    //   main.flex-1 …                        [overflowX = clip]
    //
    // The loading container is `overflow-hidden` where the loaded one is
    // `overflow-x-auto`. Either way the child is CLIPPED and cannot be seen
    // outside the viewport, which is the only thing this test is about.
    //
    // The walk stops AT `main` deliberately: `main` is itself `overflowX: clip`,
    // so including it would exclude every element under `main` and the check
    // would go permanently inert while still reading as a pass.
    const result = await page.evaluate(() => {
      const w = document.documentElement.clientWidth;
      const main = document.querySelector('main');
      const CLIPS = new Set(['auto', 'scroll', 'hidden', 'clip']);
      const isClipped = (el: Element) => {
        let p = el.parentElement;
        while (p && p !== main && p !== document.body) {
          if (CLIPS.has(getComputedStyle(p).overflowX)) return true;
          p = p.parentElement;
        }
        return false;
      };
      const scan = () => {
        const bad: string[] = [];
        for (const el of Array.from(document.querySelectorAll('main *'))) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          if (r.left >= -4 && r.right <= w + 4) continue;
          if (isClipped(el)) continue;
          bad.push(`${el.tagName.toLowerCase()}.${(el.className || '').toString().slice(0, 60)}`);
        }
        return bad.slice(0, 8);
      };

      const overflow = scan();

      // ── TWO-SIDED POSITIVE CONTROL ───────────────────────────────────────
      // After narrowing, "nothing is outside the viewport" is also what a
      // predicate that has stopped looking returns, so the check must be shown
      // to fire. One probe is not enough, and mutation testing proved it:
      // a probe appended straight to `main` has `main` as its parent, the walk
      // stops AT `main`, so the loop body never runs and the exclusion logic is
      // never exercised. Mutating `isClipped` to exclude EVERYTHING left that
      // control green while the scan had gone inert.
      //
      // So plant both outcomes, each one level deeper than `main`:
      //   open    — off-screen inside a non-clipping wrapper → MUST be caught
      //   clipped — the same box inside `overflow-x:hidden`  → MUST NOT be
      // Together they pin the predicate in both directions.
      // The offset must be bigger than the viewport, and the first draft of it
      // committed the very bug this test exists to catch. With `left:-500px`
      // the probe was measured at 740→940 inside a 1280px viewport and was
      // correctly NOT flagged: in RTL the wrapper lands flush at left 1240, so
      // a negative physical `left` moves the box INWARD. −5000 is off-screen
      // from either edge, so the control is direction-independent.
      const plant = (clip: boolean) => {
        const wrap = document.createElement('div');
        wrap.style.cssText = `position:relative;width:40px;height:8px;${clip ? 'overflow-x:hidden;' : ''}`;
        const inner = document.createElement('div');
        inner.style.cssText = 'position:absolute;left:-5000px;top:0;width:200px;height:20px';
        wrap.appendChild(inner);
        document.querySelector('main')?.appendChild(wrap);
        const found = scan().length > overflow.length;
        wrap.remove();
        return found;
      };
      const caughtOpen = plant(false);
      const ignoredClipped = !plant(true);

      // The page-overflow assertion is an ABSENCE, so its own control has to
      // force the condition: a wide unclipped box must move body.scrollWidth.
      const pageOverflows = document.body.scrollWidth > w + 4;
      const wide = document.createElement('div');
      wide.style.cssText = 'width:4000px;height:4px';
      document.body.appendChild(wide);
      const pageOverflowDetectable = document.body.scrollWidth > w + 4;
      wide.remove();

      return { overflow, caughtOpen, ignoredClipped, pageOverflows, pageOverflowDetectable };
    });

    expect(
      result.caughtOpen,
      'the scan did not catch a planted off-screen element — it is inert, so the empty result below would mean nothing',
    ).toBe(true);
    expect(
      result.ignoredClipped,
      'the scan flagged a CLIPPED element — the predicate is over-broad again and will fail on every scroller and skeleton',
    ).toBe(true);
    expect(
      result.pageOverflowDetectable,
      'a 4000px box did not move body.scrollWidth — the page-overflow assertion below cannot fail and proves nothing',
    ).toBe(true);
    expect(
      result.pageOverflows,
      'the PAGE scrolls horizontally in RTL — a physical `left` that was never converted to a logical property',
    ).toBe(false);
    expect(
      result.overflow,
      `chrome outside the viewport in RTL (excluding clipped descendants): ${result.overflow.join(' | ')}`,
    ).toEqual([]);
  });
});

test.describe('view labels are translated, not fallen back', () => {
  /**
   * `map.view.*` keys are URL STATE (`?view=heat`) and can never be
   * translated; only the LABELS move, and they are rendered with
   * `t(key, { defaultValue })` — so a missing translation falls back to
   * English and looks correct in English. This asserts the GERMAN strings are
   * PRESENT, which is a positive assertion and so cannot pass vacuously the
   * way "none of these is English" can.
   */
  const DE_VIEW_LABELS = ['Stationen', 'Dichte', 'Gebiete', 'Routen'];

  test('the view switcher renders German labels', async ({ page }) => {
    await openMap(page, '/de/map');

    /**
     * THE SWITCHER IS BEHIND A TRIGGER, and a first draft of this spec asserted
     * on `getByRole('radiogroup')` directly — which failed against prod with
     * "element(s) not found" and read exactly like a missing control. It lives
     * inside `MapControls`, mounted in a Popover (desktop) or a Sheet (mobile),
     * so it has to be OPENED first.
     *
     * The trigger is matched on /filter/i rather than on a translated string:
     * `map.bar.filters` exists in NO locale file (it is a bare `defaultValue`),
     * so it renders "Filters" in every language today — asserting a German
     * trigger label would fail for a reason this test is not about.
     */
    const trigger = page.getByRole('button', { name: /filter/i }).first();
    await expect(
      trigger,
      'no filters/controls trigger on /de/map — the view switcher is unreachable, ' +
        'so nothing below was measured',
    ).toBeVisible();
    await trigger.click();

    const group = page.getByRole('radiogroup').first();
    await expect(group).toBeVisible();

    // POSITIVE CONTROL: the group has to have options, or "the German labels
    // are present" is being asked of an empty list.
    const options = group.getByRole('radio');
    await expect(options.first()).toBeVisible();
    const count = await options.count();
    expect(count, 'the view switcher rendered no options — nothing was measured').toBeGreaterThan(1);

    const rendered = (await group.innerText()).replace(/\s+/g, ' ');
    const missing = DE_VIEW_LABELS.filter((l) => !rendered.includes(l));
    expect(
      missing,
      `these view labels are not German on /de/map: ${missing.join(', ')} ` +
        `(rendered: "${rendered}"). Add map.view.* to BOTH src/i18n/locales/de.json ` +
        'and public/locales/de.json — the bundled and the fetched copy have to move together.',
    ).toEqual([]);
  });
});
