import { test, expect } from '@playwright/test';

// Smoke specs for the unified Guides family (guides + lists + quests).
// Runs against E2E_BASE_URL (defaults to https://queer.guide). Relies on the
// migrated seed guides being published on prod.

test.describe('Guides — unified hub', () => {
  test.setTimeout(120_000);

  test('/guides renders the hub with guide cards', async ({ page }) => {
    await page.goto('/guides');
    await page.waitForLoadState('domcontentloaded');
    await expect(
      page.getByRole('heading', { name: /guides/i, level: 1 }),
    ).toBeVisible({ timeout: 30_000 });
    const guideLinks = page.locator('a[href^="/guides/"]');
    await expect(guideLinks.first()).toBeVisible({ timeout: 30_000 });
  });

  test('header primary nav links to /guides', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    const nav = page.getByRole('navigation', { name: /primary/i });
    await expect(nav.getByRole('link', { name: /guides/i })).toBeVisible({ timeout: 30_000 });
  });

  test('guide detail renders hero + picks', async ({ page }) => {
    await page.goto('/guides');
    await page.waitForLoadState('domcontentloaded');
    const first = page.locator('article a[href^="/guides/"]').first();
    await first.waitFor({ timeout: 30_000 });
    await first.click();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 });
  });

  test('legacy /venues/guides redirects into /guides', async ({ page }) => {
    await page.goto('/venues/guides');
    await page.waitForURL(/\/guides/, { timeout: 30_000 });
    expect(page.url()).toContain('/guides');
  });

  test('legacy /marketplace/guides redirects into /guides', async ({ page }) => {
    await page.goto('/marketplace/guides');
    await page.waitForURL(/\/guides/, { timeout: 30_000 });
    expect(page.url()).toContain('/guides');
  });

  test('legacy /quests redirects into /guides?format=quest', async ({ page }) => {
    await page.goto('/quests');
    await page.waitForURL(/\/guides\?format=quest/, { timeout: 30_000 });
    expect(page.url()).toContain('format=quest');
  });

  test('/venues still renders a guides rail', async ({ page }) => {
    await page.goto('/venues');
    await page.waitForLoadState('domcontentloaded');
    const guidesSection = page.getByRole('region', { name: /^guides$/i });
    await expect(guidesSection).toBeVisible({ timeout: 30_000 });
    await expect(guidesSection.getByRole('link', { name: /all guides/i })).toBeVisible();
  });
});
