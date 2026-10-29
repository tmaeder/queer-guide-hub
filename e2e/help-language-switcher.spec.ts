import { test, expect } from '@playwright/test';

// P3-9 — language switcher in the footer must reach every page,
// including /help. Switch DE → EN → DE on /help and assert the
// active locale carries through each time.
//
// The switcher is a native select (src/components/i18n/LanguageSwitcher.tsx). The
// default locale (en) is UNPREFIXED — switching to English lands on /help, not
// /en/help.
//
// ITS aria-label IS LOCALISED, which is what broke this spec on every scheduled
// nightly. The header here used to say the trigger reads "Select language" —
// true on /help, and this test STARTS on /de/help, where the same element reads
// "Sprache wählen". `getByRole('combobox', { name: /select language/i })`
// therefore matched nothing and the first `scrollIntoViewIfNeeded` sat until the
// 30s test timeout, which reads like a missing element rather than a wrong name.
//
// Measured on prod 2026-10-17: /de/help carries exactly two comboboxes,
// "Sprache wählen" and "Währung wählen", so the element is present and correctly
// roled — only the NAME moved. `.first()` over all comboboxes would be the
// obvious locale-proof fix and is wrong: it can resolve to the CURRENCY picker.
// So the name matches both locales this test actually visits; a third locale
// needs adding here.
const LANGUAGE_SWITCHER = /select language|sprache wählen/i;

test.describe('@p3-9 /help language switcher round-trip', () => {
  test('DE → EN → DE on /help', async ({ page }) => {
    await page.goto('/de/help');
    await page.waitForSelector('h1', { timeout: 15_000 });
    // The cookie-consent banner is a fixed bottom bar (z-sticky) that overlays
    // the footer language combobox and intercepts the click. Dismiss it first
    // (as the visual-prod specs do) so the combobox is actually clickable.
    await page
      .getByRole('button', { name: /accept all|necessary only/i })
      .first()
      .click({ timeout: 3000 })
      .catch(() => {});

    await page.getByRole('contentinfo').scrollIntoViewIfNeeded();
    const switcher = page.getByRole('combobox', { name: LANGUAGE_SWITCHER }).first();
    await switcher.scrollIntoViewIfNeeded();
    await switcher.selectOption('en');
    // English is unprefixed: the URL must become /help with no /de/ segment.
    // Anchor to the host so /de/help can't spuriously satisfy a substring
    // /help match, and give the SPA navigation time to settle (the bare
    // not-/de/ check raced the redirect).
    await expect(page).toHaveURL(/\/\/[^/]+\/help(?:[?#]|$)/, { timeout: 10_000 });

    // Switch back to DE.
    const switcher2 = page.getByRole('combobox', { name: LANGUAGE_SWITCHER }).first();
    await switcher2.scrollIntoViewIfNeeded();
    await switcher2.selectOption('de');
    await expect(page).toHaveURL(/\/de\/help/, { timeout: 10_000 });
  });
});
