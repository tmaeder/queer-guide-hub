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

    // `SafetyVerdict` — the banner at the top of the country page. Its eyebrow
    // and tier are two sibling <p>s, so match the text rather than a container:
    // an ancestor-shaped locator here either resolves to the link's immediate
    // parent or to the page root, and neither is the banner.
    await expect(page.getByText('Equality', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Very high', { exact: true }).first()).toBeVisible();

    // The deleted ring carried this label on every size it rendered at.
    await expect(page.locator('[aria-label^="Equality score"]')).toHaveCount(0);

    // Deliberately NOT asserting `/100` is absent page-wide here.
    // `CompareRightsSideBySide` — the peer table further down — legitimately
    // still prints `100/100`; its whole premise is the score, so it was left
    // in place as a product decision. Asserting its absence would encode an
    // expectation this change never made.
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

test.describe('removed: the OpenStreetMap credit in the footer', () => {
  test('the footer renders its copyright and no ODbL line', async ({ page }) => {
    await open(page, '/');
    const footer = page.locator('footer');
    await expect(footer).toBeVisible({ timeout: BOOT });
    // Positive: the credits row itself is present, so the absence below is a
    // statement about that row rather than about a footer that never rendered.
    await expect(footer.getByText(/Queer Guide/).first()).toBeVisible();
    await expect(footer.getByText(/OpenStreetMap/i)).toHaveCount(0);
    await expect(footer.getByText(/ODbL/i)).toHaveCount(0);
  });
});
