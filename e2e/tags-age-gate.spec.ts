import { test, expect } from '@playwright/test';

// P0-3 — adult content gate.
//
// A Sexuality & Kink tag must show an "I am 18+" affirmation modal before any
// explicit content renders, and the page must carry meta robots noindex.
// Once affirmed (localStorage `qg_age_affirmation`), content renders
// normally.
//
// Tag choice: tag-detail URLs resolve by NAME (lowercased), and anon RLS
// hides tags with is_sensitive=true that aren't human-reviewed
// (unified_tags_public_gated_read). "Age Play" is anon-visible and sits
// under "Practices & Play" (an ADULT_CATEGORY_NAMES member in
// src/components/resources/categoryMeta.ts), so it reliably triggers the
// gate for signed-out visitors. The old 'bdsm' fixture is RLS-hidden from
// anon (sensitive + unreviewed) and is categorised "Slang & Terminology",
// so it no longer gates.

// Tag slugs are hyphenated: "/tags/age play" (space) 404s at the CF edge; the
// real slug is "age-play". "Age Play" is anon-visible + categorised adult
// (DB "Fetish Practices"), so it reliably fires the gate for signed-out visitors.
const ADULT_TAG_PATH = '/tags/age-play';

test.describe('@p0-3 /tags age gate', () => {
  test('Sexuality & Kink tag URL shows the gate before any content', async ({ page, context }) => {
    await context.clearCookies();
    await page.addInitScript(() => {
      try {
        window.localStorage.removeItem('qg_age_affirmation');
      } catch {
        /* ignore */
      }
    });

    await page.goto(ADULT_TAG_PATH);

    await expect(page.getByTestId('age-affirmation-modal')).toBeVisible({ timeout: 15_000 });
    // Placeholder MUST be present and the original page content (e.g. tag
    // hero) must NOT have rendered before affirmation.
    await expect(page.getByTestId('age-gate-placeholder')).toBeVisible();

    // Robots noindex must be set on adult pages.
    const robots = await page.locator('meta[name="robots"]').first().getAttribute('content');
    expect(robots).toContain('noindex');
  });

  test('Affirming the gate reveals the tag content', async ({ page, context }) => {
    await context.clearCookies();
    await page.addInitScript(() => {
      try {
        window.localStorage.removeItem('qg_age_affirmation');
      } catch {
        /* ignore */
      }
    });

    await page.goto(ADULT_TAG_PATH);
    await page.getByTestId('age-affirmation-confirm').click({ timeout: 15_000 });

    await expect(page.getByTestId('age-gate-placeholder')).toHaveCount(0);
    await expect(page.getByTestId('age-affirmation-modal')).toHaveCount(0);
  });

  // Replaces the `test.skip` placeholder that stood here since the toggle UI
  // was removed. The index now does safe-mode filtering itself — it did none
  // at all before the 2026-08 rebuild, so 18+ terms sat in the grid for
  // signed-out visitors while this very gate protected the detail page.
  test('the index hides 18+ terms until the reader opts in', async ({ page }) => {
    await page.goto('/tags?q=age+play');
    await expect(page.getByRole('searchbox', { name: /search the glossary/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator('a[href*="/tags/age-play"]')).toHaveCount(0);

    await page.getByRole('button', { name: /include 18\+/i }).click({ timeout: 15_000 });
    await expect(page).toHaveURL(/adult=1/);
    await expect(page.locator('a[href*="/tags/age-play"]').first()).toBeVisible({
      timeout: 15_000,
    });
  });
});
