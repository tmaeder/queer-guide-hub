import { test, expect, Page } from '@playwright/test';

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

  test.beforeEach(async ({ page }) => {
    await page.goto('/groups', { waitUntil: 'domcontentloaded' });
  });

  // `getByPlaceholder(/search/i).first()` used to resolve to the HEADER's global
  // combobox ("Search venues, events, people, places…"), which is first in DOM
  // order and also matches /search/i. Typing there never sets the page's
  // `hasActiveFilters`, so Groups kept rendering its unfiltered branch — the
  // "For you" / "Featured" / "Trending this week" rails — and every
  // `getByText('LGBTQ+ Book Club')` below resolved to 3 elements (strict-mode
  // violation) while "No groups match your search" never appeared at all. Name
  // the groups filter exactly, and scope the result assertions to <main> so the
  // header can never satisfy them again.
  const groupsFilter = (page: Page) => page.getByPlaceholder(/search groups/i);

  test('search "Trans" returns the private group', async ({ page }) => {
    await groupsFilter(page).fill('Trans');
    await expect(page.locator('main').getByText('Trans IT Professionals').first()).toBeVisible({
      timeout: 10_000,
    });
    // Other fixture groups should be filtered out.
    await expect(page.locator('main').getByText('LGBTQ+ Book Club')).toHaveCount(0);
    await expect(page.locator('main').getByText('Polyamory Discussion Circle')).toHaveCount(0);
  });

  test('search "Polyamory" returns exactly the Polyamory group', async ({ page }) => {
    await groupsFilter(page).fill('Polyamory');
    await expect(
      page.locator('main').getByText('Polyamory Discussion Circle').first(),
    ).toBeVisible();
    await expect(page.locator('main').getByText('LGBTQ+ Book Club')).toHaveCount(0);
  });

  test('empty-match state is distinct from "No groups here yet"', async ({ page }) => {
    await groupsFilter(page).fill('zzzzzzz-no-match');
    // Shows the search-specific empty state, not the create-first-group message.
    await expect(page.getByText(/no groups match your search/i)).toBeVisible();
    await expect(page.getByText(/no groups here yet/i)).toHaveCount(0);
    // Clear-filters CTA resets results.
    await page.getByRole('button', { name: /clear filters/i }).click();
    await expect(page.locator('main').getByText('LGBTQ+ Book Club').first()).toBeVisible();
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
