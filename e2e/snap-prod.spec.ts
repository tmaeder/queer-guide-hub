import { test } from '@playwright/test';
test('travel snap', async ({ page }) => {
  await page.goto('https://queer.guide/travel');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: '/tmp/travel-prod.png', fullPage: true });
});
