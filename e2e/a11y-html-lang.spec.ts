import { test, expect } from '@playwright/test';

// WCAG 3.1.1, 3.1.2 — <html lang> must change when the user switches language.

test('@a11y html lang updates on language change', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('h1', { timeout: 15_000 });
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');

  const switcher = page.getByRole('combobox', { name: /language|sprache/i }).first();
  await switcher.click();
  const de = page.getByRole('option', { name: /deutsch|german/i }).first();
  await de.click();

  await expect(page).toHaveURL(/\/de(\/|$)/, { timeout: 5_000 });
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
});
