import { test, expect } from '@playwright/test';
import { SUPPORTED_LOCALES } from '../functions/_lib/routeMeta';

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

// Imported, never hand-written. The original list was authored by hand and
// carried four locales the app does not support (nl, pl, tr, uk) while
// OMITTING zh, ja, ko and en — so `/ko/ko/x` and `/zh/zh/x` were invisible to
// this guard, and the error board contained `/ko/ko`. A literal list is a
// second source of truth that silently drifts from the real one.
const LOCALES = [...SUPPORTED_LOCALES];

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

  /**
   * The doubled-locale URLs must hard-404 and advertise NOTHING.
   *
   * The `a[href]` sweep above could never have caught this: the fan-out lives
   * in `link[rel=alternate][hreflang]`, which that scan does not read. The
   * producer was fixed on 2026-08-16, but `/fr/fr/places` still answered 200
   * as an indexable SPA shell and emitted an alternate for all 11 locales,
   * each carrying the stray segment — so one junk URL minted ten more and
   * crawlers recycled them indefinitely.
   *
   * Asserted as a PROPERTY over live locale pairs rather than a frozen URL
   * list, so adding a locale extends the guard automatically.
   */
  for (const [outer, inner] of [
    ['fr', 'fr'],
    ['it', 'fr'],
    ['ko', 'ko'],
  ] as const) {
    test(`/${outer}/${inner}/places hard-404s and advertises no alternates`, async ({ request }) => {
      const res = await request.get(`/${outer}/${inner}/places`, { maxRedirects: 0 });
      expect(res.status(), `/${outer}/${inner}/places must hard-404, not soft-404 at 200`).toBe(404);

      const html = await res.text();
      // Nothing may point back at the doubled shape, in any locale.
      const alternates = [...html.matchAll(/<link[^>]+rel="alternate"[^>]*>/g)].map((m) => m[0]);
      expect(
        alternates,
        `a 404 must not advertise hreflang alternates: ${alternates.join(' ')}`,
      ).toEqual([]);
      expect(html).not.toMatch(new RegExp(`/[a-z]{2}/${inner}/places`));
    });
  }

  test('positive control: the single-prefix URL still resolves', async ({ request }) => {
    // Without this, the 404 assertions above would also pass if /places broke
    // entirely or every locale route started 404-ing.
    const res = await request.get('/fr/places', { maxRedirects: 0 });
    expect(res.status()).toBe(200);
  });

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
