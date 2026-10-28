import type { Page } from '@playwright/test';

/** Mount the deferred homepage bands through their real viewport boundary. */
export async function loadHomeContent(page: Page) {
  await page.locator('.subway-hero').evaluate((hero) => {
    window.scrollTo(0, hero.getBoundingClientRect().bottom + window.scrollY);
  });
  // This closing band mounts with HomeContent itself. A skeleton or a chunk
  // error cannot satisfy the control, even before the data-backed cards arrive.
  await page
    .getByRole('heading', { name: 'No ads. No data sales. Just riders.', exact: true })
    .waitFor({ state: 'visible', timeout: 15_000 });
}
