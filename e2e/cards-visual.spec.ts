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

// The header hamburger was replaced by the fixed MobileBottomNav
// (src/components/layout/MobileBottomNav.tsx) — assert its tap targets.
test('visual: mobile bottom-nav hit targets at 375px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await dismissCookieBanner(page);
  const nav = page.getByRole('navigation', { name: /primary mobile navigation/i });
  await expect(nav).toBeVisible();
  const links = await nav.getByRole('link').all();
  expect(links.length).toBeGreaterThanOrEqual(2);
  for (const link of links) {
    const box = await link.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  }
  await page.screenshot({
    path: 'test-results/cards-bottomnav-mobile.png',
    fullPage: false,
  });
});
