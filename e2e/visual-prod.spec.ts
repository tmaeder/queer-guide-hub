import { test } from '@playwright/test';

test('visual: /trips hero prod', async ({ page }) => {
  await page.goto('/trips');
  await page.waitForLoadState('networkidle');
  // Dismiss cookie banner if it shows
  await page
    .getByRole('button', { name: /accept all|necessary only/i })
    .first()
    .click({ timeout: 3000 })
    .catch(() => {});
  await page.waitForTimeout(500);
  await page.screenshot({
    path: 'test-results/prod-trips-hero.png',
    fullPage: true,
  });
});

// The old "visual: /trips auth dialog opens on prod" test was removed: the
// in-page "sign in to plan a trip" dialog no longer exists. `/trips` now
// redirects to `/me/trips`, which for a signed-out visitor navigates straight
// to `/auth` (src/pages/profile/ProfilePage.tsx). There is no dialog to open.
