import { test, expect } from '@playwright/test';

// P0-2 — /help mixed-language regression test.
//
// The bug: visiting /help on an English session showed German strings
// interleaved ("Hilfe & Krisen-Hotlines" + "In acute danger?" CTA).
// Root cause: `t(key, defaultValue)` calls in HelpHotlines used GERMAN
// defaults. When i18next hadn't yet loaded the active bundle (or a key
// was missing in EN), users saw the German fallback. We replaced all
// fallbacks with English (the canonical source language) and gated
// first paint on `useTranslation().ready`.
//
// This spec asserts that /help and /en/help render no obvious German
// markers and that /de/help renders the German bundle.

const GERMAN_MARKERS = [
  'Hilfe & Krisen-Hotlines',
  'Akute Gefahr',
  'Wähle sofort den Notruf',
  'Alle Länder',
  'Alle Themen',
  'Du bist nicht allein',
  'Krisenhotlines',
  'Hilfe-Seite nicht verfügbar',
  'Queer Guide ersetzt',
];

const ENGLISH_MARKERS = [
  'Help & Crisis Hotlines',
  'In acute danger',
  'All countries',
  'All topics',
];

test.describe('@p0-2 /help locale', () => {
  test('English session: /help renders no German markers', async ({ page }) => {
    await page.goto('/en/help');
    // Wait for the first heading so we know i18n + page have hydrated.
    await page.waitForSelector('h1', { timeout: 15_000 });
    const html = await page.content();
    for (const marker of GERMAN_MARKERS) {
      expect(
        html.includes(marker),
        `English page must not contain German marker "${marker}"`,
      ).toBe(false);
    }
    for (const marker of ENGLISH_MARKERS) {
      expect(html, `English page must contain "${marker}"`).toContain(marker);
    }
  });

  test('German session: /de/help renders the German bundle', async ({ page }) => {
    await page.goto('/de/help');
    await page.waitForSelector('h1', { timeout: 15_000 });
    const html = await page.content();
    // We expect the de.json bundle to provide German strings — at least one
    // German emergency or topic word must be present.
    const hasGerman = GERMAN_MARKERS.some((m) => html.includes(m));
    expect(hasGerman, 'German page must contain at least one German marker').toBe(true);
  });

  test('No-prefix /help respects browser language English', async ({ browser }) => {
    const ctx = await browser.newContext({ locale: 'en-US' });
    const page = await ctx.newPage();
    await page.goto('/help');
    await page.waitForSelector('h1', { timeout: 15_000 });
    const html = await page.content();
    for (const marker of GERMAN_MARKERS) {
      expect(html.includes(marker), `EN browser /help leaked "${marker}"`).toBe(false);
    }
    await ctx.close();
  });
});
