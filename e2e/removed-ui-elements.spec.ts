import { test, expect, type Page } from '@playwright/test';

/**
 * Five reader-facing elements were removed on 2026-08-30. This suite is the
 * guard that they stay removed, asserted against the DEPLOYED site (the config's
 * `baseURL` is https://queer.guide).
 *
 * Every case pairs a NEGATIVE with a POSITIVE fingerprint, because on this SPA
 * "the text is absent" is also true of a page that 404'd, that is still booting,
 * or that rendered an error boundary — and a suite of bare negatives would go on
 * passing after the whole site broke. The positive half is what makes the
 * negative half mean anything.
 *
 * Two of the removals additionally get a CONTROL on a sibling surface that must
 * still show the thing, so a change that deletes the mechanism outright — rather
 * than the one value asked for — fails here instead of passing quietly.
 */

/** The SPA boots slowly on a cold edge cache; every wait is sized for that. */
const BOOT = 30_000;

async function open(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
}

test.describe('removed: the CONCEPT chip on a glossary entry', () => {
  // `entity_kind` defaults to `concept` on 7,665 of 9,611 tags, so the chip
  // said nothing on four rows in five. Only that ONE label was dropped.
  test('a concept tag renders no kind chip', async ({ page }) => {
    await open(page, '/tags/lesbian');
    await expect(page.getByRole('heading', { level: 1, name: 'Lesbian' })).toBeVisible({
      timeout: BOOT,
    });
    await expect(page.getByText('Concept', { exact: true })).toHaveCount(0);
  });

  // CONTROL. Without this, deleting the whole chip mechanism would pass the
  // test above — which is the opposite of what was asked for.
  test('a place tag still renders its kind chip', async ({ page }) => {
    await open(page, '/tags/berlin');
    await expect(page.getByRole('heading', { level: 1, name: 'Berlin' })).toBeVisible({
      timeout: BOOT,
    });
    await expect(page.getByText('Place', { exact: true }).first()).toBeVisible();
  });
});

test.describe('removed: the equality score on the Pride scroller', () => {
  test('/travel lists Pride events with no score', async ({ page }) => {
    await open(page, '/travel');
    const scroller = page.getByRole('group', { name: 'Pride this season' });
    await expect(scroller).toBeVisible({ timeout: BOOT });
    // Positive: the scroller is populated, not an empty state that would make
    // the absence below vacuous.
    await expect(scroller.getByRole('link').first()).toBeVisible();
    await expect(scroller.getByText(/equality score/i)).toHaveCount(0);
  });
});

test.describe('removed: the Venue Activity card', () => {
  test('a venue single has no check-in activity panel', async ({ page }) => {
    await open(page, '/venues/checkpoint-zuerich');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: BOOT });
    await expect(page.getByText(/venue activity/i)).toHaveCount(0);
    await expect(page.getByText(/no recent activity/i)).toHaveCount(0);
  });
});

test.describe('removed: the 0-100 equality number on the geo singles', () => {
  // The VERDICT stays everywhere the number was — only the composite figure,
  // which read as a precise measurement of a country's safety when it is a
  // roll-up of legal flags, is gone. So each case asserts the verdict is still
  // there AND the number is not.
  for (const path of ['/city/berlin', '/villages/chueca']) {
    test(`${path} states the tier, not the number`, async ({ page }) => {
      await open(page, path);
      const verdict = page.getByTestId('geo-safety-verdict');
      await expect(verdict).toBeVisible({ timeout: BOOT });
      await expect(verdict).toContainText(/equality|criminal|death penalty|check local laws/i);
      await expect(verdict).not.toContainText('/100');
    });
  }

  test('/country/germany states the tier, not the number', async ({ page }) => {
    await open(page, '/country/germany');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: BOOT });

    // `SafetyVerdict` — the banner at the top of the country page.
    //
    // Wait on the BANNER, not on page-wide text. This used to match
    // `getByText('Equality')` across the whole page, because the eyebrow and
    // tier are sibling <p>s with no reachable ancestor. That RACED, and the
    // <h1> asserted above is why: it renders from the page shell while the
    // country row is still in flight, so the heading going visible says
    // nothing about whether this banner has mounted — and the text match then
    // had only the default 5s to catch up. Measured 1 failure in 6 on prod.
    //
    // Fixed at the component: SafetyVerdict now carries a testid, mirroring
    // `geo-safety-verdict` on GeoSafetyBlock, which is what the two cases
    // above already wait on. Assert INSIDE it, so "Equality" cannot be
    // satisfied by some other occurrence elsewhere on the page.
    const verdict = page.getByTestId('country-safety-verdict');
    await expect(verdict).toBeVisible({ timeout: BOOT });
    await expect(verdict.getByText('Equality', { exact: true })).toBeVisible();
    await expect(verdict.getByText('Very high', { exact: true })).toBeVisible();

    // The deleted ring carried this label on every size it rendered at.
    await expect(page.locator('[aria-label^="Equality score"]')).toHaveCount(0);

    // Page-wide, and only since `CompareRightsSideBySide` was removed. That
    // peer table printed `100/100` for each neighbour, so this assertion could
    // not be made when the first version of this suite shipped. Its only column
    // besides the country name WAS the score, and dropping just the number
    // would have left four country names ordered by a quantity the page no
    // longer shows — a ranking with no stated basis — so the section went.
    await expect(page.getByText('/100')).toHaveCount(0);
  });

  test('an event single carries no equality ring', async ({ page }) => {
    await open(page, '/events');
    const firstEvent = page.locator('a[href*="/events/"]').first();
    // Fail rather than skip on an empty listing: a skip here would report green
    // while measuring nothing.
    await expect(firstEvent).toBeVisible({ timeout: BOOT });
    await firstEvent.click();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: BOOT });
    await expect(page.locator('[aria-label^="Equality score"]')).toHaveCount(0);
  });
});

/**
 * THIS ASSERTION HAS BEEN INVERTED TWICE. Read this before "restoring" it.
 *
 * The OSM credit started in the footer, moved to the /about colophon on
 * 2026-08-30, and came BACK to the footer when that colophon was gated behind
 * a login — because a signed-out reader is still served the OSM-derived city
 * diagrams on the homepage. On 2026-09-04 it was removed from the footer
 * again, by an explicit product decision taken after being told that the
 * colophon is members-only and that this leaves a signed-out reader with no
 * credit anywhere on the site.
 *
 * So the current state is deliberate, not drift, and it is NOT licence
 * compliance: the tests below pin the removal so that re-adding the row is a
 * conscious edit. If someone later restores the credits, invert these back.
 *
 * These run SIGNED OUT (no storageState), which is the state that matters.
 */
test.describe('the footer carries no data attribution', () => {
  test('the footer has the copyright but no ODbL credit', async ({ page }) => {
    await open(page, '/');
    const footer = page.locator('footer');
    await expect(footer).toBeVisible({ timeout: BOOT });
    // Positive control: "no ODbL in the footer" also passes on a footer that
    // failed to render at all.
    await expect(footer.getByText(/Queer Guide/).first()).toBeVisible();
    await expect(footer.getByRole('link', { name: 'OpenStreetMap' })).toHaveCount(0);
    await expect(footer.getByRole('link', { name: 'GeoNames' })).toHaveCount(0);
    await expect(footer).not.toContainText('ODbL');
    await expect(footer).not.toContainText('CC BY');
  });

  // The gate. `#sources` absent proves nothing unless the page rendered, so
  // the heading is the positive control.
  test('/about hides the colophon from signed-out readers', async ({ page }) => {
    await open(page, '/about');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: BOOT });
    await expect(page.locator('#sources')).toHaveCount(0);
  });
});
