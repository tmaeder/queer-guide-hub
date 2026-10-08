import { test, expect } from '@playwright/test';

test.describe('shared contact contribution branch', () => {
  test('/contact renders the shared private-message branch', async ({ page }) => {
    await page.goto('/contact');
    await expect(page.getByRole('heading', { name: 'Contact the team' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('radiogroup')).toBeVisible();
    await expect(page.getByRole('radio')).toHaveCount(5);
    await expect(page.getByRole('button', { name: 'Send message' })).toBeDisabled();
  });

  test('/contact?category=safety preserves the reporting deep link', async ({ page }) => {
    await page.goto('/contact?category=safety');
    await expect(page.getByRole('radio', { name: /Safety and moderation/i })).toBeChecked({
      timeout: 15_000,
    });
    await expect(page.getByRole('link', { name: /Crisis lines by country/i })).toBeVisible();
  });

  test('the contribution chooser opens Contact without navigating away', async ({ page }) => {
    await page.goto('/submit');
    await page.getByRole('button', { name: /Contact the team/i }).click();
    await expect(page.getByRole('heading', { name: 'Contact the team' })).toBeVisible();
    await expect(page).toHaveURL(/\/submit$/);
  });
});
