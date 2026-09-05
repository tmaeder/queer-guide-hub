import { test, expect, type Page } from '@playwright/test';

/**
 * /tags must tell a signed-out reader that the glossary is withholding terms,
 * and must NOT say it to someone who can already see them.
 *
 * The numbers are never hardcoded. `gated_tag_count()` reads a live corpus that
 * other sessions edit daily — on 2026-09-04 it was {total: 102, non_adult: 14} —
 * so a spec pinning "14" goes red on ordinary editorial work and teaches people
 * to ignore it. Each case derives its expectation from the RPC response the page
 * itself received, and asserts the RELATIONSHIP between what was fetched and
 * what was rendered.
 */

/** The count RPC's payload, captured from the page's own network traffic. */
async function captureCount(page: Page): Promise<{ total: number; non_adult: number } | null> {
  let payload: { total: number; non_adult: number } | null = null;
  page.on('response', async (r) => {
    if (!r.url().includes('gated_tag_count')) return;
    try {
      const j = JSON.parse(await r.text());
      payload = Array.isArray(j) ? j[0] : j;
    } catch {
      /* body already discarded — leave null and let the caller report it */
    }
  });
  await page.goto('/tags');
  for (let i = 0; i < 60; i++) {
    if (payload) break;
    await page.waitForTimeout(400);
  }
  return payload;
}

/**
 * Is there a real Supabase session? Read from storage rather than inferring from
 * the UI: "the header shows no Sign in button" is also true of a page that
 * failed to render, which is exactly the vacuous pass this spec must not have.
 */
async function hasSession(page: Page): Promise<boolean> {
  return page.evaluate(() =>
    Object.keys(window.localStorage).some((k) => /^sb-.*-auth-token$/.test(k)),
  );
}

test.describe('@safety /tags gated-terms notice', () => {
  test('a signed-out reader is told how many terms are withheld', async ({ browser }) => {
    // Explicitly sessionless: with E2E_ADMIN_* set (CI) the default project
    // carries an admin storageState, and a signed-in browser renders no notice
    // at all — which would pass an "is it correct" assertion by never running it.
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();

    const count = await captureCount(page);
    expect(count, 'the page must call gated_tag_count as an anon reader').not.toBeNull();

    const notice = page.getByText(/more terms are shown to signed-in members/i);
    await expect(notice).toBeVisible({ timeout: 30_000 });

    const headline = (await notice.first().innerText()).match(/\d+/)?.[0];
    const body = await page.locator('body').innerText();
    const safeModeLine = body.match(/(\d+)\s+further terms stay hidden while safe mode is on/i);

    // The headline promises what signing in ACTUALLY reveals. With safe mode on
    // that is the non-adult subset, not the total — claiming the total would
    // overstate the benefit to a reader who would still not see the rest.
    const expected = safeModeLine ? count!.non_adult : count!.total;
    expect(Number(headline), 'headline must match what signing in would reveal').toBe(expected);

    // And the two figures must account for the whole gated set, so the notice
    // cannot quietly lose terms between its own sentences.
    if (safeModeLine) {
      expect(Number(headline) + Number(safeModeLine[1])).toBe(count!.total);
    }

    await expect(
      page.locator('a[href*="/auth"]').filter({ hasText: /sign in/i }).first(),
    ).toBeVisible();

    await ctx.close();
  });

  test('a signed-in reader is not told anything is withheld', async ({ page }) => {
    // Default context: signed in wherever E2E_ADMIN_* / E2E_STORAGE_STATE exist.
    await page.goto('/tags');
    await page.waitForLoadState('networkidle').catch(() => {});

    const signedIn = await hasSession(page);
    if (!signedIn) {
      // Locally there are no admin creds and this cannot be tested. In CI there
      // ARE creds, so a missing session means the setup project failed — FAIL
      // rather than skip, or this silently stops testing anything and nobody
      // notices for months.
      expect(
        Boolean(process.env.CI),
        'CI has E2E_ADMIN_* — no session here means auth.setup did not run',
      ).toBe(false);
      test.skip(true, 'no admin session locally; the signed-out case above still runs');
      return;
    }

    // POSITIVE CONTROL FIRST. Prove the glossary actually rendered before
    // asserting the notice is absent from it — "no notice" is trivially true of
    // a blank page, a redirect to /auth, or a 500.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 });
    expect(new URL(page.url()).pathname).toMatch(/^\/(?:[a-z]{2}\/)?tags/);

    await expect(page.getByText(/more terms are shown to signed-in members/i)).toHaveCount(0);
    await expect(page.getByText(/stay hidden while safe mode is on/i)).toHaveCount(0);
  });
});
