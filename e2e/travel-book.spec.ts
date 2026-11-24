import { test, expect } from '@playwright/test';

test.describe('Travel booking search', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('submits one activity request and restores the selected search through history', async ({
    page,
  }) => {
    const searches: unknown[] = [];
    await page.route('**/functions/v1/activity-search', async (route) => {
      if (route.request().method() === 'POST') searches.push(route.request().postDataJSON());
      await route.fulfill({ json: { activities: [] } });
    });
    await page.goto('/travel/book?tab=activities');
    const city = page.getByLabel('City', { exact: true });
    await expect(city).toBeVisible();
    const cookieChoice = page.getByRole('button', { name: 'Necessary Only', exact: true });
    if (await cookieChoice.isVisible()) await cookieChoice.click();
    await city.pressSequentially('Berlin', { delay: 100 });
    expect(searches).toEqual([]);
    await city.press('Enter');
    await expect.poll(() => searches.length).toBe(1);
    expect(searches[0]).toMatchObject({ city: 'Berlin' });
    await expect(page).toHaveURL(/city=Berlin/);
    await page.getByRole('button', { name: /^Hotels\b/ }).click();
    await page.getByRole('button', { name: /^Flights\b/ }).click();
    await page.goBack();
    await expect(page.getByRole('button', { name: /^Hotels\b/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.goBack();
    await expect(page.getByRole('button', { name: /^Activities\b/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(city).toHaveValue('Berlin');
  });

  test('unknown tabs recover to a usable flight search', async ({ page }) => {
    await page.goto('/travel/book?tab=invalid');
    await expect(page.getByRole('button', { name: /^Flights\b/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByLabel('Departure', { exact: true })).toBeVisible();
  });

  test('activity search fits a narrow mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/travel/book?tab=activities');
    await expect(page.getByLabel('City', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const input = await page.getByLabel('City', { exact: true }).boundingBox();
    const submit = await page
      .getByRole('button', { name: 'Search Activities', exact: true })
      .boundingBox();
    expect(submit!.y).toBeGreaterThan(input!.y + input!.height);
  });
});

test.describe('Booking dates and recovery', () => {
  const year = new Date().getFullYear() + 1;
  const departure = `${year}-01-14`;
  const nextDeparture = `${year}-01-15`;
  const returning = `${year}-01-20`;
  test.use({ storageState: { cookies: [], origins: [] } });
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() =>
      sessionStorage.setItem(
        'visitor_origin_airport',
        JSON.stringify({ originIata: 'ZRH', originCity: 'Zurich', originCountry: 'CH' }),
      ),
    );
  });

  test('submits dates, keeps draft edits local, and retries a failed flight search', async ({
    page,
  }) => {
    const searches: Record<string, unknown>[] = [];
    await page.route('**/functions/v1/travel-deals', async (route) => {
      const body = route.request().postDataJSON();
      if (body.type === 'popular_routes') return route.fulfill({ json: { deals: [] } });
      searches.push(body);
      await route.fulfill(
        searches.length === 1
          ? { status: 503, json: { error: 'Test outage' } }
          : { json: { deals: [] } },
      );
    });
    await page.goto('/travel/book?to=BER');
    const cookies = page.getByRole('button', { name: 'Necessary Only', exact: true });
    if (await cookies.isVisible()) await cookies.click();
    await expect(page.getByLabel('From', { exact: true })).toHaveValue('Zurich (ZRH)');
    await page.getByLabel('Departure', { exact: true }).fill(departure);
    await page.getByLabel('Return (optional)', { exact: true }).fill(returning);
    await page.getByRole('button', { name: 'Search flights', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Flight search is unavailable');
    expect(searches).toHaveLength(1);
    expect(searches[0]).toMatchObject({
      departureDate: departure,
      returnDate: returning,
      destination: 'BER',
    });
    await page.getByLabel('Departure', { exact: true }).fill(nextDeparture);
    expect(searches).toHaveLength(1);
    await page.getByRole('button', { name: /Try again|Retry/i }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(searches).toHaveLength(2);
    expect(searches[1]).toMatchObject({ departureDate: departure });
    await page.getByRole('button', { name: 'Search flights', exact: true }).click();
    await expect.poll(() => searches.length).toBe(3);
    expect(searches[2]).toMatchObject({ departureDate: nextDeparture });
  });

  for (const [tab, endpoint, label, field] of [
    ['activities', 'activity-search', 'Activity search is unavailable', 'activities'],
    ['hotels', 'hotel-search', 'Partner hotel search is unavailable', 'hotels'],
    ['flights', 'travel-deals', 'Popular flight deals are unavailable', 'deals'],
  ]) {
    test(`${tab} exposes provider failure and retries successfully`, async ({ page }) => {
      let calls = 0;
      await page.route(`**/functions/v1/${endpoint}`, async (route) => {
        calls++;
        await route.fulfill(
          calls === 1 ? { status: 503, json: { error: 'Test outage' } } : { json: { [field]: [] } },
        );
      });
      await page.goto(`/travel/book?tab=${tab}&city=Berlin`);
      await expect(page.getByRole('alert').filter({ hasText: label })).toBeVisible();
      const cookies = page.getByRole('button', { name: 'Necessary Only', exact: true });
      if (await cookies.isVisible()) await cookies.click();
      await page.getByRole('alert').filter({ hasText: label }).getByRole('button').click();
      await expect(page.getByRole('alert').filter({ hasText: label })).toHaveCount(0);
      expect(calls).toBe(2);
    });
  }

  test('retries a failed Queer Guide stays query', async ({ page }) => {
    let calls = 0;
    await page.route('**/rest/v1/hotels?*', async (route) => {
      calls++;
      await route.fulfill(
        calls === 1 ? { status: 400, json: { message: 'Test query failure' } } : { json: [] },
      );
    });
    await page.goto('/travel/book?tab=hotels&city=Berlin');
    const error = page
      .getByRole('alert')
      .filter({ hasText: 'Queer Guide stays could not be loaded' });
    await expect(error).toBeVisible();
    const cookies = page.getByRole('button', { name: 'Necessary Only', exact: true });
    if (await cookies.isVisible()) await cookies.click();
    await error.getByRole('button').click();
    await expect(error).toHaveCount(0);
    expect(calls).toBe(2);
  });

  test('puts the mobile search fields in the first viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/travel/book?tab=activities');
    const city = page.getByLabel('City', { exact: true });
    await expect(city).toBeVisible();
    const bounds = await city.boundingBox();
    expect(bounds!.y + bounds!.height).toBeLessThan(650);
  });
});
