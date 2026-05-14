import { test, expect } from '@playwright/test';

// P3-9 — language switcher in the footer must reach every page,
// including /help. Switch DE → EN → DE on /help and assert the
// active locale carries through each time.

test.describe('@p3-9 /help language switcher round-trip', () => {
  test('DE → EN → DE on /help', async ({ page }) => {
    await page.goto('/de/help');
    await page.waitForSelector('h1', { timeout: 15_000 });

    const switcher = page.getByRole('combobox', { name: /language|sprache/i }).first();
    if (!(await switcher.count())) {
      // Fallback: button-based language switcher.
      const button = page.getByRole('button', { name: /language|sprache|deutsch|english/i }).first();
      await button.click();
    }

    // Select English. The exact UI depends on the LanguageSwitcher component;
    // we attempt the common pattern (clicking an option labelled English).
    const en = page.getByRole('option', { name: /english/i }).first();
    if (await en.count()) await en.click();
    await expect(page).toHaveURL(/\/en\/help/, { timeout: 5_000 });

    // Switch back to DE.
    const switcher2 = page.getByRole('combobox', { name: /language|sprache/i }).first();
    if (await switcher2.count()) await switcher2.click();
    const de = page.getByRole('option', { name: /deutsch|german/i }).first();
    if (await de.count()) await de.click();
    await expect(page).toHaveURL(/\/de\/help/, { timeout: 5_000 });
  });
});
