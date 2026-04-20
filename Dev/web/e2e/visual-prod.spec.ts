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

test('visual: /trips auth dialog opens on prod', async ({ page }) => {
  await page.goto('/trips');
  await page.waitForLoadState('networkidle');
  await page
    .getByRole('button', { name: /accept all|necessary only/i })
    .first()
    .click({ timeout: 3000 })
    .catch(() => {});
  await page.waitForTimeout(300);
  await page
    .getByRole('button', { name: /sign in to plan a trip/i })
    .first()
    .click();
  await page.waitForTimeout(1500);
  await page.screenshot({
    path: 'test-results/prod-trips-auth-dialog.png',
    fullPage: false,
  });
});
