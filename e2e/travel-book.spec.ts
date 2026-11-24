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
