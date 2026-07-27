/**
 * Business console e2e — /admin/business is the single management surface for
 * businesses, so this covers the console's own tabs plus the redirects from the
 * cockpits it absorbed (hotels / vendors / brands / affiliate sub-tabs).
 *
 * Admin-only: skipped when no admin storage state was minted (see auth.setup.ts).
 */
import { test, expect } from '@playwright/test';

const ADMIN_TABS = ['directory', 'hotels', 'merchants', 'brands', 'partners', 'review'] as const;

test.describe('Business console', () => {
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
