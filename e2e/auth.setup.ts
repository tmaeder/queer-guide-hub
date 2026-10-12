import { test as setup, expect } from '@playwright/test';
import path from 'node:path';
import { waitForAppReady } from './support/appReady';

export const ADMIN_STORAGE_STATE = path.join(process.cwd(), 'playwright/.auth/admin.json');

setup('authenticate as admin', async ({ page }) => {
  // Login redirect and shell readiness have separate bounded waits.
  setup.setTimeout(60_000);
  const email = process.env.E2E_ADMIN_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!email || !password) {
    setup.skip(true, 'E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD not set — admin specs will skip.');
    return;
  }

  let authStatus: number | undefined;
  const observeAuth = (response: import('@playwright/test').Response) => {
    if (new URL(response.url()).pathname.endsWith('/auth/v1/token')) authStatus = response.status();
  };
  page.on('response', observeAuth);
  await page.goto('/auth', { waitUntil: 'domcontentloaded' });
  // The sign-in form: email is a FloatingInput (type=email, no #email id),
  // password keeps #password. Scope the submit to the <form> so the header's
  // own "Sign in" button doesn't match.
  const form = page.locator('form');
  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('#password').fill(password);
  await form.getByRole('button', { name: /^sign in$/i }).click();

  try {
    await page.waitForURL((url) => !url.pathname.startsWith('/auth'), {
      timeout: 30_000,
      waitUntil: 'domcontentloaded',
    });
  } catch {
    const alerts = (await page.getByRole('alert').allTextContents()).join(' ');
    const category = /captcha/i.test(alerts)
      ? 'captcha'
      : /invalid.*(?:email|password|credentials)/i.test(alerts)
        ? 'credentials rejected'
        : /confirm.*email/i.test(alerts)
          ? 'email confirmation required'
          : /rate|too many/i.test(alerts)
            ? 'rate limited'
            : alerts
              ? 'form error'
              : 'no visible form error';
    // Never include entered values, response payloads or session data in CI logs.
    throw new Error(
      `Admin sign-in did not redirect: auth HTTP ${authStatus ?? 'no response'}; ${category}.`,
    );
  } finally {
    page.off('response', observeAuth);
  }
  await page.goto('/admin', { waitUntil: 'domcontentloaded' });
  await waitForAppReady(page);
  expect(new URL(page.url()).pathname.startsWith('/admin')).toBe(true);

  await page.context().storageState({ path: ADMIN_STORAGE_STATE });
});
