import { test, expect } from '@playwright/test';

// Interests & boundaries checklist (the kink/interest compare feature).
// Mirrors intimate-onboard.spec.ts's convention: the authed test uses the
// admin storageState from auth.setup and deliberately stays non-mutating —
// claude-test is NOT opted into the intimate layer, so these specs verify
// the 18+/opt-in gate and routing shell, never the checklist content itself.
// Two-party compare coverage is a skeleton (like intimate-visibility.spec.ts)
// pending dedicated opted-in fixtures — see queerguide_kink_checklist memory.

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

  test('signed-in, non-opted-in user sees the intimate opt-in CTA, not the checklist', async ({ page }) => {
    test.skip(!hasAuth, 'requires E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD');
    await page.goto('/tools/checklist');
    await expect(page.getByRole('heading', { name: /interests & boundaries/i })).toBeVisible();
    await expect(page.getByText(/part of the intimate layer/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /enable intimate profile/i })).toBeVisible();
    // Never shown: the wizard/grid tabs are gated behind eligibility.
    await expect(page.getByRole('tab', { name: /guided/i })).toHaveCount(0);
  });

  test('anonymous user hitting a share link is asked to sign in first', async ({ browser }) => {
    const anonContext = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const anonPage = await anonContext.newPage();
    await anonPage.goto('/tools/checklist/s/doesnotexist12');
    await expect(anonPage.getByRole('heading', { name: /shared checklist/i })).toBeVisible();
    await expect(anonPage.getByText(/sign in to view it/i)).toBeVisible();
    await anonContext.close();
  });

  test('signed-in, non-opted-in user hitting a share link sees the opt-in CTA', async ({ page }) => {
    test.skip(!hasAuth, 'requires E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD');
    await page.goto('/tools/checklist/s/doesnotexist12');
    await expect(page.getByRole('heading', { name: /shared checklist/i })).toBeVisible();
    await expect(page.getByText(/requires the 18\+ intimate opt-in/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /enable intimate profile/i })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Two-party coverage (wizard ratings, category visibility, compare handshake,
// share-link viewing). Requires two intimate-eligible seeded accounts.
// Set env: E2E_KINK_USER_A / E2E_KINK_USER_B (email:password each), both
// already opted into the intimate layer (consent_18plus_at set through the
// real onboarding UI, not forged). Skipped by default until fixtures land —
// same pattern as intimate-visibility.spec.ts.
// ---------------------------------------------------------------------------
const userA = process.env.E2E_KINK_USER_A;
const userB = process.env.E2E_KINK_USER_B;

test.describe('kink checklist compare (two-party)', () => {
  test.skip(!userA || !userB, 'requires E2E_KINK_USER_A/B env vars (opted-in accounts)');

  test('A rates items and sets category visibility', async ({ page: _page }) => {
    test.skip(true, 'requires seed/login fixtures');
  });

  test('B requests compare, A accepts, both see only the overlap', async ({ page: _page }) => {
    test.skip(true, 'requires seed/login fixtures');
  });

  test('a hard-limit rating never appears in the compare view', async ({ page: _page }) => {
    test.skip(true, 'requires seed/login fixtures');
  });

  test('A creates a share link; B views only include_in_share categories', async ({ page: _page }) => {
    test.skip(true, 'requires seed/login fixtures');
  });
});
