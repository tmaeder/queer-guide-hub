import { expect, test } from '@playwright/test';
import sharp from 'sharp';

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

    const mapErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error' && /map|webgl|worker|tile/i.test(message.text())) {
        mapErrors.push(message.text());
      }
    });

    const firstTile = page.waitForResponse(
      (response) => response.url().includes('/planet/') && response.url().endsWith('.mvt'),
    );
    await page.goto('/cruising');

    await expect(page).not.toHaveURL(/\/auth(?:[/?#]|$)/);
    await expect(page.getByRole('heading', { name: 'Queer cruising map' })).toBeVisible();
    const interactiveMap = page.getByLabel('Interactive cruising map');
    await expect(interactiveMap).toHaveCount(1);
    // The container must have REAL height, asserted separately from the
    // canvas-blankness poll below so a failure names its cause. MapLibre adds
    // `.maplibregl-map` to this element and `maplibre-gl.css` sets
    // `position: relative` on it UNLAYERED, which beats Tailwind v4's layered
    // `absolute`; `inset-0` then stops applying and the element collapses to
    // 0px unless it carries its own `h-full`. That shipped, and the page
    // served an empty grey panel — measured 0px inside a 692px parent. The
    // canvas poll does catch it, but only as "canvas stayed visually blank",
    // which reads like a tile or style fault rather than a layout one.
    const mapBox = await interactiveMap.boundingBox();
    expect(mapBox?.height ?? 0, 'Cruising map container collapsed to zero height').toBeGreaterThan(
      200,
    );
    await expect(page.getByRole('region', { name: 'Map' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Zoom in' })).toBeVisible();
    await expect(interactiveMap).toHaveAttribute('data-map-state', 'ready', { timeout: 20_000 });
    await expect
      .poll(async () => Number((await interactiveMap.getAttribute('data-map-spots')) ?? 0), {
        message: 'Cruising map did not receive any mapped spots',
        timeout: 30_000,
      })
      .toBeGreaterThan(0);
    await expect
      .poll(
        async () => Number((await interactiveMap.getAttribute('data-map-rendered-spots')) ?? 0),
        {
          message: 'Cruising map received spot data but did not render a visible spot feature',
          timeout: 30_000,
        },
      )
      .toBeGreaterThan(0);

    const tileResponse = await firstTile;
    expect(tileResponse.status(), await tileResponse.text()).toBe(200);
    const canvas = page.locator('canvas.maplibregl-canvas');
    await expect(canvas).toBeVisible();
    await expect
      .poll(
        async () => {
          const stats = await sharp(await canvas.screenshot()).stats();
          return Math.max(...stats.channels.slice(0, 3).map((channel) => channel.stdev));
        },
        { message: 'Map canvas stayed visually blank', timeout: 20_000 },
      )
      .toBeGreaterThan(4);
    expect(mapErrors).toEqual([]);

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
    const filters = page.getByRole('region', { name: 'Discovery filters' });
    await expect(filters).toBeVisible();
    await expect(filters.getByRole('group', { name: 'Role', exact: true })).toBeVisible();
    await expect(filters.getByRole('button', { name: 'Into', exact: true })).toBeVisible();
    await expect(filters.getByRole('group', { name: 'Age', exact: true })).toBeVisible();
    await expect(filters.getByRole('group', { name: 'Body', exact: true })).toBeVisible();
    await expect(filters.getByRole('button', { name: 'Top', exact: true })).toBeVisible();

    await filters.getByRole('button', { name: 'Top', exact: true }).click();
    await expect(filters.getByRole('button', { name: 'Remove Top filter' })).toBeVisible();
    await filters.getByRole('button', { name: 'Remove Top filter' }).click();

    await filters.getByRole('button', { name: 'Into', exact: true }).click();
    const interestSearch = page.getByRole('combobox', { name: 'Search interests' });
    await expect(interestSearch).toBeVisible();
    await interestSearch.fill('rope');
    await page.getByRole('option', { name: 'Rope bondage / shibari', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(
      filters.getByRole('button', { name: 'Remove Rope bondage / shibari filter' }),
    ).toBeVisible();
    await filters.getByRole('button', { name: 'Remove Rope bondage / shibari filter' }).click();

    await expect(filters.getByRole('slider', { name: 'Minimum age band' })).toBeVisible();
    await expect(filters.getByRole('slider', { name: 'Maximum age band' })).toBeVisible();

    await expect(filters.getByRole('button', { name: 'Bear', exact: true })).toBeVisible();
    await expect(page.getByText('Something went wrong')).toHaveCount(0);
  });
});
