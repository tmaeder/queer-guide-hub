import { test, expect } from '@playwright/test';

/**
 * Phase 1 smoke for /hotels: type filter, URL state, /venues/<section> redirect,
 * 404 prerender meta on unknown hotel slug.
 *
 * Phase 4 cases (Load More dedupe, search relevance) are intentionally skipped
 * here — they belong to a separate PR.
 */

test.describe('Hotels — Phase 1 quick wins', () => {
  test('apartment filter returns at least one card and reflects in the URL', async ({ page }) => {
    await page.goto('/hotels', { waitUntil: 'networkidle' });

    // Open the type select. shadcn/Radix select uses combobox role.
    const typeSelect = page.getByRole('combobox').first();
    await expect(typeSelect).toBeVisible({ timeout: 10_000 });
    await typeSelect.click();

    const apartmentOption = page.getByRole('option', { name: 'Apartment' });
    if ((await apartmentOption.count()) === 0) {
      test.skip(true, 'No Apartment option in the type filter on this env (data state).');
      return;
    }
    await apartmentOption.click();

    await expect(page).toHaveURL(/[?&]type=apartment/);

    // First request settles, results render.
    await page.waitForLoadState('networkidle');
    await expect(
      page.locator('[class*="grid"] > a, [class*="grid"] > div').first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('B&B chip shows display label, not slug', async ({ page }) => {
    // Use a guaranteed-zero query so the empty state with chips renders.
    await page.goto('/hotels?type=bnb&q=__definitely_not_a_real_name__zzz', {
      waitUntil: 'networkidle',
    });
    // Scope to the EmptyState's active-filter chip container so we don't
    // strict-mode-collide with the same label inside the Type select. The
    // chip's dismiss glyph is an SVG <X />, not a literal × character.
    const chipsRegion = page.getByTestId('empty-state-active-filters');
    if ((await chipsRegion.count()) === 0) {
      test.skip(true, 'Empty-state chips region not rendered on this env.');
      return;
    }
    await expect(chipsRegion.getByText('B&B', { exact: true })).toBeVisible();
    await expect(chipsRegion.getByText('bnb', { exact: true })).toHaveCount(0);
  });

  test('/venues/hotels redirects to /hotels', async ({ page }) => {
    await page.goto('/venues/hotels');
    await expect(page).toHaveURL(/\/hotels$/);
  });

  test('unknown hotel slug renders 404 prerender meta', async ({ page }) => {
    await page.goto('/hotels/__definitely-not-a-real-slug-9999999', {
      waitUntil: 'networkidle',
    });
    await expect(page.getByText('Hotel not found')).toBeVisible();

    // Prerender meta is only emitted by the static-site prerender pipeline.
    // Skip the meta-tag asserts on environments where prerender is disabled
    // (e.g. local vite preview, branch previews without the prerender step).
    const statusMeta = page.locator('meta[name="prerender-status-code"]');
    if ((await statusMeta.count()) === 0) {
      test.skip(true, 'Prerender disabled on this env — meta tags not emitted.');
      return;
    }
    const status = await statusMeta.getAttribute('content');
    expect(status).toBe('404');
    const robots = await page.locator('meta[name="robots"]').getAttribute('content');
    expect(robots).toContain('noindex');
  });

  test('Load More yields disjoint pages (no duplicate IDs)', async ({ page }) => {
    await page.goto('/hotels', { waitUntil: 'networkidle' });

    // Scope to the main result grid only — the page also shows editorial
    // sections (featured hotel, picks, "in queer villages") whose anchors
    // legitimately repeat hotels that appear in the grid. We only care
    // that the paginated grid itself has no duplicate IDs.
    const collectIds = () =>
      page.evaluate(() =>
        Array.from(
          document.querySelectorAll(
            '[data-bento-preset="mosaic"] a[href^="/hotels/"]',
          ),
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
    await page.waitForLoadState('networkidle');

    const afterIds = await collectIds();
    expect(afterIds.length).toBeGreaterThan(beforeIds.size);
    // No duplicates within the rendered list.
    expect(new Set(afterIds).size).toBe(afterIds.length);
  });

  test('searching "Berlin" returns only Berlin-y results', async ({ page }) => {
    await page.goto('/hotels?q=Berlin', { waitUntil: 'networkidle' });

    // Card subtitles include "City, Country" — every visible card should
    // mention Berlin somewhere (city OR country prefix matches).
    const cards = page.locator('a[href^="/hotels/"]');
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(20);

    for (let i = 0; i < Math.min(count, 10); i++) {
      const text = (await cards.nth(i).innerText()).toLowerCase();
      expect(text).toContain('berlin');
    }
  });
});
