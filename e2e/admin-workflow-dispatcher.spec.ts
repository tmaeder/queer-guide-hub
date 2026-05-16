import { test, expect } from '@playwright/test';

/**
 * Phase 5 — smoke for the workflow-dispatcher admin panel.
 *
 * Requires admin auth (E2E_STORAGE_STATE). Skipped when no admin creds
 * are present in CI.
 */

const hasAdmin = Boolean(process.env.E2E_STORAGE_STATE || process.env.E2E_ADMIN_EMAIL);

test.describe('admin workflow dispatcher', () => {
  test.skip(!hasAdmin, 'requires admin credentials');

  test('workflow dashboard renders runs table', async ({ page }) => {
    await page.goto('/admin/workflows');
    await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 15000 });
    // Page should expose either a table or an empty state — both
    // indicate the data layer wired up correctly.
    const visible = await Promise.race([
      page.getByRole('table').first().waitFor({ timeout: 8000 }).then(() => 'table').catch(() => null),
      page.getByText(/no runs|no workflows|empty/i).first().waitFor({ timeout: 8000 }).then(() => 'empty').catch(() => null),
    ]);
    expect(visible).not.toBeNull();
  });
});
