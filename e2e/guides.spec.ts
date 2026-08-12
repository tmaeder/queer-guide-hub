import { test, expect } from '@playwright/test';

// Smoke specs for the unified Guides family (guides + lists + quests).
// Runs against E2E_BASE_URL (defaults to https://queer.guide). Relies on the
// migrated seed guides being published on prod.

test.describe('Guides — unified hub', () => {
  test.setTimeout(120_000);

  test('/guides renders the hub with guide cards', async ({ page }) => {
    await page.goto('/guides');
    await page.waitForLoadState('domcontentloaded');
    await expect(
      page.getByRole('heading', { name: /guides/i, level: 1 }),
    ).toBeVisible({ timeout: 30_000 });
    const guideLinks = page.locator('a[href^="/guides/"]');
    await expect(guideLinks.first()).toBeVisible({ timeout: 30_000 });
  });

  // WAS: 'header primary nav links to /guides'. The subway rebrand turned the
  // desktop header into the Intent Router — six intents, no destination links
  // and no dropdowns — so /venues, /events, /news, /marketplace and /guides all
  // left the header by design. The others are still reachable because their
  // cluster hub links them; /guides was not, which left the whole family with
  // no path from desktop chrome at all. `/shop` (the `shop` cluster hub, per
  // DESTINATIONS in src/config/navigation.ts) now carries it, and this test
  // guards that path rather than the retired header one.
  test('the shop hub links to the guides family', async ({ page }) => {
    await page.goto('/shop');
    await page.waitForLoadState('domcontentloaded');
    const main = page.getByRole('main');
    // The "All guides" action is deliberately data-independent — the guide
    // cards beside it come from a query that can legitimately return nothing,
    // and gating the only nav path on that query is what orphaned /guides in
    // the first place. Assert the unconditional link, not the cards.
    await expect(main.locator('a[href*="/guides"]').first()).toBeVisible({ timeout: 30_000 });
  });

  test('guide detail renders hero + picks', async ({ page }) => {
    await page.goto('/guides');
    await page.waitForLoadState('domcontentloaded');
    const first = page.locator('article a[href^="/guides/"]').first();
    await first.waitFor({ timeout: 30_000 });
    await first.click();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 });
  });

  test('legacy /venues/guides redirects into /guides', async ({ page }) => {
    await page.goto('/venues/guides');
    await page.waitForURL(/\/guides/, { timeout: 30_000 });
    expect(page.url()).toContain('/guides');
  });

  test('legacy /marketplace/guides redirects into /guides', async ({ page }) => {
    await page.goto('/marketplace/guides');
    await page.waitForURL(/\/guides/, { timeout: 30_000 });
    expect(page.url()).toContain('/guides');
  });

  test('legacy /quests redirects into /guides?format=quest', async ({ page }) => {
    await page.goto('/quests');
    await page.waitForURL(/\/guides\?format=quest/, { timeout: 30_000 });
    expect(page.url()).toContain('format=quest');
  });

  test('/venues still renders a guides rail', async ({ page }) => {
    await page.goto('/venues');
    await page.waitForLoadState('domcontentloaded');
    const guidesSection = page.getByRole('region', { name: /^guides$/i });
    await expect(guidesSection).toBeVisible({ timeout: 30_000 });
    await expect(guidesSection.getByRole('link', { name: /all guides/i })).toBeVisible();
  });
});
