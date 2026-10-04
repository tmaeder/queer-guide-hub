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
    const overflow = await page.evaluate(() => {
      const w = document.documentElement.clientWidth;
      const bad: string[] = [];
      for (const el of Array.from(document.querySelectorAll('main *'))) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.left < -4 || r.right > w + 4) {
          bad.push(`${el.tagName.toLowerCase()}.${(el.className || '').toString().slice(0, 60)}`);
        }
      }
      return bad.slice(0, 8);
    });
    expect(overflow, `chrome outside the viewport in RTL: ${overflow.join(' | ')}`).toEqual([]);
  });
});

test.describe('view and line labels are translated, not fallen back', () => {
  /**
   * The keys are URL STATE (`?view=heat`), so they can never be translated;
   * only the LABELS move. These assertions therefore read the rendered control
   * and check it is not the English default.
   */
  const ENGLISH_VIEW_LABELS = ['Stations', 'Heat', 'Areas', 'Routes'];

  test('the view switcher is not showing English defaults in German', async ({ page }) => {
    await openMap(page, '/de/map');

    const group = page.getByRole('radiogroup').first();
    await expect(group).toBeVisible();

    // POSITIVE CONTROL: four options, so "none of them is English" cannot pass
    // on an empty group.
    const options = group.getByRole('radio');
    const count = await options.count();
    expect(count, 'the view switcher rendered no options — nothing was measured').toBeGreaterThan(1);

    const labels: string[] = [];
    for (let i = 0; i < count; i += 1) {
      labels.push(((await options.nth(i).getAttribute('aria-label')) ?? '').trim());
    }
    const untranslated = labels.filter((l) => ENGLISH_VIEW_LABELS.includes(l));
    expect(
      untranslated,
      `these view labels fell back to English in /de: ${untranslated.join(', ')} — ` +
        'add map.view.* to src/i18n/locales/de.json AND public/locales/de.json ' +
        '(the bundled and the fetched copy both have to move).',
    ).toEqual([]);
  });
});
