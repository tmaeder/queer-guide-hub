import { expect, test, type Page } from '@playwright/test';

const ROUTE_READY_TIMEOUT = 15_000;

// `storageState` is signed out by construction: `playwright.config.ts` hands the
// chromium project the admin storageState whenever E2E_ADMIN_* is set, as it is
// in the nightly, and this file asserts the ANONYMOUS auth wall on /hub/dating
// and the signed-out gate on the private modules. Signed in there is no wall to
// find, so those cases failed every scheduled nightly.
test.use({ serviceWorkers: 'block', storageState: { cookies: [], origins: [] } });

/** Read-only production contract for the unified Hub. */
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

const connectLinks = ['/hub/people', '/hub/dating', '/hub/travel', '/hub/nearby'] as const;
/** The Hub is the member's own things only (docs/plans/2026-11-22-hub-meet-ia-design.md). */
const personalLinks = [
  '/hub/plans',
  '/hub/saved',
  '/hub/friends',
  '/hub/feed',
  '/hub/progress',
] as const;
const hubLinks = ['/hub', ...personalLinks] as const;

test('the Hub navigation is one row of personal destinations', async ({ page }) => {
  const response = await page.goto('/hub');
  expect(response?.ok()).toBe(true);

  const nav = page.getByRole('navigation', { name: 'Hub modules' });
  await expect(nav).toBeVisible({ timeout: ROUTE_READY_TIMEOUT });
  await expect(nav.locator('a')).toHaveCount(hubLinks.length);
  for (const href of hubLinks) await expect(nav.locator(`a[href$="${href}"]`)).toHaveCount(1);
  for (const href of connectLinks) await expect(nav.locator(`a[href$="${href}"]`)).toHaveCount(0);
});

test('dating is canonical under Hub and preserves the anonymous auth wall', async ({ page }) => {
  const response = await page.goto('/hub/dating');
  expect(response?.ok()).toBe(true);
  await expect(page).toHaveURL(/\/auth\/?$/, { timeout: ROUTE_READY_TIMEOUT });
});

test('legacy People and Community URLs resolve to canonical Hub destinations', async ({ page }) => {
  const redirects = {
    '/community': '/hub/feed',
    '/community/feed': '/hub/feed',
    '/feed': '/hub/feed',
    '/people': '/hub/people',
    '/people/feed': '/hub/feed',
    '/community/members': '/hub/members',
    '/community/friends': '/hub/friends',
    '/community/groups': '/hub/groups',
    '/people/members': '/hub/members',
    '/people/friends': '/hub/friends',
    '/people/groups': '/hub/groups',
    '/people/travel': '/hub/travel',
    '/people/nearby': '/hub/nearby',
    '/friends': '/hub/friends',
    '/groups': '/hub/groups',
    '/cruising': '/hub/dating',
    '/discover': '/hub/dating',
  } as const;

  for (const [legacy, canonical] of Object.entries(redirects)) {
    const response = await page.goto(legacy);
    expect(response?.ok(), `${legacy} should resolve successfully`).toBe(true);
    if (canonical === '/hub/dating') {
      await expect(page).toHaveURL(/\/auth\/?$/, { timeout: ROUTE_READY_TIMEOUT });
    } else {
      await expect(page).toHaveURL(new RegExp(`${canonical.replaceAll('/', '\\/')}/?$`), {
        timeout: ROUTE_READY_TIMEOUT,
      });
    }
  }
});

test('legacy detail routes retain locale, parameters, and query state', async ({ page }) => {
  await page.goto('/de/people/groups/group-42?tab=members');
  await expect(page).toHaveURL(/\/de\/hub\/groups\/group-42\?tab=members$/, {
    timeout: ROUTE_READY_TIMEOUT,
  });

  await page.goto('/people/dating/member-42?from=profile');
  await expect(page).toHaveURL(/\/hub\/dating\/member-42\?from=profile$/, {
    timeout: ROUTE_READY_TIMEOUT,
  });
});

test('private Hub modules keep their signed-out gate inside the shared shell', async ({ page }) => {
  for (const path of ['/hub', ...personalLinks]) {
    const response = await page.goto(path);
    expect(response?.ok(), `${path} should return a successful document`).toBe(true);

    const nav = page.getByRole('navigation', { name: 'Hub modules' });
    await expect(nav).toBeVisible({ timeout: ROUTE_READY_TIMEOUT });
    await expect(nav.locator(`a[href$="${path}"]`)).toHaveAttribute('aria-current', 'page');
    // /hub/friends is the Community page with its own gate heading.
    const gateHeading = path === '/hub/friends' ? 'Friends' : 'Your hub';
    await expect(page.getByRole('heading', { name: gateHeading })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign In', exact: true })).toHaveAttribute(
      'href',
      /\/auth$/,
    );
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  }
});

test('the complete Hub navigation stays inside a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/hub/people');
  // Phones get Hub navigation from the bottom dock's sheet (#5280), not an
  // in-page rail; hub-nav-consistency.spec.ts owns the dock behaviour itself.
  await expect(page.getByRole('main').getByRole('navigation', { name: 'Hub modules' })).toHaveCount(
    0,
  );
  const trigger = page
    .getByRole('navigation', { name: 'Navigation' })
    .getByRole('link', { name: 'Hub', exact: true });
  await trigger.click({ timeout: ROUTE_READY_TIMEOUT });
  const sheet = page.getByRole('dialog', { name: 'Hub' });
  const hubNav = sheet.getByRole('navigation', { name: 'Hub modules' });
  await expect(hubNav).toBeVisible({ timeout: ROUTE_READY_TIMEOUT });
  for (const href of personalLinks) {
    await expect(hubNav.locator(`a[href$="${href}"]`)).toHaveCount(1);
  }
  expect(await sheet.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();

  await revealConnectionMap(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('public Hub community surfaces keep decorative chrome borderless', async ({ page }) => {
  const routes = {
    '/hub/people': 'Meet',
    '/hub/members': 'Members',
    '/hub/groups': 'Community Groups',
  } as const;

  for (const [path, heading] of Object.entries(routes)) {
    await page.goto(path);
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
