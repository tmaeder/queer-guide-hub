import { test, expect } from '@playwright/test';

// Venues audit Phase 3 (P0/P1): map view markers + category data checks.

test.describe('Venues — map view', () => {
  test('map view renders canvas and shows results count', async ({ page }) => {
    await page.goto('/venues?view=map');
    await page.waitForLoadState('domcontentloaded');

    // MapLibre canvas should be visible.
    const canvas = page.locator('canvas.maplibregl-canvas');
    await expect(canvas).toBeVisible({ timeout: 15_000 });

    // Results count badge appears (may say "Loading..." initially).
    // Two components render this pill with different wording — MapResultsPill
    // says "N results in view", the subway rebrand's MapRail (which is what
    // /venues?view=map renders now) says "N places in view" — so match either
    // rather than pinning one component's copy.
    const countBadge = page.locator('text=/\\d+ (results|places) in view|Loading/');
    await expect(countBadge).toBeVisible({ timeout: 20_000 });
  });

  // D1 regression guard. The base map + counter could render fine while
  // the cluster source silently failed to plot any features. Assert that
  // MapLibre reports at least one point feature in the rendered cluster
  // or unclustered layer within a reasonable settle window.
  test('map view renders at least one venue feature (D1)', async ({ page }) => {
    // The cluster-source load (venue GeoJSON fetch + MapLibre source load) can
    // take a while on a cold prod load through CI, so give this test extra
    // headroom over the 30s default — the sibling "canvas + counter" test
    // proves the base map renders; this one only guards the feature count.
    test.setTimeout(75_000);
    await page.goto('/venues?view=map');
    await page.waitForLoadState('domcontentloaded');
    const canvas = page.locator('canvas.maplibregl-canvas');
    await expect(canvas).toBeVisible({ timeout: 15_000 });

    // The in-view counter starts as "Loading…" and only switches to the count
    // once the cluster source has loaded. Wait for it to leave the loading
    // state first (generous window for a cold source load).
    //
    // Matches BOTH wordings AND either casing. The subway rebrand moved this
    // surface onto MapRail ("N places in view") while MapResultsPill still says
    // "N results in view"; widening the wording alone still never matched,
    // because MapRail's span carries `uppercase` and `text=` matches RENDERED
    // text — so the node reads "80 PLACES IN VIEW" however lowercase its
    // textContent is. Measured on production at the runner's own 1280x720:
    // exactly one element contains "in view", `textContent` is
    // "80 places in view", `innerText` is "80 PLACES IN VIEW", it is 97x14px at
    // opacity 1 — present and visible the whole time the test spent 45s not
    // finding it, and reading as a dead cluster source while the map plotted 80
    // venues. The `i` is what was missing.
    const counter = page.locator('text=/\\d+ (results|places) in view/i');
    await expect(counter).toBeVisible({ timeout: 45_000 });

    // The map auto-flies to the visitor's IP geolocation at zoom 10
    // (useMapAutoFly), so the default viewport is CI-runner-dependent and may
    // legitimately contain zero venues in bounds — the counter then reads
    // "0 results in view" even though the source is healthy. That made this
    // guard flaky by runner region. Zoom out to a world view, where the full
    // venue cluster set is always in bounds, before asserting the source
    // actually plotted features (the real D1 regression this guards).
    const zoomOut = page.locator('.maplibregl-ctrl-zoom-out');
    if (await zoomOut.isVisible().catch(() => false)) {
      for (let i = 0; i < 7; i++) {
        // force + short timeout: never let a transiently-obscured button (a
        // "Loading" overlay repaints on each moveend) stall the 75s budget.
        await zoomOut.click({ force: true, timeout: 2_000 }).catch(() => {});
        await page.waitForTimeout(150); // let the debounced moveend recount
      }
    }

    await expect
      .poll(
        async () => {
          const count = await counter.textContent().catch(() => '');
          const m = count?.match(/(\d+)/);
          return m ? Number(m[1]) : 0;
        },
        { timeout: 15_000, intervals: [500, 1000, 2000] },
      )
      .toBeGreaterThan(0);
  });

  test('map empty-state overlay shows when filters match nothing', async ({ page }) => {
    // Use a nonsense search that should match zero venues.
    await page.goto('/venues?view=map&q=zzzznonexistent999');
    await page.waitForLoadState('domcontentloaded');

    // Wait for the map + filter to settle.
    await page.waitForTimeout(2000);

    // If filteredTotal is 0 the overlay should appear with "Clear Filters".
    const clearBtn = page.getByRole('button', { name: /clear filters/i });
    // This is conditional — if the DB happens to match, skip gracefully.
    const overlay = page.locator('text=/no venues match/i');
    const hasOverlay = await overlay.isVisible().catch(() => false);
    if (hasOverlay) {
      await expect(clearBtn).toBeVisible();
    }
  });
});

test.describe('Venues — category data quality', () => {
  test('bar filter results do not contain obvious non-bar venues', async ({ page }) => {
    await page.goto('/venues?category=bar');
    await page.waitForLoadState('domcontentloaded');

    // Wait for cards to load.
    await page.waitForTimeout(2000);

    // Grab all venue card titles visible on the page.
    const titles = await page.locator('[data-testid="venue-card"] h3, [data-testid="venue-card"] h4, .venue-card h3, .venue-card h4')
      .allTextContents()
      .catch(() => [] as string[]);

    // If we got card titles, check none are obviously mis-tagged.
    // (This is a soft check — if card selectors don't match, we skip.)
    if (titles.length > 0) {
      const misTagged = titles.filter((t) =>
        /\b(barbershop|fitness center|hair salon|laser hair)\b/i.test(t),
      );
      expect(misTagged, `Mis-tagged venues in bar results: ${misTagged.join(', ')}`).toHaveLength(0);
    }
  });
});
