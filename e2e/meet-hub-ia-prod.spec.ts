import { expect, test, type Page } from '@playwright/test';

const ROUTE_READY_TIMEOUT = 15_000;

// `storageState` is signed out by construction: `playwright.config.ts` hands the
// chromium project the admin storageState whenever E2E_ADMIN_* is set, as it is
// in the nightly, and this file asserts the ANONYMOUS auth wall on /meet/dating
// and the signed-out gate on the private modules. Signed in there is no wall to
// find, so those cases failed every scheduled nightly.
test.use({ serviceWorkers: 'block', storageState: { cookies: [], origins: [] } });

/** Read-only production contract for the public Meet section. The Hub side is
 *  e2e/people-consolidation-prod.spec.ts. */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'queer-guide-cookie-consent',
      JSON.stringify({
        version: '1.0',
        preferences: {
          necessary: true,
          functional: true,
          analytics: false,
          marketing: false,
        },
        timestamp: new Date().toISOString(),
      }),
    );
    localStorage.setItem('qg_safe_mode', 'on');
  });
});

/** The connection map mounts inside a DeferredSection (rootMargin 200px), so it
 *  only exists once its section is scrolled near the viewport. */
async function revealConnectionMap(page: Page) {
  await page.locator('#map').scrollIntoViewIfNeeded({ timeout: ROUTE_READY_TIMEOUT });
  await expect(page.getByTestId('people-connection-map')).toBeVisible({
    timeout: ROUTE_READY_TIMEOUT,
  });
}

/** Meet = public discovery under /meet; Hub = personal pages under /hub
 *  (docs/plans/2026-11-22-hub-meet-ia-design.md). Nothing appears in both. */
const meetLinks = [
  '/meet',
  '/meet/members',
  '/meet/groups',
  '/meet/travel',
  '/meet/nearby',
] as const;
const meetNav = (page: Page) => page.getByRole('navigation', { name: 'Meet', exact: true });

test('/meet is a public page with one Meet tab row and no Dating tab for visitors', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const response = await page.goto('/meet');
  expect(response?.ok()).toBe(true);
  await expect(page).toHaveURL(/\/meet\/?$/);

  const nav = meetNav(page).first();
  await expect(nav).toBeVisible({ timeout: ROUTE_READY_TIMEOUT });
  await expect(nav.locator('a[href$="/meet"]')).toHaveAttribute('aria-current', 'page');
  for (const href of meetLinks) await expect(nav.locator(`a[href$="${href}"]`)).toHaveCount(1);
  await expect(nav.locator('a[href*="/meet/dating"]')).toHaveCount(0);
  await expect(page.locator('nav[data-hub-nav]')).toHaveCount(0);

  // The header Meet intent is lit on desktop.
  await expect(
    page.getByRole('banner').locator('a[href$="/meet"][aria-current]').first(),
  ).toBeVisible({ timeout: ROUTE_READY_TIMEOUT });
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://queer.guide/meet',
  );
  await revealConnectionMap(page);
  const mapModes = page.getByRole('tablist', { name: 'Map mode' });
  await expect(mapModes.getByRole('tab', { name: /Cruising/ })).toHaveAttribute(
    'href',
    /\/meet\/dating\?panel=spots&layers=spots$/,
  );
});

test('every Meet page keeps the Meet tab row and lights its own tab', async ({ page }) => {
  for (const path of meetLinks) {
    const response = await page.goto(path);
    expect(response?.ok(), `${path} should return a successful document`).toBe(true);
    await expect(page).toHaveURL(new RegExp(`${path.replaceAll('/', '\\/')}/?$`));
    const nav = meetNav(page).first();
    await expect(nav).toBeVisible({ timeout: ROUTE_READY_TIMEOUT });
    await expect(nav.locator(`a[href$="${path}"]`)).toHaveAttribute('aria-current', 'page');
  }
});

test('Meet dating keeps the anonymous auth wall', async ({ page }) => {
  const response = await page.goto('/meet/dating');
  expect(response?.ok()).toBe(true);
  await expect(page).toHaveURL(/\/auth\/?$/, { timeout: ROUTE_READY_TIMEOUT });
});

test('old Hub and legacy discovery URLs resolve to /meet', async ({ page }) => {
  const redirects = {
    '/hub/people': '/meet',
    '/hub/members': '/meet/members',
    '/hub/groups': '/meet/groups',
    '/hub/travel': '/meet/travel',
    '/hub/nearby': '/meet/nearby',
    '/people': '/meet',
    '/community/members': '/meet/members',
    '/community/groups': '/meet/groups',
    '/people/groups': '/meet/groups',
    '/groups': '/meet/groups',
    '/community': '/hub/feed',
    '/friends': '/hub/friends',
  } as const;
  for (const [legacy, canonical] of Object.entries(redirects)) {
    const response = await page.goto(legacy);
    expect(response?.ok(), `${legacy} should resolve successfully`).toBe(true);
    await expect(page).toHaveURL(new RegExp(`${canonical.replaceAll('/', '\\/')}/?$`), {
      timeout: ROUTE_READY_TIMEOUT,
    });
  }
  for (const legacy of ['/hub/dating', '/cruising', '/discover']) {
    await page.goto(legacy);
    await expect(page).toHaveURL(/\/auth\/?$/, { timeout: ROUTE_READY_TIMEOUT });
  }
});

test('legacy detail and invite routes retain locale, parameters, and query state', async ({
  page,
}) => {
  await page.goto('/de/hub/groups/group-42?tab=members');
  await expect(page).toHaveURL(/\/de\/meet\/groups\/group-42\?tab=members$/, {
    timeout: ROUTE_READY_TIMEOUT,
  });
  await page.goto('/people/dating/member-42?from=profile');
  await expect(page).toHaveURL(/\/(meet\/dating\/member-42\?from=profile|auth)/, {
    timeout: ROUTE_READY_TIMEOUT,
  });
  // A group invite link from an old email still opens the invite page.
  await page.goto('/hub/groups/invite/not-a-real-token');
  await expect(page).toHaveURL(/\/meet\/groups\/invite\/not-a-real-token$/, {
    timeout: ROUTE_READY_TIMEOUT,
  });
});

test('on phones /meet lights Explore, not Hub, and the Hub sheet holds no Meet pages', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/meet/groups');
  const dock = page.getByRole('navigation', { name: 'Navigation' });
  await expect(dock.getByRole('link', { name: 'Explore', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
    { timeout: ROUTE_READY_TIMEOUT },
  );
  const trigger = dock.getByRole('link', { name: 'Hub', exact: true });
  await expect(trigger).not.toHaveAttribute('aria-current', 'page');
  await trigger.click({ timeout: ROUTE_READY_TIMEOUT });
  const sheet = page.getByRole('dialog', { name: 'Hub' });
  await expect(sheet.locator('a[href$="/hub/plans"]')).toHaveCount(1, {
    timeout: ROUTE_READY_TIMEOUT,
  });
  await expect(sheet.locator('a[href*="/meet"]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('public Meet surfaces keep decorative chrome borderless', async ({ page }) => {
  const routes = {
    '/meet': 'Meet',
    '/meet/members': 'Members',
    '/meet/groups': 'Community Groups',
  } as const;

  for (const [path, heading] of Object.entries(routes)) {
    await page.goto(path);
    const nav = meetNav(page).first();
    await expect(nav).toBeVisible({ timeout: ROUTE_READY_TIMEOUT });
    await expect(nav.locator(`a[href$="${path}"]`)).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible({
      timeout: ROUTE_READY_TIMEOUT,
    });

    const visibleHairlines = await page.locator('main .border-border-hairline').evaluateAll(
      (nodes) =>
        nodes.filter((node) => {
          const style = getComputedStyle(node);
          const rect = node.getBoundingClientRect();
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            [
              style.borderTopWidth,
              style.borderRightWidth,
              style.borderBottomWidth,
              style.borderLeftWidth,
            ].some((width) => width !== '0px')
          );
        }).length,
    );
    expect(visibleHairlines, `${path} should not render hairline rules`).toBe(0);
  }
});
