import { test, expect } from '@playwright/test';

// Public, read-only checks: never inherit the admin login from the setup project.
test.use({ storageState: { cookies: [], origins: [] }, serviceWorkers: 'block' });

for (const width of [412, 1280]) {
  test(`homepage discovery works at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('No straight lines here.');
    const hero = page.locator('.subway-hero');
    await expect(hero.locator('a[href="/map"]')).toBeVisible();
    await expect(hero.locator('a[href="/search"]')).toBeVisible();
    expect(await page.locator('html').evaluate((el) => el.scrollWidth)).toBeLessThanOrEqual(width);
    await testInfo.attach(`homepage-${width}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });

    // Scrolling must load the real content chunk, not strand the placeholder.
    await page
      .locator('.subway-hero')
      .evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().bottom + window.scrollY));
    await expect(
      page.getByRole('heading', { name: 'No ads. No data sales. Just riders.' }),
    ).toBeVisible({ timeout: 20_000 });
    await hero.locator('a[href="/search"]').click();
    await expect(page).toHaveURL(/\/search(?:\?|$)/);
    await expect(page.locator('main')).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('hero and navigation remain usable while the content chunk is pending', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 900 });
  let release: (() => void) | undefined;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requested = false;
  await page.route(/\/HomeContent-[^/]+\.js(?:\?.*)?$/, async (route) => {
    requested = true;
    await pending;
    await route.continue();
  });
  try {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('No straight lines here.');
    await page
      .locator('.subway-hero')
      .evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().bottom + window.scrollY));
    await expect.poll(() => requested).toBe(true);
    await expect(page.locator('.subway-hero a[href="/map"]')).toBeVisible();
  } finally {
    release?.();
    await page.unrouteAll({ behavior: 'wait' });
  }
});

test('localized homepage keeps its locale through navigation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/de');
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const map = page.locator('.subway-hero a[href="/de/map"]');
  await expect(map).toBeVisible();
  await page.locator('.subway-hero a[href="/de/search"]').click();
  await expect(page).toHaveURL(/\/de\/search(?:\?|$)/);
});

test('mobile consent and contribution controls load only when opened', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 844 });
  const scripts: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'script') scripts.push(request.url());
  });
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Cookie settings' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(
    scripts.filter((url) => /\/(?:framer-motion|react-server|ContributeDialog|CookiePreferencesDialog)-/.test(url)),
  ).toEqual([]);
  await page.getByRole('button', { name: 'Customize', exact: true }).click();
  const preferences = page.getByRole('dialog', { name: 'Cookie Preferences' });
  await expect(preferences).toBeVisible();
  await preferences.getByRole('button', { name: 'Necessary Only', exact: true }).click();
  await expect(preferences).toBeHidden();
  await expect(page.getByRole('region', { name: 'Cookie settings' })).toBeHidden();
  await page.getByRole('button', { name: 'Contribute to Queer Guide', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Contribute to Queer Guide' })).toBeVisible({
    timeout: 20000,
  });
});

test('news photos never request publisher image hosts before or after mirror lookup', async ({
  page,
}) => {
  const imageHosts = new Set<string>();
  page.on('request', (request) => {
    if (request.resourceType() === 'image') imageHosts.add(new URL(request.url()).hostname);
  });
  await page.goto('/news');
  await expect(page.locator('main').getByRole('heading').first()).toBeVisible();
  await expect(page.locator('main a[href^="/news/"]').first()).toBeVisible({ timeout: 20000 });
  for (let i = 0; i < 8; i++) {
    await page.mouse.wheel(0, 700);
    await page.waitForTimeout(250);
  }
  const ownHost = new URL(page.url()).hostname;
  expect([...imageHosts].filter((host) => ![ownHost, 'img.queer.guide'].includes(host))).toEqual(
    [],
  );
});
