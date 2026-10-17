import { test, expect } from '@playwright/test';

/**
 * Tags as a first-class discovery axis (anonymous flows). Live on prod.
 *
 * Note: tag slugs + their page <h1> are hyphenated (e.g. "Bear-Bar", not
 * "Bear Bar"), so heading matchers allow a hyphen or space.
 */

// Seed the cookie-consent key so the banner doesn't intercept clicks.
//
// The value must be the SHAPE `useCookieConsent` reads, not a bare string: the
// hook does `JSON.parse(stored)` and then requires `data.version === '1.0'`, so
// a plain 'accepted' throws inside that parse, is caught, and falls through to
// `setShowBanner(true)` — i.e. the suppression silently did nothing. Measured
// on prod 2026-10-05: correct payload -> 0 banner regions, bare string -> 1,
// identical to writing nothing at all. Necessary-only, per the repo's
// decline-non-essential default.
test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    try {
      localStorage.setItem(
        'queer-guide-cookie-consent',
        JSON.stringify({
          preferences: { necessary: true, functional: false, analytics: false, marketing: false },
          version: '1.0',
          timestamp: new Date(0).toISOString(),
        }),
      );
    } catch {
      /* storage unavailable */
    }
  });
});

test.describe('tag discovery', () => {
  test('venue detail shows clickable tag chips that resolve by slug', async ({ page }) => {
    await page.goto('/venues/the-long-island-eagle-tavern');
    await expect(page.getByRole('heading', { name: 'The Long Island Eagle Tavern' })).toBeVisible();

    // Tag chips render as links to the canonical tag page using the slug.
    const bearBar = page.locator('a[href*="/tags/bear-bar"]').first();
    await expect(bearBar).toBeVisible();
    await expect(bearBar).toContainText(/bear[- ]bar/i);

    // Clicking resolves the tag page (the slug-resolver fix) — not a 404.
    await bearBar.click();
    await expect(page).toHaveURL(/\/tags\/bear-bar/);
    await expect(page.getByRole('heading', { name: /^Bear[- ]Bar$/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/tag not found/i)).toHaveCount(0);
  });

  test('canonical tag page aggregates linked content + has a Follow affordance', async ({
    page,
  }) => {
    await page.goto('/tags/bear-bar');
    await expect(page.getByRole('heading', { name: /^Bear[- ]Bar$/i })).toBeVisible({
      timeout: 15_000,
    });

    // Cross-content aggregation: a venue-vocabulary tag surfaces a Venues section.
    await expect(page.getByRole('heading', { name: 'Venues' })).toBeVisible();

    // Follow affordance present (anon: clicking prompts sign-in, button still renders).
    await expect(page.getByRole('button', { name: /^Follow$/ })).toBeVisible();
  });

  test('marketplace-tagged term shows a Shop section on the tag page', async ({ page }) => {
    await page.goto('/tags/occ-everyday');
    await expect(page.getByRole('heading', { name: /^Everyday$/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('heading', { name: 'Shop' })).toBeVisible();
  });

  test('the cross-entity glossary rail renders on a venue detail', async ({ page }) => {
    // THIS ASSERTED A RAIL THAT IS NOT ON THIS SURFACE, and the component is not
    // the thing that broke — it was never mounted here.
    //
    // `SimilarItems` ("More like this") is mounted on news and personality
    // detail; `src/pages/VenueDetail.tsx` has never rendered it. On CityDetail it
    // was deliberately REMOVED, and that file says why in its own comment: "Two
    // rails were cut as duplicates, not casualties: [...] `SimilarItems`
    // filtered to cities answered the question `SimilarCities` already answers
    // with equality-aware ranking. One question, one module." So the heading does
    // not appear on /city/berlin, /city/chicago, /personalities/marsha-p-johnson
    // or any of four venue pages measured on 2026-10-17, and
    // `scrollIntoViewIfNeeded` sat until the 30s test timeout every scheduled
    // nightly.
    //
    // NOT a data outage, which was checked rather than assumed: the search-proxy
    // `/similar` endpoint answers this corpus fine — a POST for Berlin returns
    // scored venue and city neighbours.
    //
    // What a venue detail DOES carry is a genuinely cross-entity rail, which is
    // what this test is named for: "From the glossary" (venue -> defined terms),
    // rendered by src/components/tags/FromTheGlossary.tsx. Measured on the same
    // fixture: an <h2> whose section links to /tags/lgbtq-friendly,
    // /tags/gay-bar and /tags/leather-bar. That is this file's subject — tag
    // discovery — where "More like this" is semantic-neighbour discovery and
    // belongs to whichever page mounts it.
    await page.goto('/venues/the-long-island-eagle-tavern');
    const rail = page.getByRole('heading', { name: /from the glossary/i });
    await rail.scrollIntoViewIfNeeded();
    await expect(rail).toBeVisible();
    // Paired: the rail links OUT to the other entity type. Without this the
    // heading alone passes on an empty rail, which is what a dark discovery
    // surface looks like.
    const section = page.locator('section', { has: rail });
    await expect(section.locator('a[href^="/tags/"]').first()).toBeVisible();
  });

  test('search tag filter narrows results via the ?tags= URL', async ({ page }) => {
    await page.goto('/search?q=eagle&types=venue&tags=leather-bar');
    // The active tag filter chip is shown (proves ?tags= was applied).
    await expect(page.getByText(/leather[- ]bar/i).first()).toBeVisible({ timeout: 15_000 });
    // Results come back (worker filters facets->tags). Result cards are
    // role="button" divs (not <a>) that navigate to a venue on click, so assert
    // the result-count summary rather than a /venues/ anchor.
    await expect(page.getByText(/\d+\s+results?/i).first()).toBeVisible({ timeout: 15_000 });
  });
});
