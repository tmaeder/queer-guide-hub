/**
 * Business console e2e — /admin/business is the single management surface for
 * businesses, so this covers the console's own tabs plus the redirects from the
 * cockpits it absorbed (hotels / vendors / brands / affiliate sub-tabs).
 *
 * Admin-only: skipped when no admin storage state was minted (see auth.setup.ts).
 */
import { test, expect, type Page } from '@playwright/test';

/**
 * Without an admin session every assertion below failed on "element not found"
 * instead of skipping — the header promised a skip and the rest of the admin
 * specs do skip, which is why this spec has been red in the nightly.
 *
 * Probing the URL is not enough: the route lingers on /admin/business for a
 * moment before the auth guard bounces it. Probe for the console's own heading,
 * which only renders once the admin gate passes.
 */
async function isAuthed(page: Page): Promise<boolean> {
  await page.goto('/admin/business', { waitUntil: 'domcontentloaded' });
  return page
    .getByRole('heading', { name: 'Business', exact: true })
    .waitFor({ state: 'visible', timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
}

// 'review' is deliberately absent: adoption link review moved to /admin/quality
// with the other review gates, and ?tab=review redirects there (asserted below).
const ADMIN_TABS = ['directory', 'hotels', 'merchants', 'brands', 'partners'] as const;

test.describe('Business console', () => {
  test.beforeEach(async ({ page }) => {
    const authed = await isAuthed(page);
    test.skip(!authed, 'requires an admin session (E2E_ADMIN_EMAIL/PASSWORD)');
  });

  test('directory lists the organizations spine', async ({ page }) => {
    await page.goto('/admin/business');
    await expect(page.getByRole('heading', { name: 'Business', exact: true })).toBeVisible();

    // Every role tab is present and reachable.
    for (const tab of ADMIN_TABS) {
      await expect(page.getByRole('tab', { name: new RegExp(tab, 'i') })).toBeVisible();
    }

    // The directory table renders rows from the spine (496+ orgs live).
    await expect(page.getByRole('columnheader', { name: 'Business' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Roles' })).toBeVisible();
  });

  test('role tabs mount their absorbed managers', async ({ page }) => {
    await page.goto('/admin/business?tab=hotels');
    await expect(page.getByRole('heading', { name: /hotels & bnbs/i })).toBeVisible();

    await page.goto('/admin/business?tab=merchants');
    await expect(page.getByRole('button', { name: /add merchant/i })).toBeVisible();

    await page.goto('/admin/business?tab=partners');
    await expect(page.getByRole('heading', { name: /affiliate partners/i })).toBeVisible();
  });

  test('retired cockpits redirect into the console', async ({ page }) => {
    for (const [from, tab] of [
      ['/admin/hotels', 'hotels'],
      ['/admin/vendors', 'merchants'],
      ['/admin/brands', 'brands'],
      ['/admin/affiliate?tab=merchants', 'merchants'],
      ['/admin/affiliate?tab=partners', 'partners'],
    ] as const) {
      await page.goto(from);
      await expect(page).toHaveURL(new RegExp(`/admin/business\\?tab=${tab}`));
    }
  });

  test('link review moved to the Quality hub', async ({ page }) => {
    // The console no longer hosts the queue; the old deep link redirects.
    await page.goto('/admin/business?tab=review');
    await expect(page).toHaveURL(/\/admin\/quality/);
    await expect(page.getByRole('tab', { name: /link review/i })).toHaveCount(0);

    // The gate is a card on the hub, counted like every other engine.
    await expect(page.getByRole('button', { name: /^Business links/ })).toBeVisible();
  });

  test('a business detail page shows its roles and linked entities', async ({ page }) => {
    await page.goto('/admin/business');
    const firstRow = page.locator('table tbody tr a').first();
    await expect(firstRow).toBeVisible();
    await firstRow.click();

    await expect(page).toHaveURL(/\/admin\/business\/[0-9a-f-]{36}/);
    await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible();
    await expect(page.getByRole('tab', { name: /venues/i })).toBeVisible();
    // Link-existing action is the console's job (relationships, not scalar fields).
    await page.getByRole('tab', { name: /merchants/i }).click();
    await expect(page.getByRole('button', { name: /link existing/i })).toBeVisible();
  });
});
