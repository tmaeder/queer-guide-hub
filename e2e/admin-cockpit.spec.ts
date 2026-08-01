/**
 * Cockpit e2e — /admin had no coverage at any viewport, which is how it shipped
 * with a hard `grid-cols-12` and no breakpoint: on a 375px phone a `sm` widget
 * rendered ~90px wide holding a display-size number.
 *
 * The assertions here are the invariants of the rebuild, not a screenshot:
 * no horizontal overflow, 44px tap targets, identical section order at every
 * width, and a bounded request budget.
 *
 * Lives in the default `chromium` project (the one that gets the admin
 * storageState) with a per-describe viewport override — the `mobile` project in
 * playwright.config.ts has no storageState and no setup dependency, so an admin
 * spec placed there would never be authenticated.
 *
 * Admin-only: skipped when no admin storage state was minted (see auth.setup.ts).
 */
import { test, expect, type Page } from '@playwright/test';

const PHONE = { width: 375, height: 812 };
const DESKTOP = { width: 1440, height: 900 };

/** Probe for the page's own heading, not the URL — the route lingers on /admin
 *  for a moment before the auth guard bounces an anonymous visitor. */
async function isAuthed(page: Page): Promise<boolean> {
  await page.goto('/admin', { waitUntil: 'domcontentloaded' });
  return page
    .getByRole('heading', { name: 'Cockpit', exact: true })
    .waitFor({ state: 'visible', timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
}

async function sectionHeadings(page: Page): Promise<string[]> {
  return page.locator('section[aria-labelledby^="cockpit-"] > div > h2').allInnerTexts();
}

test.describe('Cockpit at 375px', () => {
  test.use({ viewport: PHONE });

  test.beforeEach(async ({ page }) => {
    const authed = await isAuthed(page);
    test.skip(!authed, 'requires an admin session (E2E_ADMIN_EMAIL/PASSWORD)');
  });

  test('does not scroll horizontally', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Cockpit', exact: true })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('the public chrome is gone', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Cockpit', exact: true })).toBeVisible();

    // MobileBottomNav: a fixed bottom-0 nav that used to cover the bottom of
    // every admin page (admin content never had the footer's pb-24 clearance).
    await expect(page.locator('nav.fixed.bottom-0')).toHaveCount(0);
    // The public Header's banner landmark. AdminShell brings its own top bar.
    await expect(page.getByRole('banner')).toHaveCount(0);
    // contentinfo = the public Footer.
    await expect(page.getByRole('contentinfo')).toHaveCount(0);
  });

  test('every queue row clears the 44px tap-target floor', async ({ page }) => {
    await page.goto('/admin');
    const needsYou = page.locator('section[aria-labelledby="cockpit-needs-you-heading"]');
    await expect(page.getByRole('heading', { name: 'Cockpit', exact: true })).toBeVisible();

    const links = needsYou.getByRole('link');
    const count = await links.count();
    test.skip(count === 0, 'no pending queues on this environment');

    for (let i = 0; i < count; i++) {
      const box = await links.nth(i).boundingBox();
      expect(box, `row ${i} has no box`).not.toBeNull();
      expect(box!.height, `row ${i} is ${box!.height}px tall`).toBeGreaterThanOrEqual(44);
    }
  });

  test('a queue row navigates into its own inbox queue', async ({ page }) => {
    await page.goto('/admin');
    const needsYou = page.locator('section[aria-labelledby="cockpit-needs-you-heading"]');
    const first = needsYou.getByRole('link').first();
    test.skip((await needsYou.getByRole('link').count()) === 0, 'no pending queues');

    await first.click();
    await expect(page).toHaveURL(/[?&]queue=/);
  });

  test('loads on a bounded request budget', async ({ page }) => {
    let restCalls = 0;
    let countsCalls = 0;
    page.on('request', (req) => {
      const url = req.url();
      if (!url.includes('/rest/v1/')) return;
      restCalls++;
      if (url.includes('get_admin_counts')) countsCalls++;
    });

    await page.goto('/admin', { waitUntil: 'networkidle' });
    // The pre-rebuild page fired ~25 REST calls on a cold load.
    expect(restCalls).toBeLessThan(10);
    // Exactly once proves the sidebar badges and the feed share one cache entry.
    expect(countsCalls).toBe(1);
  });
});

test.describe('Cockpit responsive layout', () => {
  test.beforeEach(async ({ page }) => {
    const authed = await isAuthed(page);
    test.skip(!authed, 'requires an admin session (E2E_ADMIN_EMAIL/PASSWORD)');
  });

  test('renders the same sections in the same order at every width', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Cockpit', exact: true })).toBeVisible();
    const onPhone = await sectionHeadings(page);

    await page.setViewportSize(DESKTOP);
    await expect(page.getByRole('heading', { name: 'Cockpit', exact: true })).toBeVisible();
    const onDesktop = await sectionHeadings(page);

    expect(onPhone.length).toBeGreaterThan(0);
    expect(onDesktop).toEqual(onPhone);
  });

  test('moves the reference sections into a right rail at lg, and stacks below on a phone', async ({
    page,
  }) => {
    const needsYou = page.locator('section[aria-labelledby="cockpit-needs-you-heading"]');
    const jumpTo = page.locator('section[aria-labelledby="cockpit-jump-to-heading"]');

    await page.setViewportSize(DESKTOP);
    await page.goto('/admin');
    await expect(jumpTo).toBeVisible();
    const feedWide = (await needsYou.boundingBox())!;
    const railWide = (await jumpTo.boundingBox())!;
    expect(railWide.x).toBeGreaterThanOrEqual(feedWide.x + feedWide.width);

    await page.setViewportSize(PHONE);
    await expect(jumpTo).toBeVisible();
    const feedNarrow = (await needsYou.boundingBox())!;
    const railNarrow = (await jumpTo.boundingBox())!;
    expect(railNarrow.y).toBeGreaterThan(feedNarrow.y);
  });
});
