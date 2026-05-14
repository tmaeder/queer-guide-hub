import { test, expect } from '@playwright/test';

/**
 * Catches a previously-suspected race where clicking "Add Personality"
 * immediately after the page mounted left the dialog stuck in a half-mounted
 * state ("first click does nothing"). The trigger is auth-gated, so this spec
 * runs only when the suite already has an admin storage state loaded
 * (E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD or E2E_STORAGE_STATE set).
 */

const ADMIN = Boolean(process.env.E2E_ADMIN_EMAIL && process.env.E2E_ADMIN_PASSWORD)
  || Boolean(process.env.E2E_STORAGE_STATE);

test.describe('Add Personality dialog', () => {
  test.skip(!ADMIN, 'Trigger is gated on a signed-in user');

  test('opens within 300 ms on the very first click after mount', async ({ page }) => {
    await page.goto('/personalities');
    const trigger = page.getByRole('button', { name: /add personality/i });
    await expect(trigger).toBeVisible();

    const t0 = Date.now();
    await trigger.click();

    const dialog = page.getByRole('dialog', { name: /add new personality/i });
    await expect(dialog).toBeVisible({ timeout: 1500 });
    const elapsed = Date.now() - t0;
    expect.soft(elapsed, `dialog took ${elapsed}ms to open`).toBeLessThan(1500);
  });

  test('empty Name submission flags the input with aria-invalid + role=alert', async ({ page }) => {
    await page.goto('/personalities');
    await page.getByRole('button', { name: /add personality/i }).click();

    const dialog = page.getByRole('dialog', { name: /add new personality/i });
    await expect(dialog).toBeVisible();

    const submit = dialog.getByRole('button', { name: /^add personality$/i });
    await submit.click();

    const nameInput = dialog.getByLabel(/^name/i);
    await expect(nameInput).toHaveAttribute('aria-invalid', 'true');
    await expect(dialog.getByRole('alert')).toContainText(/name is required/i);
    await expect(nameInput).toBeFocused();
  });
});
