import { test, expect } from '@playwright/test';

// P0-3 — adult content gate.
//
// Sex & Kink subtree must show an "I am 18+" affirmation modal before any
// explicit content renders, and the page must carry meta robots noindex.
// Once affirmed (localStorage `qg_age_affirmation`), content renders
// normally. Safe mode (default ON) hides 18+ tags from the popular-tag
// strip on /resources.
//
// These specs run against a deployed environment. Pick a real Sex & Kink
// tag slug for the URL — adjust if taxonomy changes.

const ADULT_TAG_SLUG = 'bdsm';

test.describe('@p0-3 /resources age gate', () => {
  test('Sex & Kink tag URL shows the gate before any content', async ({ page, context }) => {
    await context.clearCookies();
    await page.addInitScript(() => {
      try {
        window.localStorage.removeItem('qg_age_affirmation');
      } catch {
        /* ignore */
      }
    });

    await page.goto(`/resources/${ADULT_TAG_SLUG}`);

    await expect(page.getByTestId('age-affirmation-modal')).toBeVisible({ timeout: 10_000 });
    // Placeholder MUST be present and the original page content (e.g. tag
    // hero) must NOT have rendered before affirmation.
    await expect(page.getByTestId('age-gate-placeholder')).toBeVisible();

    // Robots noindex must be set on adult pages.
    const robots = await page.locator('meta[name="robots"]').getAttribute('content');
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

    await page.goto(`/resources/${ADULT_TAG_SLUG}`);
    await page.getByTestId('age-affirmation-confirm').click();

    await expect(page.getByTestId('age-gate-placeholder')).toHaveCount(0);
    await expect(page.getByTestId('age-affirmation-modal')).toHaveCount(0);
  });

  test('Safe mode toggle on /resources hides/shows 18+ tag chips', async ({ page }) => {
    await page.goto('/resources');
    const toggle = page.getByTestId('safe-mode-toggle');
    await expect(toggle).toBeVisible({ timeout: 10_000 });

    // Default: Safe mode ON → toggle says "Show 18+ content".
    await expect(toggle).toHaveText(/show 18\+ content/i);

    // After clicking, label flips and previously hidden chips may appear.
    await toggle.click();
    await expect(toggle).toHaveText(/hide 18\+ content/i);
  });
});
