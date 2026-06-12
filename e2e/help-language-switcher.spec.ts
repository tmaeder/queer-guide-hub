import { test, expect } from '@playwright/test';

// P3-9 — language switcher in the footer must reach every page,
// including /help. Switch DE → EN → DE on /help and assert the
// active locale carries through each time.
//
// The switcher is a Radix Select (trigger aria-label "Select language",
// src/components/i18n/LanguageSwitcher.tsx). The default locale (en) is
// UNPREFIXED — switching to English lands on /help, not /en/help.

test.describe('@p3-9 /help language switcher round-trip', () => {
  test('DE → EN → DE on /help', async ({ page }) => {
    await page.goto('/de/help');
    await page.waitForSelector('h1', { timeout: 15_000 });

    const switcher = page.getByRole('combobox', { name: /select language/i }).first();
    await switcher.scrollIntoViewIfNeeded();
    await switcher.click();
    await page.getByRole('option', { name: /english/i }).first().click();
    await expect(page).toHaveURL(/\/help(?:[?#]|$)/, { timeout: 10_000 });
    await expect(page).not.toHaveURL(/\/de\//);

    // Switch back to DE.
    const switcher2 = page.getByRole('combobox', { name: /select language/i }).first();
    await switcher2.scrollIntoViewIfNeeded();
    await switcher2.click();
    await page.getByRole('option', { name: /deutsch/i }).first().click();
    await expect(page).toHaveURL(/\/de\/help/, { timeout: 10_000 });
  });
});
