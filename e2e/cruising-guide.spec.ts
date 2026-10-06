import { expect, test } from '@playwright/test';

const hasAuth = Boolean(process.env.E2E_ADMIN_EMAIL && process.env.E2E_ADMIN_PASSWORD);

test.describe('cruising guide', () => {
  test('keeps the cruising directory behind sign-in', async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();

    await page.goto('/cruising');
    await expect(page).toHaveURL(/\/auth(?:[/?#]|$)/);
    await expect(page.getByRole('heading', { name: /welcome back|sign in/i })).toBeVisible();

    await context.close();
  });

  test('signed-in users can use the map, browse every spot, search, and open dating', async ({
    page,
  }) => {
    test.skip(!hasAuth, 'requires E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD');

    await page.addInitScript(() => {
      localStorage.setItem(
        'queer-guide-cookie-consent',
        JSON.stringify({
          preferences: { necessary: true, functional: true, analytics: true, marketing: true },
          version: '1.0',
          timestamp: new Date(0).toISOString(),
        }),
      );
    });

    await page.goto('/cruising');

    await expect(page).not.toHaveURL(/\/auth(?:[/?#]|$)/);
    await expect(page.getByRole('heading', { name: 'Queer cruising map' })).toBeVisible();
    await expect(page.getByLabel('Interactive cruising map')).toHaveCount(1);
    await expect(page.getByRole('region', { name: 'Map' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Zoom in' })).toBeVisible();

    const layers = page.getByRole('group', { name: 'Map layers' });
    await expect(layers.getByRole('button', { name: 'Both' })).toBeVisible();
    await expect(layers.getByRole('button', { name: 'People' })).toBeVisible();
    await expect(layers.getByRole('button', { name: 'Spots' })).toBeVisible();

    await expect(page.getByText(/^\d[\d,.\s]* spots$/)).toBeVisible({ timeout: 30_000 });
    const firstSpot = page.locator('article h2').first();
    await expect(firstSpot).toBeVisible();
    const firstSpotName = (await firstSpot.textContent())?.trim();
    expect(firstSpotName).toBeTruthy();

    const search = page.getByLabel('Search all cruising spots');
    await search.fill(firstSpotName!);
    await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe(firstSpotName!);
    await expect(
      page.getByRole('heading', { name: firstSpotName!, exact: true }).first(),
    ).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole('link', { name: 'Place details' }).first()).toBeVisible();

    await page.getByRole('tab', { name: 'Nearby people' }).click();
    await expect(page).toHaveURL(/[?&]panel=people/);
    await expect(page.getByRole('tab', { name: 'Nearby people' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByText('Something went wrong')).toHaveCount(0);
  });
});
