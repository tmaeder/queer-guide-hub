import { test, expect, type Page } from '@playwright/test';

/**
 * Homepage "magazine front page" (PR #2055), rebuilt on the subway-map system
 * in #2673/#2701 — the section headings below are the rebrand's copy
 * (Departures / Where are you riding? / No ads…), not the original magazine
 * wording. Update them together or this spec reports missing sections that are
 * merely renamed.
 *
 * Runs against the configured baseURL — defaults to production. Anonymous
 * state, no fixtures. Below-fold sections are mounted lazily by
 * DeferredSection (IntersectionObserver, 800px rootMargin), so tests scroll
 * progressively before asserting on them. Content assertions stay resilient
 * to rotating data: they check section chrome and shape, not today's rows.
 */
test.use({ reducedMotion: 'reduce' });

const DESKTOP = { width: 1280, height: 900 };
const MOBILE = { width: 390, height: 844 };

async function dismissCookieBanner(page: Page) {
  const banner = page.getByRole('region', { name: /cookie settings/i });
  if (!(await banner.isVisible().catch(() => false))) return;
  await banner.getByRole('button', { name: /necessary only|accept all/i }).first().click();
  await expect(banner).toBeHidden().catch(() => {});
}

async function gotoHome(page: Page, viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport);
  // Wait for the masthead h1 rather than `networkidle`: the page keeps
  // background queries in flight for the deferred bands, so networkidle is not
  // a reliable settle point (same rationale as design-system.spec.ts).
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.locator('main h1').waitFor({ state: 'visible', timeout: 30_000 });
  await dismissCookieBanner(page);
  await page.waitForTimeout(500); // hydration
}

/** Scroll the page in steps so every DeferredSection mounts and settles. */
async function scrollThrough(page: Page) {
  for (let i = 0; i < 8; i++) {
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(700);
  }
}

test.describe('homepage masthead', () => {
  test.setTimeout(90_000);

  test('desktop: visible h1 masthead with a map CTA', async ({ page }) => {
    await gotoHome(page, DESKTOP);

    // The h1 is the visible identity overlay, not sr-only.
    const h1 = page.locator('main h1');
    await expect(h1).toBeVisible();
    await expect(h1).not.toHaveClass(/sr-only/);

    // The masthead carries no numbers, so nothing here asserts on them.
    // Measured on production 2026-08-16: `SubwayHero` contains ZERO
    // `.tabular-nums` — an h1, a lede, the ⌘K field, "Open the map" and the
    // intent map. The stat chips this test was written for belonged to the
    // pre-rebrand MapLibre hero, deleted alongside the sibling test below.
    await expect(page.locator('main h1')).toHaveCount(1);

    // Map CTA present and pointing at /map.
    const mapLink = page.getByRole('link', { name: /open the map/i });
    await expect(mapLink).toBeVisible();
    await expect(mapLink).toHaveAttribute('href', /\/map/);
  });

  // REMOVED 2026-08-16: the 'live stat chips' block from the test above. Its
  // selector was `main h1 ~ * .tabular-nums, main .tabular-nums` — page-wide,
  // not masthead-scoped — so after the rebrand emptied the hero it silently
  // began sampling whatever else on the page happens to use tabular numerals,
  // then asserted every one of the first three matches contains a digit 1-9.
  //
  // On the live homepage those matches are the departures board and the
  // marketplace prices. A departure row for an EVENT carries a time
  // ("SUN 02:00"); a row for a VENUE has no departure time and renders that
  // cell empty — correctly. So the assertion failed on `""` whenever the rails
  // led with venues, which is data- and location-dependent: it passed for
  // months, then failed twice in a row on 2026-08-16 (run 31923932566).
  //
  // A too-broad selector does not fail when the thing it describes is deleted;
  // it quietly starts measuring something else and reports that as a
  // regression in the feature it names.

  // REMOVED 2026-08-11: 'masthead fades after first map interaction'. The
  // subway rebrand replaced the live MapLibre hero with a static SubwayHero
  // whose CTA links to /map (deliberately dropping the ~1MB maplibre chunk from
  // the homepage), so there is no hero map to interact with and no aria-hidden
  // dimming to observe. The test asserted behaviour that was removed on
  // purpose and could never pass again. The hero contract that still exists —
  // visible non-sr-only h1 plus a /map CTA — is covered by the test above.

  test('mobile: identity band renders above the map in normal flow', async ({ page }) => {
    await gotoHome(page, MOBILE);
    const h1 = page.locator('main h1');
    await expect(h1).toBeVisible();
    await expect(h1).not.toHaveClass(/sr-only/);

    // Band precedes the map section (normal flow, not an overlay).
    const bandBox = await h1.boundingBox();
    const mapBox = await page.locator('main section').first().boundingBox();
    expect(bandBox && mapBox && bandBox.y < mapBox.y).toBeTruthy();
  });
});

test.describe('homepage sections', () => {
  test.setTimeout(120_000);

  test('desktop: magazine sections mount in community-first order', async ({ page }) => {
    await gotoHome(page, DESKTOP);
    await scrollThrough(page);

    // Marketplace is the last lazy/deferred section before the static closing
    // CTA — its chunk load + spotlight/rail fetch can outlast scrollThrough's
    // fixed settle time, so wait for it explicitly before reading headings
    // (flaked as a false "missing" on production, 2026-07-27).
    await expect(
      page.locator('main h2', { hasText: /queer-owned finds|community picks/i }).first(),
    ).toBeVisible({ timeout: 20_000 });

    const headings = page.locator('main h2');
    const texts = (await headings.allTextContents()).map((t) => t.trim());

    // Events — the "Near you" band. Asserted strictly on purpose: a band that
    // `return null`s is exactly the shape a broken query takes, so "absent" is
    // a signal rather than an empty week. The band now guarantees content via
    // its region ladder (city -> country -> "Worth the trip") and renders its
    // chrome even when empty, so this guard is stronger than before.
    // The heading is region-scoped ("Departures — Berlin" / "— Germany" /
    // "— across the network"); the shared word is what this matches.
    expect(
      texts.some((t) => /departures/i.test(t)),
      `events section missing; h2s: ${texts.join(' | ')}`,
    ).toBeTruthy();

    // Destinations — the CityCards band, also self-hiding on an empty result.
    expect(
      texts.some((t) => /where are you riding/i.test(t)),
      `destinations section missing; h2s: ${texts.join(' | ')}`,
    ).toBeTruthy();

    // News magazine.
    expect(texts.some((t) => /latest news/i.test(t))).toBeTruthy();

    // Marketplace — owned rail or its community fallback, below the
    // community sections.
    const shopIdx = texts.findIndex((t) => /queer-owned finds|community picks/i.test(t));
    const newsIdx = texts.findIndex((t) => /latest news/i.test(t));
    expect(shopIdx).toBeGreaterThan(-1);
    expect(shopIdx).toBeGreaterThan(newsIdx);

    // Closing CTA — the static SupportBand, so this one can never self-hide.
    expect(
      texts.some((t) => /no ads|just riders/i.test(t)),
      `closing CTA missing; h2s: ${texts.join(' | ')}`,
    ).toBeTruthy();
  });

  test('desktop: no 4xx from PostgREST while the homepage loads and mounts', async ({ page }) => {
    // Regression guard for PR #2371's incident: a broken embed 400s, and
    // sections that render nothing on error/empty (`return null`) hide the
    // failure from every DOM assertion above. Catch it at the network layer
    // instead, independent of which section swallows the error.
    const failures: string[] = [];
    page.on('response', (response) => {
      const url = response.url();
      if (url.includes('/rest/v1/') && response.status() >= 400) {
        failures.push(`${response.status()} ${url}`);
      }
    });

    await gotoHome(page, DESKTOP);
    await scrollThrough(page);

    expect(failures, `PostgREST 4xx responses: ${failures.join('\n')}`).toEqual([]);
  });

  test('desktop: destinations rail links to city pages', async ({ page }) => {
    await gotoHome(page, DESKTOP);
    await scrollThrough(page);

    const cityLinks = page.locator('main a[href*="/city/"]');
    await expect(cityLinks.first()).toBeVisible({ timeout: 20_000 });
    expect(await cityLinks.count()).toBeGreaterThanOrEqual(3);
  });

  test('desktop: born-this-week strip renders with an interactive celebrate control', async ({
    page,
  }) => {
    await gotoHome(page, DESKTOP);
    await scrollThrough(page);

    // "Born this week" is now a COLUMN inside the merged "From the archive"
    // band, not its own h2 — the two history rails were merged so a quiet day
    // loses a column instead of two whole sections.
    const heading = page.locator('main h2', { hasText: /from the archive/i });
    test.skip((await heading.count()) === 0, 'no archive content today');

    await heading.scrollIntoViewIfNeeded();
    const column = page.getByRole('region', { name: /born this week/i });
    test.skip((await column.count()) === 0, 'no birthdays in the ±3-day window');
    // The PartyPopper celebrate affordance is present and enabled (its gating —
    // one celebration per chip — is covered in HomeBornThisWeek.test). We don't
    // click here: the strip is a live marquee/rail with lazy-loading avatars, so
    // a pixel-stable click is environment-flaky and not what this checks.
    const celebrate = page.getByRole('button', { name: /^celebrate/i }).first();
    await expect(celebrate).toBeVisible();
    await expect(celebrate).toBeEnabled();
  });
});
