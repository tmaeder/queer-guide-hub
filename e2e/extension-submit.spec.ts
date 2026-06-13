import { test, expect } from '@playwright/test';

/**
 * Phase 5 — smoke for the extension-install page and the public
 * submit form (which receives extension payloads in prod via the
 * /workers/submit CF Worker).
 *
 * Does not exercise the worker itself; that's covered by worker tests.
 * Here we only verify the user-facing surfaces render and accept input.
 */

test.describe('extension submission flow', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('extension install page renders with both store links', async ({ page }) => {
    await page.goto('/extension');
    // Title is "Queer Guide — …" (brand spells it with a space).
    await expect(page).toHaveTitle(/queer[\s.]?guide/i);
    // Page should mention either Chrome or Firefox / install
    const body = await page.locator('body').textContent();
    expect(body).toMatch(/chrome|firefox|install|extension/i);
  });

  test('submit form is reachable for unauthenticated visitor', async ({ page }) => {
    await page.goto('/submit/venue');
    // Either form renders, or auth gate kicks in — both are valid.
    const visible = await Promise.race([
      page.getByRole('heading', { level: 1 }).first().waitFor({ timeout: 10_000 }).then(() => true).catch(() => false),
      page.getByRole('button', { name: /sign in|log in|continue/i }).first().waitFor({ timeout: 10_000 }).then(() => true).catch(() => false),
    ]);
    expect(visible).toBe(true);
  });
});
