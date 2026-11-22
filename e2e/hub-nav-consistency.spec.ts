import { test, expect, type Page } from '@playwright/test';

// Check the shared Hub wayfinding across every Hub page, without credentials.
/** Registry order. Deliberately duplicated from src/config/hubModules.ts: a
 *  guard that imports the thing it guards passes when both move together.
 *  One flat row of the member's own pages; public discovery lives in Meet. */
const PILLS = ['Today', 'Plans', 'Saved', 'Friends', 'Feed', 'Progress'] as const;
/** The mobile sheet has no Today tile (the dock's Hub button links to /hub). */
const SHEET_PILLS = PILLS.slice(1);

/** Every Hub page. Signed out, each renders the bar above its sign-in gate. */
const ROUTES: ReadonlyArray<{ path: string; active: string; shell: string }> = [
  { path: '/hub', active: 'Today', shell: 'HubShell + AuthGate' },
  { path: '/hub/plans', active: 'Plans', shell: 'HubShell + AuthGate' },
  { path: '/hub/saved', active: 'Saved', shell: 'HubShell + AuthGate' },
  { path: '/hub/friends', active: 'Friends', shell: 'Community' },
  { path: '/hub/feed', active: 'Feed', shell: 'HubShell + AuthGate' },
  { path: '/hub/progress', active: 'Progress', shell: 'HubShell + AuthGate' },
];

/** The bar, located by its data hook rather than by aria-label: the label comes
 *  from i18n, and since the split no single link appears on every route. */
const NAV = 'nav[data-hub-nav]';

async function openHub(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  const nav = page.locator(NAV).first();
  await expect(nav, `${path}: the hub nav never rendered`).toBeVisible({ timeout: 20_000 });
  return nav;
}

// SIGNED OUT BY CONSTRUCTION, which the header above already states as the
// intent and which `playwright.config.ts` overrides: it hands the chromium
// project the admin storageState whenever E2E_ADMIN_* is set, as it is in the
// nightly. Both signed-in affordances this file says it does not cover then
// appear and break it — the Messages pill reads "Messages2" because the unread
// badge renders inside the anchor, so the pill-list assertion fails on every
// route, and `HubIdentityBlock` stops returning null, which is the premise the
// flush-left edge assertion rests on.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('hub nav', () => {
  test('the route list covers more than one shell', () => {
    // Positive control. Every test below loops over ROUTES, so an empty or
    // single-shell list would turn this file green while checking almost
    // nothing — the vacuous-sweep failure this repo keeps re-learning.
    expect(ROUTES.length).toBe(PILLS.length);
    expect(new Set(ROUTES.map((r) => r.shell)).size).toBeGreaterThanOrEqual(2);
  });

  for (const route of ROUTES) {
    test(`${route.path} (${route.shell}) shows the one Hub tab row`, async ({ page }) => {
      const nav = await openHub(page, route.path);

      // One row, same six tabs, same order, on every route.
      await expect(nav.locator('ul')).toHaveCount(1);
      const pills = (await nav.locator('[data-hub-modules] a').allTextContents()).map((s) =>
        s.trim(),
      );
      expect(pills, `${route.path}: tabs`).toEqual([...PILLS]);

      // Exactly one link is the current page, and it agrees with the URL.
      const current = await nav.locator('a[aria-current="page"]').allTextContents();
      expect(
        current.map((s) => s.trim()),
        `${route.path}: active page`,
      ).toEqual([route.active]);
    });
  }

  test('the desktop Hub rail aligns across routes', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const positions = [];
    for (const route of ROUTES) {
      const nav = await openHub(page, route.path);
      const position = await nav.evaluate((el) => {
        const breadcrumb = document.querySelector('.route-network-rail');
        if (!breadcrumb) throw new Error('Missing breadcrumb rail');
        const { x, top } = el.getBoundingClientRect();
        return { x, gap: top - breadcrumb.getBoundingClientRect().bottom };
      });
      positions.push({ path: route.path, ...position });
    }
    // Compare the rail itself because the active link can scroll its contents.
    const [first] = positions;
    for (const position of positions) {
      expect(Math.abs(position.x - first.x), position.path).toBeLessThanOrEqual(2);
      expect(Math.abs(position.gap - first.gap), position.path).toBeLessThanOrEqual(2);
    }
  });

  test('phones switch Hub sections from the bottom dock', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 780 });
    await page.addInitScript(() => {
      localStorage.setItem(
        'queer-guide-cookie-consent',
        JSON.stringify({
          version: '1.0',
          preferences: { necessary: true, functional: false, analytics: false, marketing: false },
        }),
      );
    });
    await page.goto('/going-out', { waitUntil: 'domcontentloaded' });
    const main = page.getByRole('main');
    const trigger = page.getByRole('navigation', { name: 'Navigation' }).getByRole('link', {
      name: 'Hub',
      exact: true,
    });
    const sheet = page.getByRole('dialog', { name: 'Hub' });
    const hubNav = sheet.getByRole('navigation', { name: 'Hub modules' });

    await expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    await trigger.click();
    await expect(page).toHaveURL(/\/going-out$/);
    await expect(hubNav.getByRole('link')).toHaveText(SHEET_PILLS);
    await expect(hubNav.locator('[aria-current]')).toHaveCount(0);
    expect(await sheet.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await hubNav.getByRole('link', { name: 'Feed' }).click();
    await expect(page).toHaveURL(/\/hub\/feed$/);
    await expect(sheet).toBeHidden();

    await expect(main.getByRole('navigation', { name: 'Hub modules' })).toHaveCount(0);
    await trigger.press('Enter');
    await expect(hubNav.getByRole('link', { name: 'Feed' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(trigger).toBeFocused();

    await trigger.click();
    await hubNav.getByRole('link', { name: 'Friends' }).click();
    await expect(page).toHaveURL(/\/hub\/friends$/);
    await expect(sheet).toBeHidden();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(main.getByRole('navigation', { name: 'Hub modules' })).toHaveCount(0);
  });

  test('the breadcrumb rail is the same height on every route', async ({ page }) => {
    const rails: Record<string, number | null> = {};
    for (const route of ROUTES) {
      await openHub(page, route.path);
      rails[route.path] = await page.evaluate(() => {
        const r = document.querySelector('.route-network-rail')?.getBoundingClientRect();
        return r ? Math.round(r.height) : null;
      });
    }
    const distinct = new Set(Object.values(rails));
    expect(distinct.size, `breadcrumb rail heights differ: ${JSON.stringify(rails)}`).toBe(1);
  });

  test('every hub route offers a reachable breadcrumb', async ({ page }) => {
    // The levelling above is only safe because the short variant was
    // decoration: RouteNetworkRail is `aria-hidden="true"` and its label is the
    // raw URL segment. If a future change sends hub routes back to it, the tops
    // go level again by losing the breadcrumb rather than gaining one — so
    // assert the breadcrumb itself, not just the geometry.
    for (const route of ROUTES) {
      await openHub(page, route.path);
      const crumbs = page.locator('nav[aria-label="Breadcrumb"] a');
      await expect(crumbs.first(), `${route.path}: no reachable breadcrumb`).toBeVisible({
        timeout: 15_000,
      });
      expect(
        await crumbs.count(),
        `${route.path}: breadcrumb has no climbable level`,
      ).toBeGreaterThanOrEqual(1);
    }
  });
});
