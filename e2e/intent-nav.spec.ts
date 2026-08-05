import { test, expect } from '@playwright/test';

/**
 * Intent Router navigation.
 *
 * Guards the properties that made the old nav wrong, so they cannot come back:
 *
 *  1. The desktop row is single-sourced from INTENT_NAV. It used to be a
 *     hardcoded array in Header.tsx that had silently diverged from the config,
 *     leaving /venues and /people unreachable from desktop chrome.
 *  2. Every intent route resolves — unprefixed and locale-prefixed. A route
 *     declared outside the `/:locale?` parent renders NotFound under /de/.
 *  3. /shop reaches the composite page rather than the legacy `shop/*`
 *     redirect, which depends on declaration order in routes.tsx.
 *  4. Retiring /places preserves the locale prefix (LocalizedRedirect, not a
 *     bare Navigate, which would bounce /de/places to English).
 *  5. Crisis-adjacent intents stay animation-free.
 */

test.use({ reducedMotion: 'reduce' });

const INTENTS = [
  { label: 'Going out', href: '/going-out' },
  { label: 'Travelling', href: '/travel' },
  { label: 'Rights', href: '/rights' },
  { label: 'Support', href: '/support' },
  { label: 'Shop', href: '/shop' },
];

test.describe('desktop intent nav', () => {
  test.skip(({ isMobile }) => !!isMobile, 'desktop row is hidden below lg');

  test('renders exactly the five intents in the primary landmark', async ({ page }) => {
    await page.goto('/');
    const nav = page.locator('header nav[aria-label="Primary"]');
    await expect(nav).toBeVisible();

    const links = nav.locator('a');
    await expect(links).toHaveCount(INTENTS.length);
    for (const [i, intent] of INTENTS.entries()) {
      await expect(links.nth(i)).toHaveText(intent.label);
      await expect(links.nth(i)).toHaveAttribute('href', new RegExp(`${intent.href}$`));
    }
  });

  test('marks the active intent with aria-current', async ({ page }) => {
    await page.goto('/rights');
    const nav = page.locator('header nav[aria-label="Primary"]');
    await expect(nav.locator('a[aria-current="page"]')).toHaveCount(1);
    await expect(nav.locator('a[aria-current="page"]')).toHaveText('Rights');
  });

  test('lights the owning intent on a browse route it claims', async ({ page }) => {
    // /venues belongs to Going out — this is the prefix matching that replaced
    // the old exact-equality check.
    await page.goto('/venues');
    const current = page.locator('header nav[aria-label="Primary"] a[aria-current="page"]');
    await expect(current).toHaveText('Going out');
  });
});

test.describe('intent routes', () => {
  for (const intent of INTENTS) {
    test(`${intent.href} renders a page, not a 404`, async ({ page }) => {
      await page.goto(intent.href);
      await expect(page.locator('main h1')).toBeVisible();
      await expect(page.locator('main')).not.toContainText('Page not found');
    });
  }

  test('resolves under a locale prefix', async ({ page }) => {
    await page.goto('/de/rights');
    await expect(page.locator('main h1')).toBeVisible();
    await expect(page.locator('main')).not.toContainText('Page not found');
  });

  test('/shop reaches the composite page, not the legacy redirect', async ({ page }) => {
    await page.goto('/shop');
    await expect(page).toHaveURL(/\/shop$/);
    await expect(page.locator('main h1')).toBeVisible();
  });

  test('/shop/<legacy> still redirects to the marketplace', async ({ page }) => {
    await page.goto('/shop/anything-legacy');
    await expect(page).toHaveURL(/\/marketplace/);
  });

  test('/places is retired to the Travelling intent', async ({ page }) => {
    await page.goto('/places');
    await expect(page).toHaveURL(/\/travel$/);
  });

  test('retiring /places keeps the locale prefix', async ({ page }) => {
    await page.goto('/de/places');
    await expect(page).toHaveURL(/\/de\/travel$/);
  });
});

test.describe('honest coverage', () => {
  test('/rights states its coverage rather than implying completeness', async ({ page }) => {
    await page.goto('/rights');
    await expect(page.locator('main')).toContainText(/250 of 250/);
  });

  test('/going-out names the event window it fell back to', async ({ page }) => {
    await page.goto('/going-out');
    // The ladder always reports which rung produced the list, so a thin week
    // reads as thin coverage rather than as a dead scene.
    await expect(page.locator('main')).toContainText(
      /Showing events (tonight|this weekend|in the next \d+ days|soonest anywhere)|No upcoming events/,
    );
  });
});

test.describe('crisis-adjacent surfaces stay calm', () => {
  for (const path of ['/rights', '/support']) {
    test(`${path} renders no scroll-progress animation`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('main h1')).toBeVisible();
      // EditorialDetailLayout's progress bar is a fixed 2px full-width motion
      // div; disableProgress must remove it entirely on these routes.
      await expect(page.locator('div.fixed.top-0.left-0.right-0')).toHaveCount(0);
    });
  }
});
