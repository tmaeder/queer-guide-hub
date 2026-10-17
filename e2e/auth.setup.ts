import { test as setup, expect } from '@playwright/test';
import path from 'node:path';
import { waitForAppReady } from './support/appReady';

export const ADMIN_STORAGE_STATE = path.join(process.cwd(), 'playwright/.auth/admin.json');

/**
 * Failure categories, split by whether ANOTHER ATTEMPT COULD SUCCEED.
 *
 * `credentials rejected`, `captcha` and `email confirmation required` are the
 * backend answering with a verdict about this account — retrying re-asks a
 * question already answered, burns the suite's budget and buries the real
 * cause. Everything else (no HTTP response, a 5xx, a silent timeout) is the
 * request not completing, which is a different attempt away from succeeding.
 */
const TERMINAL = new Set(['credentials rejected', 'captcha', 'email confirmation required']);

function categorise(alerts: string): string {
  return /captcha/i.test(alerts)
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
}

setup('authenticate as admin', async ({ page }) => {
  // Three bounded sign-in attempts plus shell readiness.
  setup.setTimeout(150_000);
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

  /**
   * RETRY, because one stalled request took the whole required check down.
   *
   * This setup gates every admin spec in `Critical paths`, so a single failed
   * sign-in fails the check for the entire PR. Measured 2026-10-17: it failed
   * on ten PRs at once with `auth HTTP no response` — while the live endpoint
   * answered 3/3 HTTP 200 in under 200ms from outside CI in the same minute.
   * That is the request not completing under load, not a bad credential, and
   * it is exactly what a second attempt fixes.
   *
   * Bounded at three and terminal categories are NOT retried, so a genuinely
   * wrong password still fails on the first attempt with the same message as
   * before rather than three times as slowly.
   */
  const ATTEMPTS = 3;
  try {
    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
      authStatus = undefined;
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
        break; // signed in
      } catch {
        const category = categorise((await page.getByRole('alert').allTextContents()).join(' '));
        const terminal = TERMINAL.has(category);
        if (terminal || attempt === ATTEMPTS) {
          // Never include entered values, response payloads or session data in CI logs.
          throw new Error(
            `Admin sign-in did not redirect after ${attempt} attempt(s): ` +
              `auth HTTP ${authStatus ?? 'no response'}; ${category}` +
              `${terminal ? ' (terminal — not retried)' : ''}.`,
          );
        }
        // Back off before re-asking: the failure mode is contention, so an
        // immediate retry samples the same bad moment.
        await page.waitForTimeout(5_000 * attempt);
      }
    }
  } finally {
    // `finally`, not a call per exit path: a throw from goto/fill/click would
    // otherwise leak the listener past the loop.
    page.off('response', observeAuth);
  }
  await page.goto('/admin', { waitUntil: 'domcontentloaded' });
  await waitForAppReady(page);
  expect(new URL(page.url()).pathname.startsWith('/admin')).toBe(true);

  await page.context().storageState({ path: ADMIN_STORAGE_STATE });
});
