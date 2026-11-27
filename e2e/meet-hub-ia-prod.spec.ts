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

/** Meet = public discovery under /meet; Hub = personal pages under /hub
 *  (docs/plans/2026-11-22-hub-meet-ia-design.md). Nothing appears in both. */
const meetLinks = ['/meet', '/meet/members', '/meet/groups'] as const;
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
  await expect(nav.locator('ul')).toHaveCount(1);
  await expect(nav.locator('a')).toHaveCount(meetLinks.length);
  await expect(nav.locator('a[aria-current="page"]')).toHaveCount(1);
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
  await expect(page.getByRole('heading', { level: 1, name: 'Find queer company.' })).toBeVisible();
  await expect(page.getByRole('form', { name: 'Find company', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Find meetups', exact: true })).toBeVisible();
  await expect(page.locator('#map, #members, #spaces, #regulars')).toHaveCount(0);
});

test('every Meet page keeps the Meet tab row and lights its own tab', async ({ page }) => {
  for (const path of meetLinks) {
    const response = await page.goto(path);
    expect(response?.ok(), `${path} should return a successful document`).toBe(true);
    await expect(page).toHaveURL(new RegExp(`${path.replaceAll('/', '\\/')}/?$`));
    const nav = meetNav(page).first();
    await expect(nav).toBeVisible({ timeout: ROUTE_READY_TIMEOUT });
    await expect(nav.locator(`a[href$="${path}"]`)).toHaveAttribute('aria-current', 'page');
    await expect(nav.locator('a[aria-current="page"]')).toHaveCount(1);
  }
});

test('Meet dating keeps the anonymous auth wall', async ({ page }) => {
  const response = await page.goto('/meet/dating');
  expect(response?.ok()).toBe(true);
  // Since #5826 the wall is a sign-in prompt inside Meet, not a redirect to /auth.
  await expect(page).toHaveURL(/\/meet\/dating\/?$/, { timeout: ROUTE_READY_TIMEOUT });
  await expect(page.getByRole('heading', { level: 1, name: 'Dating' })).toBeVisible({
    timeout: ROUTE_READY_TIMEOUT,
  });
  await expect(page.getByRole('main').getByRole('link', { name: /^Sign in$/ })).toBeVisible();
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
  await page.goto('/cruising');
  await expect(page).toHaveURL(/\/meet\/nearby\?layers=spots$/, { timeout: ROUTE_READY_TIMEOUT });
  for (const legacy of ['/hub/dating', '/discover']) {
    await page.goto(legacy);
    // Both land on /meet/dating, which signs visitors in from inside Meet (#5826).
    await expect(page).toHaveURL(/\/meet\/dating\/?$/, { timeout: ROUTE_READY_TIMEOUT });
    await expect(page.getByRole('main').getByRole('link', { name: /^Sign in$/ })).toBeVisible({
      timeout: ROUTE_READY_TIMEOUT,
    });
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
  await expect(page).toHaveURL(/\/(user\/member-42\/dating\?from=profile|auth)/, {
    timeout: ROUTE_READY_TIMEOUT,
  });
  // A group invite link from an old email still opens the invite page.
  await page.goto('/hub/groups/invite/not-a-real-token');
  await expect(page).toHaveURL(/\/meet\/groups\/invite\/not-a-real-token$/, {
    timeout: ROUTE_READY_TIMEOUT,
  });
});

test('on phones /meet lights Browse, not Hub, and the Hub sheet holds no Meet pages', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/meet/groups');
  // Dock tabs by href, never label: the Browse tab (fallback label "Explore") is i18n text
  // (see e2e/mobile-bottom-nav.spec.ts).
  const dock = page.locator('nav.fixed[aria-label="Navigation"]');
  await expect(dock.locator('a[href="/search"]')).toHaveAttribute('aria-current', 'page', {
    timeout: ROUTE_READY_TIMEOUT,
  });
  const trigger = dock.locator('a[href="/hub"]');
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
    '/meet': 'Find queer company.',
    '/meet/members': 'People',
    '/meet/groups': 'Groups',
  } as const;

  for (const [path, heading] of Object.entries(routes)) {
    await page.goto(path);
    const nav = meetNav(page).first();
    await expect(nav).toBeVisible({ timeout: ROUTE_READY_TIMEOUT });
    await expect(nav.locator(`a[href$="${path}"]`)).toHaveAttribute('aria-current', 'page');
    await expect(nav.locator('a[aria-current="page"]')).toHaveCount(1);
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
            style.visibility !== 'hidden' &&
            style.opacity !== '0' &&
            [
              [style.borderTopWidth, style.borderTopColor],
              [style.borderRightWidth, style.borderRightColor],
              [style.borderBottomWidth, style.borderBottomColor],
              [style.borderLeftWidth, style.borderLeftColor],
            ].some(
              ([width, color]) =>
                width !== '0px' && color !== 'transparent' && color !== 'rgba(0, 0, 0, 0)',
            )
          );
        }).length,
    );
    expect(visibleHairlines, `${path} should not render hairline rules`).toBe(0);
  }
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`Meet travel entry and People live map preserve explicit context at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/meet/travel?city=zurich&activity=coffee');
    await expect(page.getByRole('heading', { level: 1, name: 'Find queer company.' })).toBeVisible({
      timeout: ROUTE_READY_TIMEOUT,
    });
    const nav = meetNav(page).first();
    await expect(nav.locator('ul')).toHaveCount(1);
    await expect(nav.locator('a[aria-current="page"]')).toHaveCount(1);
    await expect(nav.getByRole('link', { name: 'Meetups', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await nav.getByRole('link', { name: 'People', exact: true }).click();
    await expect(page).toHaveURL(/\/meet\/members\?city=zurich&activity=coffee$/);
    await expect(page.getByRole('heading', { level: 1, name: 'People', exact: true })).toBeVisible({
      timeout: ROUTE_READY_TIMEOUT,
    });
    await expect(page.getByRole('link', { name: 'Live map', exact: true })).toHaveAttribute(
      'href',
      '/meet/nearby?city=zurich&activity=coffee',
    );
    await expect(page.locator('h1')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
  });
}
