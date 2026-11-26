import { test, expect, type Page } from '@playwright/test';

/**
 * The You menu: every settings section opens and edits in place, on the
 * dock's You sheet (phones) and the header avatar popover (desktop). The menu
 * itself never scrolls; an open section scrolls inside its own box.
 */

const SIGNED_IN = Boolean(process.env.E2E_ADMIN_EMAIL || process.env.E2E_STORAGE_STATE);
const SECTIONS = [
  'Profile',
  'Body & about',
  'Identity',
  'Dating & 18+',
  'Travel',
  'Notifications',
  'Language & display',
  'Privacy & visibility',
  'Sign-in & security',
  'Your data',
];

async function declineConsent(page: Page) {
  const necessary = page.getByRole('button', { name: /necessary only/i });
  const shown = await necessary
    .waitFor({ state: 'visible', timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  if (shown) {
    await necessary.click().catch(() => {});
    await necessary.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
  }
}

async function checkEverySection(page: Page) {
  const menu = page.getByRole('dialog', { name: /^you$/i });
  for (const name of SECTIONS) {
    await menu.getByRole('button', { name, exact: true }).click();
    const back = menu.getByRole('button', { name: /^settings$/i });
    await expect(back).toBeFocused();
    await expect(menu.getByRole('heading', { name, level: 2, exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect
      .poll(() => menu.evaluate((el) => el.scrollHeight - el.clientHeight))
      .toBeLessThanOrEqual(1);
    await expect
      .poll(() => menu.evaluate((el) => el.scrollWidth - el.clientWidth))
      .toBeLessThanOrEqual(1);
    if (name === 'Notifications') {
      // A switch with an aria-label once picked up the 44px button minimum and
      // parked its thumb mid-track.
      const width = await menu
        .getByRole('switch')
        .first()
        .evaluate((el) => el.getBoundingClientRect().width);
      expect(width).toBeLessThan(40);
    }
    await back.click();
    await expect(menu.getByRole('button', { name, exact: true })).toBeFocused();
  }
}

test.describe('You menu', () => {
  test.skip(!SIGNED_IN, 'Requires a signed-in session (E2E_ADMIN_EMAIL / E2E_STORAGE_STATE).');

  for (const [w, h] of [
    [320, 568],
    [390, 844],
  ]) {
    test(`phone ${w}px: the dock You sheet edits every section in place`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width: w, height: h });
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await declineConsent(page);
      const you = page
        .getByRole('navigation', { name: 'Navigation' })
        .getByRole('link', { name: /^you\b/i });
      await expect(you).toBeVisible({ timeout: 20_000 });
      await you.click();
      await checkEverySection(page);
    });
  }

  test('desktop: the header avatar popover edits every section in place', async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await declineConsent(page);
    const avatar = page.getByRole('button', { name: 'Open user menu' });
    await expect(avatar).toBeVisible({ timeout: 20_000 });
    await avatar.click();
    await checkEverySection(page);
  });
});
