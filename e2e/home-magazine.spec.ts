import { test, expect, type Page } from '@playwright/test';
import { REDUCED_MOTION } from './support/reducedMotion';

test.use({ ...REDUCED_MOTION, storageState: { cookies: [], origins: [] } });

async function openHome(page: Page) {
  await page.goto('/');
  await expect(page.locator('main h1')).toHaveText('Find queer places and events');
  const consent = page.getByRole('button', { name: 'Necessary Only', exact: true });
  if (await consent.isVisible()) await consent.click();
}

for (const width of [390, 1280]) {
  test(`discovery is visible and usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await openHome(page);
    const hero = page.locator('.subway-hero');
    await expect(hero.getByRole('combobox')).toBeVisible();
    for (const [name, path] of [
      ['Browse places', '/venues'],
      ['Find events', '/events'],
      ['Open the map', '/map'],
    ]) {
      const link = hero.getByRole('link', { name });
      await expect(link).toBeInViewport();
      await expect(link).toHaveAttribute('href', path);
    }
    expect(await page.locator('html').evaluate((el) => el.scrollWidth)).toBeLessThanOrEqual(width);

    await hero.getByRole('combobox').click();
    const search = page.getByRole('combobox', { name: /search/i });
    await search.fill('Berlin');
    await search.press('Enter');
    await expect(page).toHaveURL(/\/search\?.*q=Berlin/i);
  });
}

test('homepage prioritizes listings and city guides while secondary routes stay reachable', async ({
  page,
}) => {
  await openHome(page);
  const listings = page.getByRole('heading', { name: /^places and events/i });
  const cities = page.getByRole('region', { name: 'City guides' });
  const browse = page.getByRole('region', { name: 'More from Queer Guide' });
  await expect(listings).toBeVisible();
  await expect(cities.getByRole('link', { name: 'All cities' })).toHaveAttribute('href', '/cities');
  await expect(browse).toBeVisible();
  expect(await page.locator('main h2').allTextContents()).toEqual([
    expect.stringMatching(/^Places and events/),
    'City guides',
    'More from Queer Guide',
    'No ads. No data sales. Just riders.',
  ]);
  for (const path of [
    '/travel',
    '/hub/people',
    '/tags/rights-by-country',
    '/news',
    '/history',
    '/tags',
    '/marketplace',
  ]) {
    await expect(browse.locator(`a[href="${path}"]`)).toBeVisible();
  }
});

test('homepage requests do not generate PostgREST client errors', async ({ page }) => {
  const failures: string[] = [];
  page.on('response', (response) => {
    if (
      response.url().includes('/rest/v1/') &&
      response.status() >= 400 &&
      response.status() < 500
    ) {
      failures.push(`${response.status()} ${response.url()}`);
    }
  });
  await openHome(page);
  await expect(page.locator('main a[href*="/city/"]').first()).toBeVisible({ timeout: 20_000 });
  expect(failures).toEqual([]);
});

test('Arabic discovery fits a narrow viewport and keeps localized destinations', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  const hero = page.locator('.subway-hero');
  await expect(hero.getByRole('heading', { level: 1 })).toHaveText(
    'اعثر على أماكن وفعاليات كويرية',
  );
  await expect(hero.getByRole('combobox')).toHaveAttribute(
    'placeholder',
    'ابحث عن أماكن وفعاليات…',
  );
  const map = hero.getByRole('link', { name: 'افتح الخريطة' });
  await expect(map).toBeInViewport();
  await expect(map).toHaveAttribute('href', '/ar/map');
  expect(await page.locator('html').evaluate((el) => el.scrollWidth)).toBeLessThanOrEqual(320);
});

test('city selection recovers from a stale recent and can be reset', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'qg_recently_viewed',
      JSON.stringify([
        { type: 'city', slug: 'missing-city-e2e', title: 'Removed city', ts: Date.now() },
        { type: 'city', slug: 'berlin', title: 'Berlin', ts: Date.now() },
      ]),
    );
  });
  await page.route(
    (url) =>
      url.pathname.endsWith('/rest/v1/cities') &&
      url.searchParams.get('slug') === 'eq.missing-city-e2e',
    (route) => route.fulfill({ json: null }),
  );

  await openHome(page);
  const cityPicker = page.getByRole('button', { name: /change city/i });
  await cityPicker.click();
  await page.getByRole('button', { name: 'Removed city', exact: true }).click();
  await expect(page.getByText('Couldn’t load these results.')).toBeVisible();
  await page.getByRole('button', { name: 'Berlin', exact: true }).click();
  await expect(cityPicker).toContainText('Berlin');

  await page.reload();
  await expect(cityPicker).toContainText('Berlin');
  await cityPicker.click();
  await page.getByRole('button', { name: 'Use my area', exact: true }).click();
  expect(await page.evaluate(() => sessionStorage.getItem('qg_home_region'))).toBeNull();
});
