import { test, expect } from '@playwright/test';

// Regression guard for PR #926: a second <AuthDialog defaultMode="signup">
// mounted in Header called navigate('/auth?mode=signup') during render,
// triggering React #185 ("Maximum update depth") and blanking every page.
//
// These tests assert:
//   1. /auth?mode=signup renders the Signup form (no infinite loop / blank).
//   2. /auth?mode=signin renders the sign-in form and the URL is NOT
//      rewritten to ?mode=signup.
//   3. No React error #185 in the console.

test.describe('auth page renders without React #185 loop', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('signup mode renders the Signup form', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/auth?mode=signup');

    await expect(page.getByRole('heading', { name: /create your account/i })).toBeVisible();
    await expect(page.getByLabel(/email/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /create account/i })).toBeVisible();

    expect(page.url()).toContain('mode=signup');
    expect(errors.join('\n')).not.toMatch(/Minified React error #185|Maximum update depth/);
  });

  test('signin mode renders and URL is not rewritten to signup', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/auth?mode=signin');

    await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible();

    // Critical: the URL must stay signin. The bug rewrote it to ?mode=signup.
    await page.waitForTimeout(500);
    expect(page.url()).toContain('mode=signin');
    expect(page.url()).not.toContain('mode=signup');

    expect(errors.join('\n')).not.toMatch(/Minified React error #185|Maximum update depth/);
  });
});

// Password reset used to be a dead end: the emailed link signed the user in
// and dropped them on "/", and no update-password UI existed anywhere. These
// guard the route that closes it.
//
// Deliberately additive to THIS file rather than a new spec: the PR suite in
// .github/workflows/e2e-pr.yml is a hardcoded file list, so a new spec would
// run in no workflow at all.
test.describe('password reset', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('reset page states its case instead of rendering blank', async ({ page }) => {
    await page.goto('/auth/reset-password');

    // Without a recovery session this must be an explicit dead-link message
    // with a way forward — not an empty card and not a 404.
    await expect(page.getByRole('heading', { name: /expired/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /request a new link/i })).toBeVisible();
  });

  test('forgot-password form is reachable and submits', async ({ page }) => {
    await page.goto('/auth');
    await page.getByRole('button', { name: /forgot/i }).click();

    await expect(page.getByRole('heading', { name: /reset password/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /send reset link/i })).toBeVisible();
  });
});

test.describe('auth redirect params', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('preserves ?redirect= on the auth page', async ({ page }) => {
    await page.goto('/auth?redirect=%2Ftravel');
    await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible();
    expect(page.url()).toContain('redirect=');
  });
});
