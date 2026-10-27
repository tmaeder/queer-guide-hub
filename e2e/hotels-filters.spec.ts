import { test, expect } from '@playwright/test';

/**
 * Phase 1 smoke for /hotels: type filter, URL state, /venues/<section> redirect,
 * 404 prerender meta on unknown hotel slug.
 *
 * Also verifies pagination deduplication and search relevance.
 */

// The paginated result grid only — the page's editorial sections also link
// hotels and legitimately repeat ones in the grid.
const RESULT_CARDS = '[data-testid="hotel-results"] a[href^="/hotels/"]';

test.describe('Hotels — Phase 1 quick wins', () => {
  test('apartment filter returns at least one card and reflects in the URL', async ({ page }) => {
    await page.goto('/hotels', { waitUntil: 'domcontentloaded' });
    await expect(page.locator(RESULT_CARDS).first()).toBeVisible({ timeout: 15_000 });

    // Open the type select. shadcn/Radix select uses combobox role.
    const typeSelect = page.getByRole('combobox', { name: 'Hotel type' });
    await expect(typeSelect).toBeVisible({ timeout: 10_000 });
    await typeSelect.click();

    const apartmentOption = page.getByRole('option', { name: 'Apartment' });
    if ((await apartmentOption.count()) === 0) {
      test.skip(true, 'No Apartment option in the type filter on this env (data state).');
      return;
    }
    await apartmentOption.click();

    await expect(page).toHaveURL(/[?&]type=apartment/);

    // Wait for filtered cards, rather than unrelated background requests or
    // a skeleton/editorial grid that can render before results arrive.
    const cards = page.locator(RESULT_CARDS);
    await expect(cards.first().getByText('Apartment', { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      cards.filter({ hasNot: page.getByText('Apartment', { exact: true }) }),
    ).toHaveCount(0);
  });

  test('B&B chip shows display label, not slug', async ({ page }) => {
    // Use a guaranteed-zero query so the empty state with chips renders.
    await page.goto('/hotels?type=bnb&q=__definitely_not_a_real_name__zzz', {
      waitUntil: 'domcontentloaded',
    });
    // Scope to the EmptyState's active-filter chip container so we don't
    // strict-mode-collide with the same label inside the Type select. The
    // chip's dismiss glyph is an SVG <X />, not a literal × character.
    const chipsRegion = page.getByTestId('empty-state-active-filters');
    await expect(chipsRegion).toBeVisible({ timeout: 15_000 });
    await expect(chipsRegion.getByText('B&B', { exact: true })).toBeVisible();
    await expect(chipsRegion.getByText('bnb', { exact: true })).toHaveCount(0);
  });

  test('/venues/hotels redirects to /hotels', async ({ page }) => {
    await page.goto('/venues/hotels');
    await expect(page).toHaveURL(/\/hotels$/);
  });

  test('unknown hotel slug renders a 404 state with noindex', async ({ page }) => {
    const response = await page.goto('/hotels/__definitely-not-a-real-slug-9999999', {
      waitUntil: 'domcontentloaded',
    });
    // Two 404 renderers depending on environment: the CF Pages middleware
    // ("No hotel at this stop.", functions/_middleware.ts) on prod, and
    // the React SPA fallback ("Hotel not found", HotelDetail.tsx) on the
    // vite-preview PR build where the middleware doesn't run. Accept either.
    await expect(page.getByText(/no hotel at this stop|hotel not found/i).first()).toBeVisible({
      timeout: 15_000,
    });

    // The static middleware returns an HTTP 404. The SPA signals it through
    // NotFoundMeta, including on vite preview. Both must exclude indexing.
    if (await page.getByText(/no hotel at this stop/i).isVisible()) {
      expect(response?.status()).toBe(404);
    } else {
      await expect(page.locator('meta[name="prerender-status-code"]')).toHaveAttribute(
        'content',
        '404',
      );
    }
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  });

  test('Load More yields disjoint pages (no duplicate IDs)', async ({ page }) => {
    await page.goto('/hotels', { waitUntil: 'domcontentloaded' });
    await expect(page.locator(RESULT_CARDS).first()).toBeVisible({ timeout: 15_000 });

    // Scope to the main result grid only — the page also shows editorial
    // sections (featured hotel, picks, "in queer villages") whose anchors
    // legitimately repeat hotels that appear in the grid. We only care
    // that the paginated grid itself has no duplicate IDs.
    const collectIds = () =>
      page.evaluate(() =>
        Array.from(
          document.querySelectorAll('[data-testid="hotel-results"] a[href^="/hotels/"]'),
        ).map((a) => (a as HTMLAnchorElement).getAttribute('href') ?? ''),
      );

    const beforeIds = new Set(await collectIds());
    expect(beforeIds.size).toBeGreaterThan(0);

    const loadMore = page.getByRole('button', { name: /Load More/i });
    if (!(await loadMore.isVisible().catch(() => false))) {
      // Total < pageSize — nothing to test.
      return;
    }

    await loadMore.click();
    // The rendered grid is the readiness signal for the appended page.
    await expect
      .poll(async () => (await collectIds()).length, { timeout: 10_000 })
      .toBeGreaterThan(beforeIds.size);

    const afterIds = await collectIds();
    expect(afterIds.length).toBeGreaterThan(beforeIds.size);
    // No duplicates within the rendered list.
    expect(new Set(afterIds).size).toBe(afterIds.length);
  });

  test('searching "Berlin" returns only Berlin-y results', async ({ page }) => {
    await page.goto('/hotels?q=Berlin', { waitUntil: 'domcontentloaded' });

    // Card subtitles include "City, Country" — every visible card should
    // mention Berlin somewhere (city OR country prefix matches).
    const cards = page.locator(RESULT_CARDS);
    await expect(cards.first()).toBeVisible({ timeout: 15_000 });
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(20);

    for (let i = 0; i < Math.min(count, 10); i++) {
      const text = (await cards.nth(i).innerText()).toLowerCase();
      expect(text).toContain('berlin');
    }
  });
});
