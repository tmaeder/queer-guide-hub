import { expect, test } from '@playwright/test';

/** Read-only production contract for the unified People area. */
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

const peopleLinks = [
  '/people/feed',
  '/people/members',
  '/people/friends',
  '/people/groups',
  '/people/dating',
  '/people/travel',
  '/people/nearby',
] as const;

test('the People hub exposes every community and connection destination', async ({ page }) => {
  const response = await page.goto('/people');
  expect(response?.ok()).toBe(true);

  const nav = page.getByRole('navigation', { name: 'People sections' });
  await expect(nav).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Meet people' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  for (const href of peopleLinks) await expect(nav.locator(`a[href$="${href}"]`)).toHaveCount(1);
  await expect(page.getByTestId('people-connection-map')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open full map' })).toHaveAttribute('href', /\/map$/);
});

test('community and connection routes keep the shared People wayfinding', async ({ page }) => {
  const anonymousRoutes = peopleLinks.filter((path) => path !== '/people/dating');
  for (const path of anonymousRoutes) {
    const response = await page.goto(path);
    expect(response?.ok(), `${path} should return a successful document`).toBe(true);
    await expect(page).toHaveURL(new RegExp(`${path.replaceAll('/', '\\/')}/?$`));
    const nav = page.getByRole('navigation', { name: 'People sections' });
    await expect(nav).toBeVisible();
    await expect(nav.locator(`a[href$="${path}"]`)).toHaveAttribute('aria-current', 'page');
  }
});

test('dating is canonical under People and preserves the anonymous auth wall', async ({ page }) => {
  const response = await page.goto('/people/dating');
  expect(response?.ok()).toBe(true);
  await expect(page).toHaveURL(/\/auth\/?$/);
});

test('legacy community URLs resolve to their canonical People destinations', async ({ page }) => {
  const redirects = {
    '/community': '/people/feed',
    '/community/members': '/people/members',
    '/friends': '/people/friends',
    '/groups': '/people/groups',
    '/cruising': '/people/dating',
    '/discover': '/people/dating',
  } as const;
  for (const [legacy, canonical] of Object.entries(redirects)) {
    const response = await page.goto(legacy);
    expect(response?.ok(), `${legacy} should resolve successfully`).toBe(true);
    if (canonical === '/people/dating') await expect(page).toHaveURL(/\/auth\/?$/);
    else await expect(page).toHaveURL(new RegExp(`${canonical.replaceAll('/', '\\/')}/?$`));
  }
});

test('the People navigation stays inside a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/people');
  await expect(page.getByRole('navigation', { name: 'People sections' })).toBeVisible();
  await expect(page.getByTestId('people-connection-map')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
