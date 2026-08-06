import { test, expect, type Page } from '@playwright/test';

/**
 * Mobile bottom navigation bar (MobileBottomNav + MobileNavSheet).
 *
 * Runs against the configured baseURL — defaults to production
 * (https://queer.guide); localhost is CORS-blocked by Supabase, so prod is the
 * real target (same rationale as visual-mobile.spec.ts). All cases use the
 * anonymous state — no Supabase data or auth fixture required.
 *
 * Reduced motion is forced so the hide-on-scroll transform is disabled and the
 * bar stays put for stable assertions.
 */
test.use({ reducedMotion: 'reduce' });

const MOBILE = { width: 390, height: 844 };
// Scoped to the fixed bottom bar — the desktop header renders its own nav
// landmark ("Primary"), and a bare aria-label match would be ambiguous.
const bottomNav = (page: Page) => page.locator('nav.fixed[aria-label="Navigation"]');

/**
 * The cookie-consent banner is fixed to the bottom (z-sticky) and overlaps the
 * bottom nav on a first visit, intercepting taps. Dismiss it before driving the
 * bar. No-op once consent is stored / if the banner never renders.
 */
async function dismissCookieBanner(page: Page) {
  const banner = page.getByRole('region', { name: /cookie settings/i });
  // The banner animates in after consent state loads — a bare isVisible()
  // check races it and leaves it covering the bottom bar. Give it a moment.
  const appeared = await banner
    .waitFor({ state: 'visible', timeout: 3_000 })
    .then(() => true)
    .catch(() => false);
  if (!appeared) return;
  await banner.getByRole('button', { name: /necessary only|accept all/i }).first().click();
  await expect(banner).toBeHidden().catch(() => {});
}

/**
 * Wait for the React app to mount. `networkidle` never settles against prod
 * (analytics/realtime connections keep the network busy indefinitely), so we
 * key on the root element getting children instead.
 */
async function waitForAppMount(page: Page) {
  await page.waitForFunction(
    () => (document.getElementById('root')?.children.length ?? 0) > 0,
    undefined,
    { timeout: 30_000 },
  );
}

async function gotoMobile(page: Page, path: string) {
  await page.setViewportSize(MOBILE);
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await waitForAppMount(page);
  await dismissCookieBanner(page);
  await page.waitForTimeout(300); // hydration / handler binding
}

test.describe('Mobile bottom navigation', () => {
  test.setTimeout(60_000);

  test('renders the four destination tabs at mobile viewport', async ({ page }) => {
    await gotoMobile(page, '/');
    const nav = bottomNav(page);
    await expect(nav).toBeVisible();
    for (const label of ['Home', 'Explore', 'Hub', 'You']) {
      await expect(nav.getByText(label, { exact: true })).toBeVisible();
    }
    // The raised contribute button is icon-only — identified by aria-label.
    await expect(nav.getByRole('button', { name: /sign in to contribute/i })).toBeVisible();
  });

  test('tabs meet the minimum tap-target size', async ({ page }) => {
    await gotoMobile(page, '/');
    const nav = bottomNav(page);
    for (const label of ['Home', 'Explore', 'Hub', 'You']) {
      const box = await nav.getByText(label, { exact: true }).locator('..').boundingBox();
      expect(box, `${label} tab has a bounding box`).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
  });

  test('Explore opens the intent chooser on a plain tap', async ({ page }) => {
    // The sheet used to open only on long-press, with a 24px chevron as its
    // sole affordance. An undiscoverable gesture cannot be the entry to
    // primary navigation, so the tab's own tap opens it now.
    await gotoMobile(page, '/');
    const explore = bottomNav(page).getByText('Explore', { exact: true });
    await expect(explore.locator('xpath=ancestor::a')).toHaveAttribute(
      'aria-haspopup',
      'dialog',
    );
    await explore.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    // The tap opened the sheet INSTEAD of navigating.
    await expect(page).not.toHaveURL(/\/search\b/);
  });

  test('Explore keeps a real href to the discovery surface', async ({ page }) => {
    // Intercepting the tap must not cost middle-click, "open in new tab" or a
    // no-JS fallback, so the slot stays a genuine link to /search.
    await gotoMobile(page, '/');
    await expect(
      bottomNav(page).getByText('Explore', { exact: true }).locator('xpath=ancestor::a'),
    ).toHaveAttribute('href', /\/search$/);
  });

  test('is hidden on desktop viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await waitForAppMount(page);
    await expect(bottomNav(page)).toBeHidden();
  });

  test('the destination hub lists both intents and every browse route', async ({ page }) => {
    await gotoMobile(page, '/');
    await bottomNav(page).getByText('Explore', { exact: true }).click();

    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText(/Explore Queer Guide/i)).toBeVisible();
    // Intents lead; the browse layer stays reachable beneath them.
    // /people appears TWICE by design — once as the "Meet people" intent and
    // once in the browse grid beneath it — so these must not be strict.
    await expect(sheet.locator('a[href$="/going-out"]').first()).toBeVisible();
    await expect(sheet.locator('a[href$="/people"]').first()).toBeVisible();
    await expect(sheet.locator('a[href$="/venues"]').first()).toBeVisible();
    await expect(sheet.locator('a[href$="/events"]').first()).toBeVisible();
  });

  test('tapping a hub destination navigates and closes the sheet', async ({ page }) => {
    await gotoMobile(page, '/');
    await bottomNav(page).getByText('Explore', { exact: true }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    await sheet.locator('a[href$="/venues"]').first().click();

    await expect(page).toHaveURL(/\/venues\/?$/);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('contribute gates anonymous users to sign-in (no submit nav)', async ({ page }) => {
    await gotoMobile(page, '/');
    await bottomNav(page).getByRole('button', { name: /sign in to contribute/i }).click();

    // The auth dialog surfaces (email field) and we did not route to /submit.
    await expect(page.locator('input[type="email"]').first()).toBeVisible();
    expect(new URL(page.url()).pathname).not.toContain('/submit');
  });

  test('Hub gates anonymous users to /auth', async ({ page }) => {
    await gotoMobile(page, '/');
    await bottomNav(page).getByText('Hub', { exact: true }).click();
    await expect(page).toHaveURL(/\/auth\b/);
  });

  test('is absent on the full-bleed map route', async ({ page }) => {
    await gotoMobile(page, '/map');
    await expect(bottomNav(page)).toHaveCount(0);
  });
});
