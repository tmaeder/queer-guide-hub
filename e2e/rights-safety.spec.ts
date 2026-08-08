import { test, expect } from '@playwright/test';

/**
 * End-to-end guards for the rights surface.
 *
 * These assert things unit tests structurally cannot: that a criminalising
 * country never renders a reassuring verdict AT ANY POINT during load, that
 * the coverage note reports a real fraction rather than a tautology, and that
 * every country is reachable rather than the first twelve per tier.
 *
 * Each one corresponds to a defect that shipped to production:
 *   - "239 of 250"      the note rendered {n} of {n} and could never fail
 *   - Germany reachable the world list was .slice(0, 12) with no expander
 *   - 7 vs 5 death      "No legal certainty" was read as "No" on 5 countries
 *   - never "Welcoming" the empty report is indistinguishable from measured-safe
 *
 * playwright's baseURL defaults to https://queer.guide, so a local run without
 * E2E_BASE_URL tests the DEPLOYED site, not your working tree.
 */
const dismiss = async (page) => {
  const btn = page.getByRole('button', { name: /accept|decline|reject|only essential/i }).first();
  if (await btn.isVisible().catch(() => false)) await btn.click().catch(() => {});
};

test('/rights states real coverage, not a tautology', async ({ page }) => {
  await page.goto('/rights');
  await dismiss(page);
  await expect(page.locator('main')).toContainText(/239 of 250/, { timeout: 30_000 });
});

test('/rights reaches every country, not the first twelve per tier', async ({ page }) => {
  await page.goto('/rights');
  await dismiss(page);
  const world = page.locator('#world');
  await expect(world.getByRole('link', { name: 'Germany', exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(world.getByRole('link', { name: 'Thailand', exact: true })).toBeVisible();
});

test('/rights separates confirmed from uncertain death penalty', async ({ page }) => {
  await page.goto('/rights');
  await dismiss(page);
  const main = page.locator('main');
  await expect(main).toContainText(/In 7 the penalty is death/, { timeout: 30_000 });
  await expect(main).toContainText(/In 5 more our source names the death penalty as possible/);
});

test('an unscored country is never filed as Protected or Mixed', async ({ page }) => {
  await page.goto('/rights');
  await dismiss(page);
  await expect(page.locator('#world')).toContainText(/Not scored/, { timeout: 30_000 });
  // North Korea scores 60 purely because the formula opens at 50; it must not
  // read as Protected on an LGBTQ+ safety page.
  const world = await page.locator('#world').innerText();
  const protectedBlock = world.split('Mixed')[0];
  expect(protectedBlock).not.toContain('North Korea');
});

test('Afghanistan warns about the death penalty rather than calling it criminalised only', async ({ page }) => {
  await page.goto('/country/afghanistan');
  await dismiss(page);
  await expect(page.locator('main')).toContainText(
    /Travel Warning: Same-sex activity may carry the death penalty/, { timeout: 30_000 });
  await expect(page.locator('main')).toContainText(/no legal certainty/);
});

test('INVARIANT: a criminalising country never renders as Welcoming', async ({ page }) => {
  test.setTimeout(120_000);
  // Sampled from first paint, so a reassuring LOADING state fails too — that
  // was the live defect: the tile read "Welcoming" for ~30s under a
  // death-penalty banner.
  const seen: string[] = [];
  await page.goto('/country/afghanistan', { waitUntil: 'commit' });
  for (let i = 0; i < 240; i++) {
    const txt = await page.locator('main').innerText().catch(() => '');
    const m = txt.match(/FOR LGBTQ\+ TRAVELERS\s*\n\s*([^\n]+)/i);
    if (m && seen[seen.length - 1] !== m[1]) seen.push(m[1]);
    if (seen.includes('Dangerous')) break;
    await page.waitForTimeout(250);
  }
  expect(seen.length, `verdict never rendered; saw ${JSON.stringify(seen)}`).toBeGreaterThan(0);
  expect(seen, `verdict sequence was ${JSON.stringify(seen)}`).not.toContain('Welcoming');
  expect(seen).toContain('Dangerous');
});

test('crisis-adjacent surfaces stay animation-free', async ({ page }) => {
  await page.goto('/rights');
  await expect(page.locator('main h1')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('div.fixed.top-0.left-0.right-0')).toHaveCount(0);
});
