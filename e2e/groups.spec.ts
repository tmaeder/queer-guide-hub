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
  test.beforeEach(async ({ page }) => {
    await page.goto('/groups', { waitUntil: 'domcontentloaded' });
  });

  test('search "Trans" returns the private group', async ({ page }) => {
    await page.getByPlaceholder(/search/i).first().fill('Trans');
    await expect(page.getByText('Trans IT Professionals').first()).toBeVisible({
      timeout: 10_000,
    });
    // Other fixture groups should be filtered out.
    await expect(page.getByText('LGBTQ+ Book Club')).not.toBeVisible();
    await expect(page.getByText('Polyamory Discussion Circle')).not.toBeVisible();
  });

  test('search "Polyamory" returns exactly the Polyamory group', async ({ page }) => {
    await page.getByPlaceholder(/search/i).first().fill('Polyamory');
    await expect(page.getByText('Polyamory Discussion Circle').first()).toBeVisible();
    await expect(page.getByText('LGBTQ+ Book Club')).not.toBeVisible();
  });

  test('empty-match state is distinct from "No groups here yet"', async ({ page }) => {
    await page.getByPlaceholder(/search/i).first().fill('zzzzzzz-no-match');
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
