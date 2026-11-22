import { expect, test } from '@playwright/test';

/**
 * Phase 4 of docs/plans/2026-11-22-hub-meet-ia-design.md, read-only against prod:
 * the Meet landing page has plain section headings (no chip strip), one link to
 * Going out instead of a bar grid, a Members section, and no Dating entry for a
 * signed-out visitor. `/hub/people` redirects to `/meet` once phase 1 ships, so
 * the same URL covers both states.
 *
 * Signed out by construction — the nightly hands chromium an admin storageState.
 */
test.use({ serviceWorkers: 'block', storageState: { cookies: [], origins: [] } });

const READY = 15_000;

test('the signed-out Meet page: headings, one Going out link, members, no Dating', async ({
  page,
}) => {
  const response = await page.goto('/hub/people');
  expect(response?.ok()).toBe(true);

  // Positive control: the page rendered its sections, so every absence below
  // is about this page and not a blank one.
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: READY });
  await expect(page.getByRole('heading', { level: 2, name: 'Community spaces' })).toBeVisible({
    timeout: READY,
  });

  await expect(page.getByRole('navigation', { name: 'Sections' })).toHaveCount(0);

  const bars = page.locator('#regulars');
  await expect(bars.getByRole('heading', { name: 'Bars and cafés' })).toBeVisible();
  await expect(bars.locator('a')).toHaveCount(1);
  await expect(bars.locator('a')).toHaveAttribute('href', /\/going-out(\?city=[\w-]+)?$/);
  await expect(bars.locator('ul')).toHaveCount(0);

  const members = page.locator('#members');
  await expect(members.getByRole('heading', { name: 'Members' })).toBeVisible();
  await expect(members.locator('a[href$="/auth"]')).toHaveCount(1);

  await expect(page.locator('a[href*="/dating"]')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /^Dating$/ })).toHaveCount(0);
});
