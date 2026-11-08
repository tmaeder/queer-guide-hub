import { test, expect } from '@playwright/test';

// Interests & boundaries checklist (the kink/interest compare feature).
// Mirrors intimate-onboard.spec.ts's convention: the authed test uses the admin
// storageState from auth.setup and deliberately stays non-mutating. The anon
// tests verify the sign-in gate; the signed-in ones verify the routing shell,
// never the checklist content itself.
//
// "claude-test is NOT opted into the intimate layer" STOOD HERE AND IS FALSE.
// Measured on prod 2026-10-17: it has an `intimate_profiles` row with
// `opted_in_at` and `consent_18plus_at` set, and so does **every other account**
// — 19 profiles, 19 intimate_profiles, 0 without one — because
// `auto_enroll_intimate_trg` (20260710110000) enrolls on profile insert and is
// live and enabled.
//
// That is a DELIBERATE PRODUCT DECISION rather than fixture drift: the
// migration's header records the owner's "all users must have the same feature
// set" for this 18+ platform, with consent grounded in the required 18+ signup
// checkbox. `KinkChecklist.tsx` gates on `if (!me?.opted_in_at)`, so no
// signed-in account reaches the opt-in CTA and both signed-in cases below failed
// every scheduled nightly asserting a state nothing can be in.
//
// NO FIXTURE CAN RESTORE THAT STATE, which is why these branch instead of being
// repointed at a different account: reaching it means an account with no
// intimate row, i.e. one where the trigger's own exception branch fired or whose
// row was deleted. Each case now asserts whichever branch rendered, with a
// control that exactly one of them did — the CTA path is still asserted if it is
// ever reachable again, and the opted-in path is asserted meanwhile.

const hasAuth = !!(process.env.E2E_ADMIN_EMAIL && process.env.E2E_ADMIN_PASSWORD);

test.describe('kink checklist gating', () => {
  test('anonymous user is asked to sign in, not shown the checklist', async ({ browser }) => {
    const anonContext = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const anonPage = await anonContext.newPage();
    await anonPage.goto('/tools/checklist');
    await expect(anonPage.getByRole('heading', { name: /interests & boundaries/i })).toBeVisible();
    await expect(anonPage.getByText(/private checklist for consenting adults/i)).toBeVisible();
    await anonContext.close();
  });

  test('a signed-in user gets the checklist, or the opt-in CTA if not enrolled', async ({
    page,
  }) => {
    test.skip(!hasAuth, 'requires E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD');
    await page.goto('/tools/checklist');

    // POSITIVE CONTROL: both branches render this heading ("Interests &
    // boundaries checklist" gated, "Interests & boundaries" eligible — the
    // pattern matches either), so waiting on it settles the loading state and
    // proves the page rendered at all.
    await expect(page.getByRole('heading', { name: /interests & boundaries/i })).toBeVisible({
      timeout: 15_000,
    });

    const cta = page.getByRole('button', { name: /enable intimate profile/i });
    const guided = page.getByRole('tab', { name: /guided/i });

    if ((await cta.count()) > 0) {
      // Not enrolled: the gate. Asserted in full, so it still guards if an
      // account ever reaches this state again.
      await expect(page.getByText(/part of the intimate layer/i)).toBeVisible();
      await expect(cta).toBeVisible();
      await expect(guided, 'the wizard tabs are gated behind eligibility').toHaveCount(0);
    } else {
      // Enrolled, which is every account today: the checklist itself renders.
      // Asserting the tabs is what makes the branch non-vacuous — otherwise an
      // empty page would satisfy "no CTA".
      await expect(guided).toBeVisible();
    }
  });

  test('anonymous user hitting a share link is asked to sign in first', async ({ browser }) => {
    const anonContext = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const anonPage = await anonContext.newPage();
    await anonPage.goto('/tools/checklist/s/doesnotexist12');
    await expect(anonPage.getByRole('heading', { name: /shared checklist/i })).toBeVisible();
    await expect(anonPage.getByText(/sign in to view it/i)).toBeVisible();
    await anonContext.close();
  });

  test('a signed-in user hitting an unknown share link is told so, or asked to opt in', async ({
    page,
  }) => {
    test.skip(!hasAuth, 'requires E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD');
    await page.goto('/tools/checklist/s/doesnotexist12');

    // POSITIVE CONTROL: the two branches carry DIFFERENT headings here —
    // "Shared checklist" behind the opt-in gate, "Link not available" once
    // eligible, since KinkShareView checks eligibility before the share id.
    // Waiting on either settles the loading state; this is why the old
    // unconditional "Shared checklist" assertion failed rather than the copy
    // having changed.
    await expect(
      page.getByRole('heading', { name: /shared checklist|link not available/i }),
    ).toBeVisible({ timeout: 15_000 });

    const cta = page.getByRole('button', { name: /enable intimate profile/i });
    if ((await cta.count()) > 0) {
      await expect(page.getByRole('heading', { name: /shared checklist/i })).toBeVisible();
      await expect(page.getByText(/requires the 18\+ intimate opt-in/i)).toBeVisible();
      await expect(cta).toBeVisible();
    } else {
      // Eligible: the id is what fails, and it must fail as "not available"
      // rather than leaking anything about whether the link ever existed.
      await expect(page.getByRole('heading', { name: /link not available/i })).toBeVisible();
    }
  });
});
