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

const ADULT_TAG_PATH = '/resources/age play';

test.describe('@p0-3 /resources age gate', () => {
  test('Sexuality & Kink tag URL shows the gate before any content', async ({
    page,
    context,
  }) => {
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

  // The visible Safe-mode toggle was removed in the Help-first /resources
  // rework (fa32e121b) — SafeModeProvider still gates adult topic hubs, but
  // there is no toggle UI to exercise. Keep a placeholder so the intent is
  // documented rather than silently dropped.
  test.skip('Safe mode toggle on /resources hides/shows 18+ tag chips', async () => {
    // Removed feature: safe-mode-toggle testid no longer exists in src.
  });
});
