import { test, expect } from '@playwright/test';

/**
 * No link may carry its locale twice.
 *
 * The bug this guards (found 2026-08-16, fixed in BreadcrumbBar): the
 * breadcrumb bar prefixed the locale itself AND handed the result to
 * `LocalizedLink`, which prefixed it again. Every crumb on a non-English
 * detail page pointed at `/fr/fr/…` — Home, the section, and the section's
 * filtered view — and each one 404s. It surfaced only as a slow trickle of
 * `[404] /:locale/fr/*` rows on the error board across six sections, because
 * nothing else on the page was wrong and no test looked at hrefs.
 *
 * The assertion is deliberately page-wide rather than breadcrumb-specific.
 * Double-prefixing is a property of any component that localizes a path that
 * was already localized, and there are several places that build hrefs; a
 * guard scoped to the one component that had the bug would not have caught it
 * anywhere else.
 */

// Two locales, so a single-locale coincidence cannot pass, and both a list
// page (fallback trail) and a detail page (published trail) — they take
// different code paths through BreadcrumbBar.
const CASES = [
  { locale: 'fr', path: '/fr/news' },
  { locale: 'fr', path: '/fr/venues' },
  { locale: 'de', path: '/de/news' },
];

const LOCALES = ['fr', 'de', 'es', 'it', 'pt', 'nl', 'pl', 'tr', 'ru', 'uk', 'ar'];

test.describe('locale prefixing', () => {
  test.setTimeout(90_000);

  for (const { locale, path } of CASES) {
    test(`${path} emits no doubled locale prefix`, async ({ page }) => {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await page.locator('main').first().waitFor({ state: 'visible', timeout: 30_000 });
      // Breadcrumbs render from a context the page publishes after its data
      // arrives, so give the trail a chance to exist before reading hrefs —
      // otherwise this passes by finding no links at all.
      await page.locator(`a[href^="/${locale}/"]`).first().waitFor({ timeout: 20_000 });

      const doubled = await page.evaluate((locales) => {
        const re = new RegExp(`^/(${locales.join('|')})/\\1(/|$|\\?)`);
        return [...document.querySelectorAll('a[href]')]
          .map((a) => a.getAttribute('href') ?? '')
          .filter((h) => re.test(h));
      }, LOCALES);

      expect(doubled, `doubled-locale hrefs on ${path}: ${doubled.join(', ')}`).toEqual([]);
    });
  }

  test('a localized detail page keeps its breadcrumb links reachable', async ({ page }) => {
    // The detail path is where the bug actually bit: a list page's trail is a
    // single crumb and renders nothing, so it could never have shown it.
    await page.goto('/fr/news', { waitUntil: 'domcontentloaded' });
    const firstArticle = page.locator('main a[href*="/news/"]').first();
    await firstArticle.waitFor({ timeout: 30_000 });
    await firstArticle.click();

    const crumbs = page.locator('nav[aria-label="Breadcrumb"] a');
    await crumbs.first().waitFor({ timeout: 30_000 });

    for (const href of await crumbs.evaluateAll((els) =>
      els.map((e) => e.getAttribute('href') ?? ''),
    )) {
      expect(href, `breadcrumb href ${href}`).not.toMatch(/^\/fr\/fr(\/|$|\?)/);
      expect(href, `breadcrumb href ${href}`).toMatch(/^\/fr(\/|$)/);
    }
  });
});
