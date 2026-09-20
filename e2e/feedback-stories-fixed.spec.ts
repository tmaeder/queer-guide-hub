import { test, expect, type Page } from '@playwright/test';

/**
 * Proves, against PRODUCTION, the four reader-visible fixes from the
 * /admin/feedback triage (PR #3827). Each assertion is one a reporter actually
 * made, and each would have FAILED before that change.
 *
 * RUNS AGAINST PRODUCTION (baseURL defaults to https://queer.guide).
 *
 * Slugs are derived from the listing pages, never pinned: a spec that names
 * `alphabet-city-beer-co` goes red the day that venue is merged or archived,
 * and the defects were structural (a component rendering a fact twice), so any
 * row of that type exercises them.
 */

const RENDER = { timeout: 30_000 };

/** First detail URL advertised by a listing page. */
async function firstDetailHref(page: Page, listing: string, prefix: string): Promise<string> {
  await page.goto(listing, { waitUntil: 'networkidle' });
  const link = page.locator(`a[href*="${prefix}"]`).first();
  await expect(link, `${listing} lists at least one ${prefix} entry`).toBeVisible(RENDER);
  const href = await link.getAttribute('href');
  expect(href, `${prefix} href`).toBeTruthy();
  return href!;
}

/**
 * Open a detail page and wait for it to actually render.
 *
 * `networkidle` rather than the default `load`: these are SPA routes whose content
 * arrives after a lazy chunk plus a data round trip, and a bare `load` raced it —
 * this spec failed once on `h1 not found` against a venue that renders an h1
 * perfectly well when probed directly. A prod e2e that flakes is worse than no
 * prod e2e, because it teaches everyone to re-run the nightly instead of reading it.
 */
async function openDetail(page: Page, href: string): Promise<void> {
  await page.goto(href, { waitUntil: 'networkidle' });
  await expect(page.locator('h1').first()).toBeVisible(RENDER);
}

/** The uppercase eyebrow labels of a detail page's FactGrid (`<dl><dt>`). */
async function factLabels(page: Page): Promise<string[]> {
  const labels = await page.locator('dl dt').allTextContents();
  return labels.map((l) => l.trim().toUpperCase()).filter(Boolean);
}

test.describe('@smoke feedback stories — reader-visible fixes', () => {
  test('a venue states its address, phone and website ONCE, not in the fact strip too', async ({
    page,
  }) => {
    await openDetail(page, await firstDetailHref(page, '/venues', '/venues/'));

    const labels = await factLabels(page);
    // The strip must still exist and still identify the place — otherwise this
    // test passes on a page that failed to render anything at all.
    expect(labels.length, 'the venue fact strip renders').toBeGreaterThan(0);
    expect(
      labels.some((l) => l === 'CITY' || l === 'COUNTRY' || l === 'CATEGORY'),
      `fact strip still carries identity facts, got: ${labels.join(', ')}`,
    ).toBe(true);

    // The three that were duplicated. They belong to the contact block below,
    // which owns them; repeating them here is what a reader reported three
    // separate ways ("further down the page the address, phone and homepage are
    // shown again" / "the homepage link is shown twice").
    for (const dup of ['ADDRESS', 'PHONE', 'WEBSITE']) {
      expect(labels, `"${dup}" must not be a fact-strip label any more`).not.toContain(dup);
    }
  });

  test('a venue never labels a phone number as its price', async ({ page }) => {
    // FactGrid drops empty facts, so on a venue with no price_range the Phone
    // cell slid up into the Price slot — reported as "where other locations
    // have a Price field, this one shows the phone number". With Phone gone
    // from the strip the collapse cannot mislabel anything.
    await openDetail(page, await firstDetailHref(page, '/venues', '/venues/'));

    const cells = page.locator('dl > div');
    const n = await cells.count();
    for (let i = 0; i < n; i++) {
      const label = ((await cells.nth(i).locator('dt').textContent()) ?? '').trim().toUpperCase();
      if (label !== 'PRICE') continue;
      const value = ((await cells.nth(i).locator('dd').textContent()) ?? '').trim();
      // A price is currency/symbols, never a dialable run of digits.
      expect(
        value.replace(/\D/g, '').length,
        `PRICE cell looks like a phone number: "${value}"`,
      ).toBeLessThan(7);
    }
  });

  test('the cities directory answers an anonymous search for Berlin', async ({ page }) => {
    // cities_directory() called location_is_high_risk() once per city (47,458
    // buffers) against anon's 3s statement_timeout, so a cold load 500'd and the
    // page rendered its "No cities found" empty state — which is what "I typed
    // Berlin and pressed Enter, nothing happened" actually was.
    const failures: string[] = [];
    page.on('response', (r) => {
      if (r.url().includes('/rpc/cities_directory') && r.status() >= 400) {
        failures.push(`${r.status()} ${r.url()}`);
      }
    });

    await page.goto('/cities?q=berlin');
    const berlin = page.locator('a[href*="/city/berlin"]').first();
    await expect(berlin, 'Berlin is reachable from /cities?q=berlin').toBeVisible(RENDER);

    expect(failures, `cities_directory must not error: ${failures.join('; ')}`).toEqual([]);
    // The empty state is the shape the timeout produced; assert it is absent
    // rather than only asserting Berlin is present.
    await expect(page.getByText(/no cities found/i)).toHaveCount(0);
  });

  test('a hotel does not publish deprecated import slugs or a doubled LGBTQ label', async ({
    page,
  }) => {
    await page.goto(await firstDetailHref(page, '/hotels', '/hotels/'), {
      waitUntil: 'networkidle',
    });
    // Wait on <main>, not on an h1 — hotel detail pages open at h2 (measured on
    // prod: h1 count 0). Asserting a heading level here would be testing the
    // page's outline, not this fix, and would fail for an unrelated reason.
    const main = page.locator('main').first();
    await expect(main).toBeVisible(RENDER);
    await expect
      .poll(async () => ((await main.textContent()) ?? '').length, RENDER)
      .toBeGreaterThan(200);

    const body = ((await main.textContent()) ?? '').toLowerCase();

    // `power-host` is a misterb&b host-status slug, deprecated in the glossary,
    // that reached the page as a raw uppercase badge — "what is a Power-Host?".
    // Its four deprecated siblings came off the same import.
    for (const slug of ['power-host', 'misterbandb', 'local-tips', 'lgbtq-venues-nearby']) {
      expect(body, `deprecated slug "${slug}" must not be published`).not.toContain(slug);
    }

    // `hotels.lgbtq_friendly` is true on 325 of 325 rows, so the hero badge
    // carried no information and merely repeated the `lgbtq-friendly` tag.
    //
    // The `\+?` is load-bearing and was missing at first: the hero badge reads
    // "LGBTQ+ Friendly" while the glossary tag reads "LGBTQ-Friendly", so a
    // pattern without it counted 1 on every pre-fix page and the assertion was
    // vacuous — it would have gone green against the very duplication it exists
    // to catch. Measured on five prod hotels before and after widening it.
    const lgbtqMentions = (body.match(/lgbtq\+?[\s-]*friendly/g) ?? []).length;
    expect(lgbtqMentions, 'LGBTQ-friendly is stated at most once').toBeLessThanOrEqual(1);
  });
});
