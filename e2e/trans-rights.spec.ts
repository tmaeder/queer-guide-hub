import { test, expect, type Page } from '@playwright/test';

/**
 * `/rights/trans` — the trans safety dimension.
 *
 * These assertions guard the SAFETY INVARIANTS, not the layout. The failure this
 * page exists to prevent is a reader treating TGEU's documented-violence counts
 * as a ranking of danger: those counts rank countries close to inversely to
 * legal risk (Brazil, Mexico and the United States lead; 96% of every case ever
 * recorded is in a country that does NOT criminalise same-sex acts), so anything
 * that colours them, reorders the table by them without saying so, or shows them
 * without their caveat is a real-world harm.
 *
 * WHY SO FEW TESTS FOR SO MANY ASSERTIONS. This page fetches 250 countries and
 * a 231 KB boundary set and then builds a MapLibre canvas, so a page load here
 * is expensive — and this file is on the `e2e-pr.yml` critical path, whose
 * budget note is explicit about it. Written one-assertion-per-test it made ten
 * separate loads and took 11 minutes. The invariants are grouped by the page
 * load they need, with a comment on each so a failure still says which one
 * broke.
 *
 * BASE URL: `playwright.config.ts` defaults `baseURL` to https://queer.guide, so
 * a bare `npm run test:e2e` tests PRODUCTION. These assertions describe fixed
 * behaviour and will fail against a prod that has not taken the deploy — that is
 * correct, not a broken test. CI runs this file against `http://localhost:4173`.
 */

/**
 * Per-assertion budget, deliberately BELOW the per-test timeout set on each
 * describe. Waiting longer for one assertion than the test itself is allowed to
 * live produces a bare "Test timeout of 30000ms exceeded" with no locator and
 * no expectation — the failure names nothing, and the first run of this file
 * did exactly that. The test must outlive its assertions so the report says
 * which one broke.
 */
const SETTLE = 25_000;

/**
 * Sections mount only after TanStack Query returns, so every lookup auto-waits.
 *
 * This helper used to `.catch(() => {})` its wait and hand back a locator the
 * callers gated on with `if (await section.count())`. `count()` does NOT
 * auto-wait, so a page that failed to render produced count 0 and the test
 * SKIPPED — the assertions that exist to stop a count being coloured as danger
 * had never once executed. Every section used here is UNCONDITIONAL in
 * TransRights.tsx, so "not present" can only mean broken, and this fails.
 */
async function section(page: Page, id: string) {
  const el = page.locator(`#${id}`);
  await expect(el).toBeVisible({ timeout: SETTLE });
  return el;
}

/**
 * Click something that lives under a sticky header.
 *
 * Playwright scrolls the MINIMUM distance to bring a target into the viewport,
 * which on this site parks it beneath the floating header and the sticky
 * section nav. Actionability then never resolves: the log reads "element is
 * visible, enabled and stable / scrolling into view if needed / done scrolling"
 * and the click hangs until the test times out — 120s spent on a button that
 * was never reachable at the point Playwright aimed at.
 *
 * `block: 'center'` puts it mid-viewport, clear of both bars. NOT
 * `click({ force: true })`, which would skip the hit-test entirely and hide a
 * genuine "this control is covered" regression, which is a real defect on a
 * page a reader has to operate.
 */
async function clickClear(locator: ReturnType<Page['locator']>) {
  await locator.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await locator.click();
}

test.describe('/rights/trans', () => {
  // 250 countries, a 231 KB boundary set and a MapLibre canvas per load.
  test.describe.configure({ timeout: 120_000 });

  test('axis 1 — publishes legal recognition with real numbers', async ({ page }) => {
    await page.goto('/rights/trans');
    await expect(page.getByRole('heading', { name: /trans rights and safety/i })).toBeVisible({
      timeout: SETTLE,
    });
    await section(page, 'recognition');

    await expect(page.getByText(/gender marker change is possible/i).first()).toBeVisible();

    /*
     * THE REGRESSION THIS FILE EXISTED THROUGH.
     *
     * The old assertion was `getByText(/requires surgery/i)` — which matches
     * the ledger's LABEL and passed happily while the number beside it read
     * `0 / 244` for every country on earth. ILGA writes "Required", six readers
     * tested `/^yes$/i`, and nothing here noticed for as long as the page had
     * existed.
     *
     * Read as numbers, not as a regex over the rendered string: that text
     * concatenates ("…protection.Countries15 / 250 · 6%People3.39B / 8.22B ·
     * 41%"), so a pattern anchored on whitespace before the numerator matches
     * nothing — and its NEGATIVE form would then pass on a row reading `0 /
     * 250`, which is a vacuous guard on precisely the bug this covers.
     *
     * The count is deliberately not hard-coded: 15 today, and a country
     * changing its law must not turn this red. Non-zero is the invariant.
     */
    const row = page.locator('li').filter({ hasText: 'Requires surgery' }).first();
    await expect(row).toBeVisible();
    const text = (await row.innerText()).replace(/\s+/g, ' ');
    const numerators = [...text.matchAll(/([\d.,]+)\s*[BMK]?\s*\/\s*[\d.,]+\s*[BMK]?/g)].map((m) =>
      Number(m[1].replace(/,/g, '')),
    );
    // Two units render — countries and people — so fewer means the row stopped
    // showing what this asserts about.
    expect(numerators.length).toBeGreaterThanOrEqual(2);
    for (const n of numerators) expect(n).toBeGreaterThan(0);

    // The same defect hid a whole section: `surgeryCountries` filtered on
    // `/^yes$/i`, came back empty, and the SectionDef was spread out of the
    // array entirely — the page had no "where the law demands surgery" at all.
    const surgery = await section(page, 'surgery');
    await expect(surgery).toContainText(/will not change your gender marker/i);
    expect(await surgery.locator('a[href*="/country/"]').count()).toBeGreaterThan(0);

    // The choropleth announces a tally of the features it actually paints.
    // Extracting the MapLibre plumbing out of RightsWorldMap once made this
    // read "no countries measured yet" on every render — the canvas was fine,
    // the only thing broken was what a screen reader was told about it.
    const map = page.locator('[role="img"][aria-label*="legal gender recognition"]');
    await expect(map).toBeVisible({ timeout: SETTLE });
    const label = (await map.getAttribute('aria-label')) ?? '';
    expect(label).not.toMatch(/no countries measured yet/i);
    expect(label).toMatch(/\d+\s+surgery required first/i);

    // What the legal source does not record at all.
    await expect(page.locator('#blindspots')).toContainText(
      /identity documents are treated at borders/i,
    );
  });

  test('axis 3 — the violence table is not a danger ranking', async ({ page }) => {
    await page.goto('/rights/trans');
    const documented = await section(page, 'documented');

    // The caveat must be present wherever counts are.
    await expect(documented).toContainText(/depend on local reporting/i);
    await expect(documented).toContainText(/not that a place is safe/i);

    // Absence renders as absence. Without this the table reads as a complete
    // world picture in which every other country recorded zero.
    await expect(documented).toContainText(/no case recorded/i);
    await expect(documented).toContainText(/no one was in a position to count/i);

    // `--destructive` is reserved for criminalisation and the death penalty. On
    // this section it would assert that the countries with the most documented
    // cases are the most dangerous, which inverts the truth. (The selector's
    // positive control is the separate /rights test below — "nothing matches"
    // is only evidence if the selector can match anything.)
    expect(await documented.locator('.text-destructive, [class*="destructive"]').count()).toBe(0);

    // A list of countries ordered by killings, read top-down, IS a danger
    // ranking, and this one is close to the inverse of one. The table opens
    // alphabetically; the count ordering is opt-in.
    const names = (await documented.locator('tbody tr td:first-child').allInnerTexts())
      .map((n) => n.trim())
      .filter(Boolean)
      .slice(0, 8);
    expect(names.length).toBeGreaterThan(2);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    // The country with by far the most recorded cases must not lead the table.
    expect(names[0]).not.toBe('Brazil');

    // Opting into the count ordering is allowed; hiding what it means is not.
    // The disclosure shows only while the sort is on — a permanent disclaimer
    // under an alphabetical table trains readers to skip it.
    const note = /ordering of documentation, not of danger/i;
    const sortButton = documented.getByRole('button', { name: /sort by number of cases/i });
    await expect(documented).not.toContainText(note);
    await clickClear(sortButton);
    await expect(documented).toContainText(note);
    await expect(documented.locator('th', { hasText: /recorded since 2008/i })).toHaveAttribute(
      'aria-sort',
      'descending',
    );
    // descending → ascending → back to alphabetical; the note goes with it.
    await clickClear(sortButton);
    await clickClear(sortButton);
    await expect(documented).not.toContainText(note);
  });

  /**
   * The positive control for the danger-hue assertion above.
   *
   * "Nothing matches this selector" is only evidence if the selector can match
   * anything at all. A Tailwind rename, a typo or a scoping mistake would make
   * that check pass forever while the section turned bright red. So the same
   * selector is pointed at a surface where the hue is REQUIRED: /rights marks
   * confirmed death-penalty jurisdictions with it.
   */
  test('the danger-hue selector can actually match something', async ({ page }) => {
    await page.goto('/rights');

    /*
     * `/rights` gets its own budget, and it is the ONE place in this file that
     * departs from SETTLE.
     *
     * It is the heaviest page in the app — 250 countries at 22 jsonb columns,
     * a MapLibre canvas, and the 231 KB 50m boundary set whose cost
     * WorldChoropleth documents deliberately — and this is the third page load
     * of the run. Measured: the whole file passes in ~22 s on an idle machine,
     * but under contention (load ~100) this single assertion overran 25 s while
     * passing in 17 s when run alone. That is the page's weight, not a defect,
     * and the assertion still FAILS if the selector cannot match — which is the
     * only thing it exists to prove.
     */
    const chip = page.getByRole('button', { name: /^Death penalty \d+$/ });
    await expect(chip).toBeVisible({ timeout: 60_000 });
    await clickClear(chip);

    await expect(page.locator('.text-destructive, [class*="destructive"]').first()).toBeVisible({
      timeout: SETTLE,
    });
  });
});

/**
 * The country-page half of the same vocabulary bug, and its worst symptom.
 *
 * `TransSafetyBand` rendered a bare yes/no from `/^yes$/i`, so Japan — whose law
 * demands sterilisation — published "Surgery required first: No". Not an
 * omission: an affirmative false negative, on the one fact the band exists to
 * state, to the reader least able to absorb it.
 *
 * Japan and Germany are a matched pair on purpose. Asserting only Japan would
 * pass just as well against a band that printed "Yes" for every country.
 */
test.describe('country page — the sterilisation requirement', () => {
  test.describe.configure({ timeout: 120_000 });

  /**
   * The row renders `<li><span>{label}{note}</span><span>{value}</span></li>`
   * and its text concatenates — "Surgery required firstNo" — so `/\bNo\b/`
   * finds no word boundary and fails on correct markup. Read the VALUE span.
   */
  async function surgeryRow(page: Page) {
    const row = page.locator('li').filter({ hasText: /surgery required first/i }).first();
    await expect(row).toBeVisible({ timeout: SETTLE });
    return { row, value: row.locator('span').last() };
  }

  test('says Japan requires surgery, and says why it matters', async ({ page }) => {
    await page.goto('/country/japan');
    const { row, value } = await surgeryRow(page);
    await expect(value).toHaveText('Yes');
    await expect(row).toContainText(/sterilisation requirement/i);
  });

  test('says Germany does not', async ({ page }) => {
    await page.goto('/country/germany');
    const { row, value } = await surgeryRow(page);
    await expect(value).toHaveText('No');
    // The cap applies only where the law demands it, so the note must not ride
    // along on a country that does not.
    await expect(row).not.toContainText(/sterilisation requirement/i);
  });
});

test.describe('trip safety briefing', () => {
  test('carries no documented-violence figure', async ({ page }) => {
    // The briefing is the locked traffic-light surface. It may state gender
    // recognition (a legal fact a traveller acts on) and must not state TMM
    // counts, which beside a risk tier read as a ranking of danger.
    await page.goto('/travel');
    const body = await page.locator('body').innerText();
    for (const re of [
      /trans murder monitoring/i,
      /documented anti-trans killings/i,
      /recorded since 2008/i,
    ]) {
      expect(body).not.toMatch(re);
    }
  });
});
