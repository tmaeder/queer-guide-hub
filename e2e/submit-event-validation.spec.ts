import { test, expect } from '@playwright/test';

/**
 * Per-step validation UX for /submit/event wizard.
 * Asserts Next is always clickable, inline errors render with aria wiring,
 * focus moves to first invalid, and advance is blocked until valid.
 */
test.describe('Submit Event — per-step validation', () => {
  test('Step 1 empty → Next shows inline errors, focuses Title, announces live', async ({ page }) => {
    await page.goto('/submit/event', { waitUntil: 'domcontentloaded' });

    const next = page.getByRole('button', { name: /next/i });
    if (!(await next.count())) test.skip(true, 'Sign-in required for /submit/event');

    await expect(next).toBeEnabled();
    await next.click();

    const titleInput = page.locator('#title');
    await expect(titleInput).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#title-error')).toBeVisible();
    await expect(page.locator('#event_type-error')).toBeVisible();
    await expect(titleInput).toBeFocused();

    const announcer = page.getByTestId('submit-form-announcer');
    await expect(announcer).toContainText(/fix/i);
  });

  test('Step 2 empty → Next blocked; end_date stays optional', async ({ page }) => {
    await page.goto('/submit/event', { waitUntil: 'domcontentloaded' });
    const next = page.getByRole('button', { name: /next/i });
    if (!(await next.count())) test.skip(true, 'Sign-in required');

    await page.locator('#title').fill('Pride 2026');
    await page.locator('#event_type').click();
    await page.getByRole('option', { name: /pride/i }).first().click();
    await next.click();

    await expect(page.getByRole('heading', { name: /when.*where/i })).toBeVisible();

    await next.click();
    await expect(page.locator('#start_date-error')).toBeVisible();
    await expect(page.locator('#city-error')).toBeVisible();
    await expect(page.locator('#country-error')).toBeVisible();
    await expect(page.locator('#end_date-error')).toHaveCount(0);
  });
});
