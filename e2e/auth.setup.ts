import { test as setup, expect } from '@playwright/test';
import path from 'node:path';

export const ADMIN_STORAGE_STATE = path.join(
  process.cwd(),
  'playwright/.auth/admin.json',
);

setup('authenticate as admin', async ({ page }) => {
  const email = process.env.E2E_ADMIN_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!email || !password) {
    setup.skip(true, 'E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD not set — admin specs will skip.');
    return;
  }

  await page.goto('/auth');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: /^sign in$/i }).click();

  await page.waitForURL((url) => !url.pathname.startsWith('/auth'), { timeout: 30_000 });
  await page.goto('/admin');
  await page.waitForLoadState('networkidle').catch(() => {});
  expect(new URL(page.url()).pathname.startsWith('/admin')).toBe(true);

  await page.context().storageState({ path: ADMIN_STORAGE_STATE });
});
