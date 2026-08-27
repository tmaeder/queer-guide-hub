import { test, expect } from '@playwright/test';

/**
 * QA fixture smoke tests for Groups.
 *
 * Requires the seed migration 20260420130000_seed_qa_groups.sql to have been
 * applied against the target database so the three fixture groups exist:
 *   - LGBTQ+ Book Club          (public)
 *   - Trans IT Professionals    (private, pending request from qa-requester)
 *   - Polyamory Discussion Circle (private)
 *
 * Auth is handled by e2e/auth.setup.ts (reads E2E_TEST_EMAIL / _PASSWORD).
 * Tests are skipped if the signed-in project has not run setup.
 *
 * Runbook: docs/qa-groups-fixtures.md
 */

test.describe('Groups — QA fixtures', () => {
  // Private fixture groups (Trans IT / Polyamory) are RLS-hidden from anon —
  // these tests only make sense with the signed-in storage state CI sets up.
  test.skip(
    !process.env.E2E_ADMIN_EMAIL && !process.env.E2E_STORAGE_STATE,
    'Requires a signed-in session (E2E_ADMIN_EMAIL / E2E_STORAGE_STATE) — private groups are RLS-hidden from anon.',
  );

  // `/groups` redirects to `/community/groups`, where <Community> lazy-loads the
  // Groups surface. Under `domcontentloaded` that chunk has not mounted yet, so
  // the groups filter input does not exist for the first moment of the test.
  //
  // That mattered because these tests used to reach for
  // `getByPlaceholder(/search/i).first()`: before the chunk mounts, the only
  // input matching /search/i is the SITE-WIDE search box in the header, so the
  // query went into the global command palette instead. The palette then opened
  // as a modal over the page, which is why the failures looked like a broken
  // group search — 'LGBTQ+ Book Club' resolved to 3 elements (its own card plus
  // the palette's own hits) and the "no groups match your search" empty state
  // never appeared, because the groups list underneath was never filtered at
  // all. Verified by hand against production: on a clean load the groups search
  // filters correctly and the empty state renders, so there was never a product
  // bug here.
  //
  // Waiting for the real input and addressing it by its exact placeholder fixes
  // both halves — no race, and no chance of matching the global box.
  const groupSearch = (page: import('@playwright/test').Page) =>
    page.getByPlaceholder('Search groups...');

  test.beforeEach(async ({ page }) => {
    await page.goto('/groups', { waitUntil: 'domcontentloaded' });
    await expect(groupSearch(page)).toBeVisible({ timeout: 15_000 });
  });

  test('search "Trans" returns the private group', async ({ page }) => {
    await groupSearch(page).fill('Trans');
    await expect(page.getByText('Trans IT Professionals').first()).toBeVisible({
      timeout: 10_000,
    });
    // Other fixture groups should be filtered out.
    await expect(page.getByText('LGBTQ+ Book Club')).not.toBeVisible();
    await expect(page.getByText('Polyamory Discussion Circle')).not.toBeVisible();
  });

  test('search "Polyamory" returns exactly the Polyamory group', async ({ page }) => {
    await groupSearch(page).fill('Polyamory');
    await expect(page.getByText('Polyamory Discussion Circle').first()).toBeVisible();
    await expect(page.getByText('LGBTQ+ Book Club')).not.toBeVisible();
  });

  test('empty-match state is distinct from "No groups here yet"', async ({ page }) => {
    await groupSearch(page).fill('zzzzzzz-no-match');
    // Shows the search-specific empty state, not the create-first-group message.
    await expect(page.getByText(/no groups match your search/i)).toBeVisible();
    await expect(page.getByText(/no groups here yet/i)).not.toBeVisible();
    // Clear-filters CTA resets results.
    await page.getByRole('button', { name: /clear filters/i }).click();
    await expect(page.getByText('LGBTQ+ Book Club').first()).toBeVisible();
  });

  test('public group shows Join CTA; private group shows Request to Join', async ({ page }) => {
    const publicCard = page
      .locator('text=LGBTQ+ Book Club')
      .locator('xpath=ancestor::*[contains(@class,"MuiCard") or contains(@class,"card")][1]')
      .first();
    const privateCard = page
      .locator('text=Polyamory Discussion Circle')
      .locator('xpath=ancestor::*[contains(@class,"MuiCard") or contains(@class,"card")][1]')
      .first();

    await expect(publicCard.getByRole('button', { name: /^Join$/ })).toBeVisible();
    await expect(privateCard.getByRole('button', { name: /Request to Join/i })).toBeVisible();
  });
});
