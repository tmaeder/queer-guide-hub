import { expect, test, type Page } from '@playwright/test';

const ROUTE_READY_TIMEOUT = 15_000;

// `storageState` is signed out by construction: `playwright.config.ts` hands the
// chromium project the admin storageState whenever E2E_ADMIN_* is set, as it is
// in the nightly, and this file asserts the signed-out gate on the private modules. Signed in there is no wall to
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

// Public discovery lives under /meet (e2e/meet-hub-ia-prod.spec.ts); none of it is a Hub tab.
const connectLinks = [
  '/meet',
  '/meet/groups',
  '/meet/dating',
  '/hub/people',
  '/hub/dating',
] as const;
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

test('private Hub modules keep their signed-out gate inside the shared shell', async ({ page }) => {
  for (const path of ['/hub', ...personalLinks]) {
    const response = await page.goto(path);
    expect(response?.ok(), `${path} should return a successful document`).toBe(true);

    const nav = page.getByRole('navigation', { name: 'Hub modules' });
    await expect(nav).toBeVisible({ timeout: ROUTE_READY_TIMEOUT });
    await expect(nav.locator(`a[href$="${path}"]`)).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('heading', { name: 'Your hub' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign In', exact: true })).toHaveAttribute(
      'href',
      /\/auth$/,
    );
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  }
});

test('the complete Hub navigation stays inside a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/meet');
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
