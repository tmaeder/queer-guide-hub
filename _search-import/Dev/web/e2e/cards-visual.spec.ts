import { test, expect } from '@playwright/test';

const dismissCookieBanner = async (page) => {
  await page
    .getByRole('button', { name: /accept all|necessary only/i })
    .first()
    .click({ timeout: 3000 })
    .catch(() => {});
};

test('visual: /events card grid — desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/events');
  await page.waitForLoadState('networkidle');
  await dismissCookieBanner(page);
  await page.waitForTimeout(500);
  await page.screenshot({
    path: 'test-results/cards-events-desktop.png',
    fullPage: false,
  });
});

test('visual: /events card grid — mobile', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/events');
  await page.waitForLoadState('networkidle');
  await dismissCookieBanner(page);
  await page.waitForTimeout(500);
  await page.screenshot({
    path: 'test-results/cards-events-mobile.png',
    fullPage: false,
  });
});

test('visual: hamburger button hit target at 375px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await dismissCookieBanner(page);
  const hamburger = page.getByRole('button', { name: /open menu/i }).first();
  await expect(hamburger).toBeVisible();
  const box = await hamburger.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(44);
  expect(box?.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({
    path: 'test-results/cards-hamburger-mobile.png',
    fullPage: false,
  });
});
