import { test, expect } from '@playwright/test';

// Signed-in legacy /me + /me/progress coverage. /me now redirects into the
// /hub office and /me/progress lands on the unified profile's own-only
// Progress tab (/user/:id/progress) via MeRedirect — both auth-walled
// (anon → /auth). Uses the admin storageState from auth.setup and skips when
// E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD are unset. Non-mutating.
//
// This locks the crash-regression contract against a real session: /me/progress
// must render its tab shell (sub-tabs + footer) and never blank. Each sub-panel
// has an unconditional, data-independent section header — if a section's error
// boundary fired, the header would be replaced by the DataErrorFallback, so
// asserting the header is the "section mounted, no blank" check.

const hasAuth = !!(process.env.E2E_ADMIN_EMAIL && process.env.E2E_ADMIN_PASSWORD);

test.describe('/me/progress — signed-in', () => {
  test.skip(!hasAuth, 'requires E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD');

  // Pre-seed cookie consent so the fixed banner never intercepts sub-tab clicks.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem(
          'queer-guide-cookie-consent',
          JSON.stringify({
            preferences: { necessary: true, functional: true, analytics: true, marketing: true },
            version: '1.0',
            timestamp: new Date(0).toISOString(),
          }),
        );
      } catch {
        /* storage unavailable */
      }
    });
  });

  test('legacy /me lands signed-in users in the /hub office', async ({ page }) => {
    await page.goto('/me');
    await expect(page).not.toHaveURL(/\/auth(\b|\/)/);
    await expect(page).toHaveURL(/\/hub$/);
  });

  test('/me/progress resolves to the own profile with the Progress tab', async ({ page }) => {
    await page.goto('/me/progress');
    await expect(page).toHaveURL(/\/user\/[0-9a-f-]+\/progress/);
    await expect(page.getByRole('tab', { name: 'Progress' })).toBeVisible();
  });

  test('/me/progress renders the tab shell — no blank or route crash', async ({ page }) => {
    await page.goto('/me/progress');

    // The secondary segmented view: Score / Activity / Recognition.
    await expect(page.getByRole('tab', { name: 'Score' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Activity' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Recognition' })).toBeVisible();

    // Footer + default Score panel content prove the tab actually painted.
    await expect(page.getByText('Visible only to you.')).toBeVisible();
    await expect(page.getByText('Reading', { exact: true })).toBeVisible();

    // The route-level error fallback must NOT be present (the original blank-screen bug).
    await expect(page.getByText('Something went wrong')).toHaveCount(0);
  });

  test('switching sub-tabs mounts each panel without a per-section blank', async ({ page }) => {
    await page.goto('/me/progress');

    // Activity → LocalSupporterBlock's unconditional header.
    await page.getByRole('tab', { name: 'Activity' }).click();
    await expect(page.getByText('Local Supporter', { exact: true })).toBeVisible();

    // Recognition → AchievementsGrid's unconditional header.
    await page.getByRole('tab', { name: 'Recognition' }).click();
    await expect(page.getByText('Achievements', { exact: true })).toBeVisible();

    // No section degraded to the data-error card for a healthy signed-in user.
    await expect(page.getByText('Failed to load data')).toHaveCount(0);
  });
});
