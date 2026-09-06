import { test, expect, type Page } from '@playwright/test';

/**
 * /competitions — the Drag Race + pageant spine.
 *
 * THESE RUN AGAINST PRODUCTION by default (playwright.config.ts sets
 * `baseURL` to https://queer.guide unless E2E_BASE_URL overrides it).
 *
 * The page renders client-side from `competition_overview` / `competition_roster`
 * / `competition_grid`, so a plain GET cannot see any of it — every assertion
 * below waits for the React render.
 *
 * THE FLOORS ARE DELIBERATELY BELOW THE MEASURED NUMBERS. At the time of
 * writing prod holds 33 competitions, 348 editions and 1,814 entries. The floors
 * exist to catch a re-scrape or a migration that *destroys* rows, not to pin an
 * exact count that a new season would break. Where a fact cannot grow — the US
 * main series had exactly two Miss Congeniality winners in season 16 — it is
 * asserted exactly.
 */

const RENDER = { timeout: 25_000 };

/**
 * THE DATA-DEPENDENT TESTS ARM THEMSELVES, AND THAT IS DELIBERATE.
 *
 * `e2e-pr.yml` builds THIS branch but points it at the LIVE Supabase project —
 * the client hardcodes the prod URL even under `vite preview`. So on the PR that
 * introduces the migrations, `competition_overview` does not exist yet and every
 * corpus assertion would fail: the spec would block the merge it depends on, a
 * deadlock rather than a guard (the `Critical paths` incident, CLAUDE.md).
 *
 * So a missing corpus SKIPS with an explicit message naming the migration, and a
 * present corpus is asserted in full. The route, the crawler body and the
 * client-side shell are asserted UNCONDITIONALLY, so this file always tests
 * something real even before the data lands.
 *
 * The skip is only honest if someone proves it flips. It was verified against
 * production immediately after the first deploy: all tests ran, none skipped.
 * If you find this file skipping on prod, that is a REGRESSION, not a pending
 * migration — the RPC has stopped answering.
 */
async function corpusIsLive(page: Page): Promise<boolean> {
  // Wait for a DEFINITE answer — either the totals line (corpus present) or the
  // error state (RPC absent) — rather than for one of them with a short
  // timeout. React Query retries with backoff, so `isError` can take well over
  // ten seconds to settle; a naive "did the error appear in 6s" probe returns
  // "live" while the query is still retrying and every later assertion then
  // fails against an empty page instead of skipping.
  const totals = page.locator('main').getByText(/competitions ·.*editions ·.*entries/);
  const failed = page.locator('main').getByText(/could not be loaded/i);
  await expect(totals.or(failed).first()).toBeVisible({ timeout: 45_000 });
  return totals.isVisible();
}

async function gotoView(page: Page, view: string) {
  await page.goto(`/competitions?view=${view}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible(RENDER);
}

async function requireCorpus(page: Page) {
  test.skip(
    !(await corpusIsLive(page)),
    'competition corpus not deployed yet (migration 20360101100100 pending) — see the header of this file',
  );
}

/** The totals line the page prints about itself, parsed rather than assumed. */
async function readTotals(page: Page) {
  const text = await page
    .locator('main')
    .getByText(/competitions ·.*editions ·.*entries/)
    .first()
    .innerText(RENDER);
  const nums = [...text.matchAll(/([\d,]+)/g)].map((m) => Number(m[1].replace(/,/g, '')));
  return { competitions: nums[0], editions: nums[1], entries: nums[2], linked: nums[3] };
}

test.describe('@smoke competitions', () => {
  test('serves a real corpus, not an empty shell', async ({ page }) => {
    await gotoView(page, 'seasons');
    await requireCorpus(page);

    const totals = await readTotals(page);
    expect(totals.competitions, 'competitions').toBeGreaterThanOrEqual(25);
    expect(totals.editions, 'editions').toBeGreaterThanOrEqual(300);
    expect(totals.entries, 'entries').toBeGreaterThanOrEqual(1500);

    // The whole point of the feature is the join to the encyclopedia. If this
    // collapses, the seed's personality-link UPDATE silently stopped matching.
    expect(totals.linked, 'entries linked to a personality').toBeGreaterThanOrEqual(500);
    expect(totals.linked).toBeLessThanOrEqual(totals.entries);

    // A real table, not a div grid — screen readers depend on it.
    await expect(page.locator('main table').first()).toBeVisible(RENDER);
    const rows = await page.locator('main tbody tr').count();
    expect(rows, 'season table rows').toBeGreaterThan(10);
  });

  test('carries both domains, and the pageants are not an afterthought', async ({ page }) => {
    await gotoView(page, 'seasons');
    await requireCorpus(page);
    const body = await page.locator('main').innerText(RENDER);

    // One franchise and one pageant that cannot disappear.
    expect(body).toContain("RuPaul's Drag Race");
    expect(body).toMatch(/International Mr\.? Leather|Miss Continental|Miss Gay America/);
  });

  test('renders every runner-up, not just the first', async ({ page }) => {
    await gotoView(page, 'seasons');
    await requireCorpus(page);
    await page.getByRole('textbox').first().fill('Drag Race Season 4');
    const body = await page.locator('main').innerText(RENDER);

    // US season 4 has TWO runners-up sharing one rowspan cell on the source.
    // Reading only the first is the exact bug this feature shipped a fix for,
    // and a scalar winner/runner-up column would make it unrepresentable.
    expect(body).toContain('Chad Michaels');
    expect(body).toContain("Phi Phi O'Hara");
  });

  test('the roster links public profiles and leaves the rest as plain text', async ({ page }) => {
    await gotoView(page, 'roster');
    await requireCorpus(page);
    await page.getByRole('textbox').first().fill('Sasha Colby');

    const link = page.locator('main a[href*="/personalities/"]').first();
    await expect(link, 'a public queen must deep-link to her profile').toBeVisible(RENDER);

    // Every rendered personality link must point at a real slug, never an empty
    // or "undefined" one — a null slug is supposed to render as plain text.
    const hrefs = await page.locator('main a[href*="/personalities/"]').evaluateAll((as) =>
      as.map((a) => (a as HTMLAnchorElement).getAttribute('href') ?? ''),
    );
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(href, 'synthesised personality link').not.toMatch(
        /\/personalities\/(undefined|null|)$/,
      );
    }
  });

  test('the placement grid is a labelled table whose cells are never colour-only', async ({
    page,
  }) => {
    await page.goto('/competitions?view=grid&edition=rupauls-drag-race-season-18');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible(RENDER);
    await requireCorpus(page);

    const table = page.locator('main table').first();
    await expect(table).toBeVisible(RENDER);

    // Real row headers — a screen reader must announce the queen, not read 224
    // unlabelled cells.
    const rowHeaders = await table.locator('tbody th[scope="row"]').count();
    expect(rowHeaders, 'grid row headers').toBeGreaterThanOrEqual(10);

    const colHeaders = await table.locator('thead th[scope="col"]').count();
    expect(colHeaders, 'grid column headers').toBeGreaterThanOrEqual(10);

    // WCAG 1.4.1: every filled cell carries its outcome as TEXT, not just a
    // tint. Assert the property (each coloured cell has a visible code) rather
    // than a specific queen's run, which a re-scrape could legitimately change.
    const filled = table.locator('tbody td[style*="background-color"]');
    const filledCount = await filled.count();
    expect(filledCount, 'filled grid cells').toBeGreaterThanOrEqual(50);

    const codes = await filled.evaluateAll((tds) =>
      tds.map((td) => (td.textContent ?? '').replace(/\s+/g, '')),
    );
    const blank = codes.filter((c) => c.length === 0);
    expect(blank.length, 'filled cells with no text label').toBe(0);

    // 1.4.11: the tint is only accessible against the ink edge it is gated by.
    const borderless = await filled.evaluateAll(
      (tds) =>
        tds.filter((td) => {
          const w = getComputedStyle(td).borderTopWidth;
          return !w || parseFloat(w) === 0;
        }).length,
    );
    expect(borderless, 'filled cells rendered without their ink border').toBe(0);
  });

  test('the legend names every state the grid can show', async ({ page }) => {
    await page.goto('/competitions?view=grid&edition=rupauls-drag-race-season-18');
    await requireCorpus(page);
    await expect(page.locator('main table').first()).toBeVisible(RENDER);
    const body = await page.locator('main').innerText(RENDER);

    for (const label of ['Won the challenge', 'Safe', 'Bottom', 'Eliminated']) {
      expect(body, `legend is missing "${label}"`).toContain(label);
    }
    // Absence must be explained, not left as an unlabelled gap.
    expect(body).toMatch(/not in this episode/i);
  });

  test('the page body never scrolls sideways, at phone width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/competitions?view=grid&edition=rupauls-drag-race-season-18');
    await requireCorpus(page);
    await expect(page.locator('main table').first()).toBeVisible(RENDER);

    // The grid scrolls inside its own container; the document must not.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'horizontal page overflow in px').toBeLessThanOrEqual(1);
  });

  test('a crawler is served real prose, not an empty shell', async ({ request, baseURL }) => {
    // routeBody.ts is a Cloudflare PAGES FUNCTION. `vite preview` — what
    // e2e-pr.yml serves — only serves static files, so this can only be
    // asserted against a real deployment. Skipping on localhost rather than
    // asserting something the harness structurally cannot serve.
    test.skip(
      !!baseURL && /localhost|127\.0\.0\.1/.test(baseURL),
      'crawler body is a Pages Function; not served by vite preview',
    );
    // The four views are client-rendered, so routeBody.ts is all a non-JS bot
    // ever sees. Without it the page is invisible to search.
    const res = await request.get('/competitions', {
      headers: { 'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)' },
    });
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toMatch(/Drag Race seasons and LGBTQ\+ titleholder pageants/);
    expect(html).toMatch(/International Mr\.? Leather/);
  });
});
