import { test, expect } from '@playwright/test';

// Skeleton E2E for the intimate-profile add-on. Requires two seeded users.
// Set env: E2E_INTIMATE_USER_A / E2E_INTIMATE_USER_B (email:password each).
// Skipped by default until fixtures land.

const userA = process.env.E2E_INTIMATE_USER_A;
const userB = process.env.E2E_INTIMATE_USER_B;

test.describe('intimate profile visibility', () => {
  test.skip(!userA || !userB, 'requires E2E_INTIMATE_USER_A/B env vars');

  test('non-opted-in user sees empty/CTA on /intimate', async ({ page }) => {
    await page.goto('/intimate');
    await expect(page.getByText(/get started|opted into|opt in/i)).toBeVisible();
  });

  test('opted-in pair: A can see B in same city; not in other city', async ({ page }) => {
    // Implementation: log in as B, opt in, set discovery_city_id=X; log in as A,
    // opt in, set city=X → expect B card visible. Switch A's filter to city Y → expect not.
    test.skip(true, 'requires seed/login fixtures');
  });

  test('blocked: discovery + detail return empty', async ({ page }) => {
    test.skip(true, 'requires seed/login fixtures');
  });

  test('intimate detail "send friend request" lands in existing relationships flow', async ({ page }) => {
    test.skip(true, 'requires seed/login fixtures');
  });
});
