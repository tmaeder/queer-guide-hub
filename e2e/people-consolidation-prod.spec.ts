import { expect, test } from '@playwright/test';

const ROUTE_READY_TIMEOUT = 15_000;

test.use({ serviceWorkers: 'block' });

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

const communityLinks = ['/hub/feed', '/hub/members', '/hub/friends', '/hub/groups'] as const;
const connectLinks = ['/hub/people', '/hub/dating', '/hub/travel', '/hub/nearby'] as const;
const personalLinks = ['/hub/messages', '/hub/plans', '/hub/saved'] as const;
const hubLinks = ['/hub', ...communityLinks, ...connectLinks, ...personalLinks] as const;

test('one Hub navigation exposes every community, connection, and personal destination', async ({
  page,
}) => {
  const response = await page.goto('/hub/people');
  expect(response?.ok()).toBe(true);

  const nav = page.getByRole('navigation', { name: 'Hub modules' });
  await expect(nav).toBeVisible({ timeout: ROUTE_READY_TIMEOUT });
  await expect(nav.locator('a[href$="/hub/people"]')).toHaveAttribute('aria-current', 'page');
  for (const href of hubLinks) await expect(nav.locator(`a[href$="${href}"]`)).toHaveCount(1);
  await expect(nav.locator('a[href$="/hub/saved"]')).toBeInViewport();
  await expect(nav.getByText('Home', { exact: true })).toBeVisible();
  await expect(nav.getByText('Community', { exact: true })).toBeVisible();
  await expect(nav.getByText('Connect', { exact: true })).toBeVisible();
  await expect(nav.getByText('Personal', { exact: true })).toBeVisible();
  await expect(page.getByTestId('people-connection-map')).toBeVisible({
    timeout: ROUTE_READY_TIMEOUT,
  });

  const mapModes = page.getByRole('tablist', { name: 'Map mode' });
  await expect(mapModes.getByRole('tab', { name: 'Community' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(mapModes.getByRole('tab', { name: /Cruising/ })).toHaveAttribute(
    'href',
    /\/hub\/dating\?panel=spots&layers=spots$/,
  );
});

test('community and connection routes keep the shared Hub wayfinding', async ({ page }) => {
  const anonymousRoutes = [...communityLinks, ...connectLinks].filter(
    (path) => path !== '/hub/dating',
  );
  for (const path of anonymousRoutes) {
    const response = await page.goto(path);
    expect(response?.ok(), `${path} should return a successful document`).toBe(true);
    await expect(page).toHaveURL(new RegExp(`${path.replaceAll('/', '\\/')}/?$`));
    const nav = page.getByRole('navigation', { name: 'Hub modules' });
    await expect(nav).toBeVisible({ timeout: ROUTE_READY_TIMEOUT });
    await expect(nav.locator(`a[href$="${path}"]`)).toHaveAttribute('aria-current', 'page');
  }
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

test('the public community feed lives inside the unified Hub', async ({ page }) => {
  const response = await page.goto('/hub/feed');
  expect(response?.ok()).toBe(true);
  await expect(page).toHaveURL(/\/hub\/feed\/?$/);

  const nav = page.getByRole('navigation', { name: 'Hub modules' });
  await expect(nav).toBeVisible({ timeout: ROUTE_READY_TIMEOUT });
  for (const href of hubLinks) await expect(nav.locator(`a[href$="${href}"]`)).toHaveCount(1);
  await expect(nav.getByRole('link', { name: 'Feed' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { level: 1, name: 'Feed' })).toBeVisible();
  await expect(page).toHaveTitle('Community Feed — What Queer People Are Posting | Queer Guide');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://queer.guide/hub/feed',
  );
  await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(0);
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
  await page.goto('/hub/people');
  await expect(page.getByRole('navigation', { name: 'Hub modules' })).toBeVisible({
    timeout: ROUTE_READY_TIMEOUT,
  });
  await expect(page.getByTestId('people-connection-map')).toBeVisible({
    timeout: ROUTE_READY_TIMEOUT,
  });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('public Hub community surfaces keep decorative chrome borderless', async ({ page }) => {
  const routes = {
    '/hub/people': 'Meet people',
    '/hub/members': 'Members',
    '/hub/groups': 'Community Groups',
  } as const;

  for (const [path, heading] of Object.entries(routes)) {
    await page.goto(path);
    const nav = page.getByRole('navigation', { name: 'Hub modules' });
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
