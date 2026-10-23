import { test, expect } from '@playwright/test';

// Runs unchanged against a preview or E2E_BASE_URL=https://queer.guide.
// No response mocks, credentials, or production data writes.
for (const viewport of [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'mobile', width: 390, height: 844 },
]) {
  test.describe(`Village polish — ${viewport.name}`, () => {
    test.setTimeout(60_000);
    test.use({ viewport, storageState: { cookies: [], origins: [] } });
    test.beforeEach(async ({ page }) => {
      await page.goto('/en/villages/chueca', { waitUntil: 'domcontentloaded' });
      await expect(
        page.getByRole('heading', { level: 1, name: 'Chueca', exact: true }),
      ).toBeVisible({ timeout: 30_000 });
      const consent = page.getByRole('button', { name: /necessary only/i });
      if (await consent.isVisible()) await consent.click();
      await expect(page.locator('#walk li').first()).toBeVisible({ timeout: 30_000 });
    });

    test('leads with a bounded walk and expands the remaining stops', async ({ page }) => {
      const sections = page.locator('article section[id]');
      expect(await sections.first().getAttribute('id')).toBe('walk');
      const walk = page.locator('#walk');
      const total = await walk.locator('li').count();
      expect(total).toBeGreaterThan(0);
      await expect(walk.locator('li:visible')).toHaveCount(Math.min(8, total));
      const expand = walk.locator('summary');
      if (total > 8) {
        await expect(expand).toBeVisible();
        await expand.click();
        await expect(walk.locator('li:visible')).toHaveCount(total);
      }
      await expect(walk.locator('svg path').first()).toHaveAttribute('d', /C/);
      const distances = await walk
        .locator('p')
        .evaluateAll((nodes) =>
          nodes
            .filter((node) => /^~/.test(node.textContent ?? ''))
            .map((node) => getComputedStyle(node).textTransform),
        );
      expect(distances.every((value) => value === 'none')).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    });

    test('opens the map and retains history and secondary actions', async ({ page }) => {
      const map = page.locator('#map');
      await expect(map.locator('button[aria-controls="map-detail"]')).toHaveAttribute(
        'aria-expanded',
        'false',
      );
      await expect(map.locator('canvas')).toHaveCount(0);
      await page.getByRole('link', { name: 'Open map', exact: true }).click();
      await expect(map.locator('button[aria-controls="map-detail"]')).toHaveAttribute(
        'aria-expanded',
        'true',
      );
      await expect(page.locator('#map-detail')).toBeVisible();
      await expect(map.locator('canvas')).toBeVisible();
      await expect(map.getByRole('status')).toHaveCount(0, { timeout: 30_000 });
      await expect(map.getByRole('button', { name: 'Zoom in', exact: true })).toBeEnabled();
      await expect(page).toHaveURL(/#map$/);
      const history = page.locator('#about');
      await history.getByRole('button', { name: 'Show more', exact: true }).click();
      await expect(history.locator('[id="about-detail"]')).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Save to favorites', exact: true }),
      ).toHaveCount(1);
      await page.getByRole('button', { name: 'More actions', exact: true }).click();
      await expect(
        page
          .getByRole('dialog', { name: 'More actions' })
          .getByRole('button', { name: /Plan a trip/ }),
      ).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('button', { name: 'More actions', exact: true })).toBeFocused();
    });

    test('continues from a village to its parent city', async ({ page }) => {
      await page.locator('#city a[href*="/city/"]').click();
      await expect(page).toHaveURL(/\/city\/madrid/);
      await expect(
        page.getByRole('heading', { level: 1, name: 'Madrid', exact: true }),
      ).toBeVisible();
    });
  });
}
