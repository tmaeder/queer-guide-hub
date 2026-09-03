import { test, expect } from '@playwright/test';

/**
 * End-to-end guards for the rights surface.
 *
 * These assert things unit tests structurally cannot: that a criminalising
 * country never renders a reassuring verdict AT ANY POINT during load, that
 * the coverage note reports a real fraction rather than a tautology, and that
 * every country is reachable rather than the first twelve per tier.
 *
 * Each one corresponds to a defect that shipped to production:
 *   - "<n> of 250"      the note rendered {n} of {n} and could never fail.
 *                       Asserted as a PROPERTY (n < 250, n >= a floor), not as
 *                       a literal: it was pinned at 239 and went red when ILGA
 *                       coverage reached 245, i.e. because the data improved.
 *   - Germany reachable  the world list was .slice(0, 12) with no expander;
 *                       now a table whose search + Show-all must reach everything
 *   - 7 vs 5 death      "No legal certainty" was read as "No" on 5 countries
 *   - never "Welcoming" the empty report is indistinguishable from measured-safe
 *
 * playwright's baseURL defaults to https://queer.guide, so a local run without
 * E2E_BASE_URL tests the DEPLOYED site, not your working tree.
 */
const dismiss = async (page) => {
  const btn = page.getByRole('button', { name: /accept|decline|reject|only essential/i }).first();
  if (await btn.isVisible().catch(() => false)) await btn.click().catch(() => {});
};

/**
 * Every "<n> of 250" / "<n> / 250" the surface states, as numbers.
 *
 * NOT a hardcoded count, deliberately. The defect these two tests exist to
 * catch is named in the header above — the note rendered {n} of {n}, a
 * tautology that could never fail — so the property is numerator < denominator,
 * not equality with whatever ILGA coverage happened to be the day the test was
 * written. Pinned at 239, they went red on 2026-09-02 because coverage had
 * REACHED 245: a green test turning red because the data got better, which
 * teaches the next reader to edit the number and move on rather than ask what
 * the assertion is for.
 *
 * The floor is what keeps it a real assertion once the literal is gone — it
 * fails on a collapse to "3 of 250" just as loudly as on the tautology.
 */
const COVERAGE_FLOOR = 200;

function coverageFractions(text: string): number[] {
  return [...text.matchAll(/(\d{1,3})\s*(?:of|\/)\s*250/g)].map((m) => Number(m[1]));
}

// The 30s wait below is the whole default test budget, so reading the text
// afterwards has nothing left and times out on `locator('main')` rather than on
// anything to do with coverage. /rights mounts its cards only after the
// all-countries fetch, so the wait genuinely needs that long — the budget is
// what has to move.
test('/rights states real coverage, not a tautology', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/rights');
  await dismiss(page);
  const main = page.locator('main');
  await expect(main).toContainText(/\d{1,3} of 250/, { timeout: 30_000 });

  const stated = coverageFractions(await main.innerText());
  expect(stated.length, 'the coverage note must state a fraction').toBeGreaterThan(0);
  for (const n of stated) {
    expect(n, `"${n} of 250" is a tautology, not coverage`).toBeLessThan(250);
    expect(n, `coverage collapsed to ${n}/250`).toBeGreaterThanOrEqual(COVERAGE_FLOOR);
  }
});

test('/rights reaches every country, not the first thirty', async ({ page }) => {
  await page.goto('/rights');
  await dismiss(page);
  const world = page.locator('#world');
  await expect(world.getByRole('searchbox')).toBeVisible({ timeout: 30_000 });
  await world.getByRole('searchbox').fill('germany');
  await expect(world.getByRole('link', { name: 'Germany', exact: true })).toBeVisible();
  await world.getByRole('searchbox').fill('thailand');
  await expect(world.getByRole('link', { name: 'Thailand', exact: true })).toBeVisible();
  // And the unfiltered set is fully expandable — no reachable-only-by-search rows.
  await world.getByRole('searchbox').fill('');
  await world.getByRole('button', { name: /show all \d+ countries/i }).click();
  await expect(world.getByRole('link', { name: 'Zimbabwe', exact: true })).toBeVisible();
});

/**
 * WCAG 2.2 target size (2.5.8) on the country table, measured on a phone.
 *
 * The country name was a bare inline anchor in a cell whose padding belonged to
 * the `<td>`: 18px tall inside a row 48-88px tall, so a thumb aimed at the row
 * mostly landed on nothing. Asserted as a measured BOX, not as a class name —
 * the padding lives on an inline style in `ui/table.tsx` that a utility class
 * silently loses to, which is exactly the mistake this guards against.
 */
test('country rows are tappable on a phone, not 18px of text', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/rights');
  await dismiss(page);
  const world = page.locator('#world');
  await expect(world.getByRole('searchbox')).toBeVisible({ timeout: 30_000 });

  const link = world.getByRole('link', { name: 'Afghanistan', exact: true });
  await expect(link).toBeVisible();
  const box = await link.boundingBox();
  expect(box, 'country link has no box').not.toBeNull();
  expect(box!.height, `country link is ${box!.height}px tall`).toBeGreaterThanOrEqual(24);

  const sort = world.getByRole('button', { name: /sort by score/i });
  const sortBox = await sort.boundingBox();
  expect(sortBox!.height, `score sort is ${sortBox!.height}px tall`).toBeGreaterThanOrEqual(24);
});

test('/rights separates confirmed from uncertain death penalty', async ({ page }) => {
  await page.goto('/rights');
  await dismiss(page);
  const main = page.locator('main');
  await expect(main).toContainText(/In 7 the penalty is death/, { timeout: 30_000 });
  await expect(main).toContainText(/In 5 more our source names the death penalty as possible/);
});

test('an unscored country is never filed as Protected or Mixed', async ({ page }) => {
  await page.goto('/rights');
  await dismiss(page);
  const world = page.locator('#world');
  await expect(world.getByRole('searchbox')).toBeVisible({ timeout: 30_000 });
  // North Korea scores 60 purely because the formula opens at 50; it must not
  // read as Protected on an LGBTQ+ safety page.
  await world.getByRole('button', { name: /^Protected \d+$/ }).click();
  await world.getByRole('searchbox').fill('north korea');
  await expect(world.getByRole('table')).not.toContainText('North Korea');
  // Unscored rows exist and are labelled honestly.
  await world.getByRole('button', { name: /^Not scored \d+$/ }).click();
  await world.getByRole('searchbox').fill('');
  await expect(world.getByRole('table')).toContainText('Not scored');
});

test('Afghanistan warns about the death penalty rather than calling it criminalised only', async ({ page }) => {
  await page.goto('/country/afghanistan');
  await dismiss(page);
  await expect(page.locator('main')).toContainText(
    /Travel Warning: Same-sex activity may carry the death penalty/, { timeout: 30_000 });
  await expect(page.locator('main')).toContainText(/no legal certainty/);
});

test('INVARIANT: a criminalising country never renders as Welcoming', async ({ page }) => {
  test.setTimeout(120_000);
  // Sampled from first paint, so a reassuring LOADING state fails too — that
  // was the live defect: the tile read "Welcoming" for ~30s under a
  // death-penalty banner.
  const seen: string[] = [];
  await page.goto('/country/afghanistan', { waitUntil: 'commit' });
  for (let i = 0; i < 240; i++) {
    const txt = await page.locator('main').innerText().catch(() => '');
    const m = txt.match(/FOR LGBTQ\+ TRAVELERS\s*\n\s*([^\n]+)/i);
    if (m && seen[seen.length - 1] !== m[1]) seen.push(m[1]);
    if (seen.includes('Dangerous')) break;
    await page.waitForTimeout(250);
  }
  expect(seen.length, `verdict never rendered; saw ${JSON.stringify(seen)}`).toBeGreaterThan(0);
  expect(seen, `verdict sequence was ${JSON.stringify(seen)}`).not.toContain('Welcoming');
  expect(seen).toContain('Dangerous');
});

test('crisis-adjacent surfaces stay animation-free', async ({ page }) => {
  await page.goto('/rights');
  await expect(page.locator('main h1')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('div.fixed.top-0.left-0.right-0')).toHaveCount(0);
});

/**
 * The rights-card value classifier (src/lib/rights/rightsValue.ts).
 *
 * Until 2026-08-08 it tested `v.includes('legal')` in its POSITIVE branch, so
 * every phrase naming a legal BARRIER scored as a protection — a ✓ beside
 * "Explicit Legal Barriers" on 60 countries and "Legal Barriers Likely to
 * Exist" on 63 more. Two more groups sat on the wrong side in the other
 * direction. Asserting the rendered GLYPH, because the chip text was right the
 * whole time; only the polarity was wrong, and that is what a reader scans.
 */
async function glyphFor(page, label: string): Promise<string> {
  const row = page
    .locator('div')
    .filter({ has: page.locator(`:scope > p:text-is("${label}")`) })
    .first();
  // Wait for the GLYPH, not just the row.
  //
  // This waited on the row being `attached` and then read `svg.nth(1)`
  // immediately. The row attaches before its status icon paints, so the read
  // could return null, the class match yield '', and the assertion fail
  // against a page that was perfectly correct a frame later — a different test
  // flaking on each run. Playwright retries `expect(locator)` but not a bare
  // getAttribute, so the wait has to be explicit.
  const glyph = row.locator('svg').nth(1);
  await expect(glyph).toBeAttached({ timeout: 30_000 });
  await expect(glyph).toHaveAttribute('class', /lucide-/, { timeout: 30_000 });
  const cls = (await glyph.getAttribute('class')) ?? '';
  return (cls.match(/lucide-[a-z-]+/) ?? [''])[0];
}

test('a legal barrier renders as negative, not as a protection', async ({ page }) => {
  await page.goto('/country/afghanistan');
  await dismiss(page);
  // Afghanistan: expression "Non-Explicit Legal Barriers",
  //              association "Legal Barriers Likely to Exist".
  expect(await glyphFor(page, 'Freedom of expression')).toBe('lucide-x');
  expect(await glyphFor(page, 'Freedom of association')).toBe('lucide-x');
});

test('the best available outcome renders as positive, not partial', async ({ page }) => {
  await page.goto('/country/germany');
  await dismiss(page);
  // Germany: adoption "Joint & Second Parent Adoption" — the best case, which
  // fell through to the partial default before the vocabulary existed.
  expect(await glyphFor(page, 'Adoption rights')).toBe('lucide-check');
  // Control: a genuine "No known legal barriers" must still read positive.
  expect(await glyphFor(page, 'Freedom of expression')).toBe('lucide-check');
});

test('/rights/sources exists, states its coverage and refuses to oversell the score', async ({
  page,
}) => {
  // Same budget reasoning as the coverage test above: a 30s wait plus the
  // reads that follow does not fit the default 30s test timeout.
  test.setTimeout(60_000);
  await page.goto('/rights/sources');
  await dismiss(page);
  const main = page.locator('main');
  await expect(main).toContainText(/Where this data comes from/, { timeout: 30_000 });
  await expect(main).toContainText(/ILGA World Database/);
  // Same rule as the coverage test above, and this page states TWO fractions
  // (scored vs. criminalisation-recorded), so every one of them is checked
  // rather than just the first.
  await expect(main).toContainText(/\d{1,3} \/ 250/);
  const stated = coverageFractions(await main.innerText());
  expect(stated.length, 'the sources page must state its coverage').toBeGreaterThan(0);
  for (const n of stated) {
    expect(n, `"${n} / 250" overstates coverage as total`).toBeLessThan(250);
    expect(n, `coverage collapsed to ${n}/250`).toBeGreaterThanOrEqual(COVERAGE_FLOOR);
  }
  // The three honesty claims. If any is edited away, the page stops earning
  // the citation that /rights points at.
  await expect(main).toContainText(/lands mid-scale rather than reading as unknown/);
  await expect(main).toContainText(/not a safety rating/);
  await expect(main).toContainText(/rights vary by state or province/);
});

test('/rights cites its source rather than asserting a bare number', async ({ page }) => {
  await page.goto('/rights');
  await dismiss(page);
  await expect(page.locator('main')).toContainText(/Where this comes from/, { timeout: 30_000 });
  await expect(page.locator('main a[href$="/rights/sources"]').first()).toBeVisible();
});

/**
 * The per-lens split (#2647).
 *
 * A single number said the United States was 86/100, which concealed that the
 * trans picture there is materially worse than the LGB one — 82 countries have
 * LGB and trans verdicts that disagree. These assert the split renders and
 * that it still names what the dataset does not cover.
 */
test('a country page says who the law protects, per identity', async ({ page }) => {
  await page.goto('/country/united-states');
  await dismiss(page);
  const main = page.locator('main');
  await expect(main).toContainText(/Who the law protects/i, { timeout: 30_000 });
  for (const lens of ['Lesbian, gay, bisexual', 'Trans', 'Intersex']) {
    await expect(main).toContainText(lens);
  }
  // The split must be a split: LGB and trans must not read identically here.
  const block = await main.innerText();
  const i = block.search(/Who the law protects/i);
  const rows = block.slice(i, i + 260);
  expect(rows).toMatch(/Some protections|Broad protections/);
  expect(rows).toMatch(/Few or no protections/);
});

test('the verdict names what our source does not record', async ({ page }) => {
  await page.goto('/country/united-states');
  await dismiss(page);
  // Without this, a green trans verdict reads as a promise about a passport
  // check ILGA never made.
  await expect(page.locator('main')).toContainText(
    /identity documents are treated at borders/i,
    { timeout: 30_000 },
  );
});

/**
 * The world-map section (Task D of docs/plans/2026-08-22-rights-world-map-design.md).
 *
 * WebGL may be unavailable in CI's headless chromium — `RightsWorldMap`
 * falls back to a labelled panel carrying the SAME `role="img"` +
 * `aria-label` the live map uses (see `buildMapAriaLabel`), so these assert
 * the label rather than canvas pixels.
 */
test('the map renders and is labelled', async ({ page }) => {
  await page.goto('/rights');
  await dismiss(page);
  const mapSection = page.locator('#map');
  const map = mapSection.getByRole('img', { name: /World map/i });
  await expect(map).toBeVisible({ timeout: 30_000 });
  // POLL the label, don't read it once. The container renders immediately and
  // is visible long before the 250-country query resolves, and until it does
  // the map says exactly that — "no countries measured yet" — rather than
  // inventing counts it does not have (`buildMapAriaLabel`). So a single read
  // after `toBeVisible` races the fetch: on a cold prod load it caught the
  // empty state at 4.3s three times running, while the same page read at 12s
  // had the full counts. The empty label is correct behaviour and must stay,
  // so the test waits for the populated one instead of asserting the race away.
  await expect
    .poll(async () => (await map.getAttribute('aria-label')) ?? '', { timeout: 30_000 })
    .toMatch(/\d/);
});

test('the trans lens changes the reading', async ({ page }) => {
  await page.goto('/rights');
  await dismiss(page);
  const mapSection = page.locator('#map');
  await expect(mapSection.getByRole('img', { name: /World map/i })).toBeVisible({
    timeout: 30_000,
  });

  // Employment is a protection-matrix topic, so the lens is enabled there
  // (unlike criminalisation, the default station).
  await mapSection.getByRole('button', { name: 'Employment' }).click();

  const legend = mapSection.getByRole('list', { name: /country counts by status/i });
  await expect(legend).toBeVisible();
  const everyoneText = await legend.innerText();

  await mapSection.getByRole('button', { name: 'Gender identity' }).click();
  await expect(legend).toBeVisible();
  const giText = await legend.innerText();

  // Documented invariant (rightsClassify.ts): a country protecting only
  // sexual orientation reads `yes` under `so` and `no` under `gi` — it can
  // never be "protective" by borrowing another group's protection. So the
  // legend must not be pixel-identical between the two lenses; assert the
  // real relationship (a re-render with a different total for at least one
  // class) rather than a specific number, which could coincidentally match
  // in live data and make the test vacuous.
  expect(giText, 'legend text was identical under Everyone vs Gender identity').not.toBe(
    everyoneText,
  );
});

test('no-data is never presented as protected', async ({ page }) => {
  await page.goto('/rights');
  await dismiss(page);
  const mapSection = page.locator('#map');
  await expect(mapSection.getByRole('img', { name: /World map/i })).toBeVisible({
    timeout: 30_000,
  });

  // Default station is Same-sex activity (criminalisation) — 11 territories
  // carry no recorded reading there (see the withLegalStatus comment above).
  // Matched by visible text rather than accessible name — the button's
  // count and label are separate spans and accname join spacing is not
  // worth depending on here.
  const legend = mapSection.getByRole('list', { name: /country counts by status/i });
  const noDataStation = legend.locator('button', { hasText: /No data/i });
  await expect(noDataStation).toBeVisible();
  const noDataText = await noDataStation.innerText();
  expect(noDataText).not.toMatch(/protected/i);
  const count = parseInt(noDataText.match(/\d+/)?.[0] ?? '0', 10);
  expect(count, `no-data station text was ${JSON.stringify(noDataText)}`).toBeGreaterThan(0);
});

test('/rights#marriage still lands on the ledger row with the map section above it', async ({
  page,
}) => {
  await page.goto('/rights#marriage');
  await dismiss(page);
  const target = page.locator('#marriage');
  await expect(target).toBeVisible({ timeout: 30_000 });
  await expect(async () => {
    const box = await target.boundingBox();
    expect(box, 'target has no box').not.toBeNull();
    // scrollIntoView({block:'start'}) lands the element at (or very near) the
    // top of the viewport, not merely "somewhere on screen".
    expect(box!.y, `#marriage sat at y=${box!.y}`).toBeLessThan(200);
  }).toPass({ timeout: 15_000 });

  // ...AND STAYS THERE. The map's chip rail centres its active chip on mount,
  // and the rail sits ~3,900px above this row: an implementation that reveals
  // the chip by scrolling the page (scrollIntoView does, even with
  // `block: 'nearest'`) yanks the reader off the row they deep-linked to. That
  // shipped once and failed exactly one prod run out of four, because whether
  // it broke came down to which effect wrote last. Re-reading after the rail
  // has certainly mounted is what makes the race visible instead of flaky.
  await page.waitForTimeout(3_000);
  const settled = await target.boundingBox();
  expect(settled!.y, `#marriage drifted to y=${settled!.y} after settling`).toBeLessThan(200);
});

test('a criminalising country reads criminalised on every lens', async ({ page }) => {
  await page.goto('/country/afghanistan');
  await dismiss(page);
  const main = page.locator('main');
  await expect(main).toContainText(/Who the law protects/i, { timeout: 30_000 });
  const block = await main.innerText();
  const i = block.search(/Who the law protects/i);
  const rows = block.slice(i, i + 260);
  // INV-1: no accumulation of protections can lift a criminalising country,
  // and that must survive all the way to the rendered page.
  expect(rows).not.toMatch(/Broad protections|Some protections/);
  expect((rows.match(/Criminalised/g) || []).length).toBeGreaterThanOrEqual(3);
});
