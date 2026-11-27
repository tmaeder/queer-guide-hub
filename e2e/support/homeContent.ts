import { expect, type Page } from '@playwright/test';

/** The homepage band of city / country / village cards (`home.discovery.destinations`). */
export const DESTINATIONS_HEADING = 'Cities, countries and villages';

/** Mount the deferred homepage bands through their real viewport boundary. */
export async function loadHomeContent(page: Page) {
  await page.locator('.subway-hero').evaluate((hero) => {
    window.scrollTo(0, hero.getBoundingClientRect().bottom + window.scrollY);
  });
  // The destinations band head mounts with HomeContent itself (its cards are
  // deferred inside it). A skeleton or a chunk error cannot satisfy the control,
  // even before the data-backed cards arrive.
  await page
    .getByRole('heading', { name: DESTINATIONS_HEADING, exact: true })
    .waitFor({ state: 'visible', timeout: 15_000 });
}

/**
 * Bring the destinations band's card grid into view (it sits below the map band
 * and mounts on its own viewport margin) and wait for the first real card.
 */
export async function loadDestinations(page: Page) {
  await loadHomeContent(page);
  const destinations = page.getByRole('region', { name: DESTINATIONS_HEADING });
  const firstCity = destinations.locator('a[href^="/city/"]').first();
  // Re-scroll until the grid has mounted: the bands above can still grow after
  // the first scroll and push the grid back out of its viewport margin.
  //
  // The 90s budget is NOT padding for a slow API. Measured 2026-11-20 on prod in
  // headless Chromium WITHOUT reduced motion: the main thread stalls 20-90s here
  // (CPU profile: native rendering work, ~no JS; blocking maplibre does not help),
  // while the same path takes ~3s under reduced motion. That is a page-performance
  // finding tracked separately; this helper only has to get past it.
  await expect(async () => {
    await destinations.evaluate((el) => el.scrollIntoView({ block: 'end' }));
    await expect(firstCity).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 90_000 });
  await destinations.evaluate((el) => el.scrollIntoView({ block: 'end' }));
  return destinations;
}
