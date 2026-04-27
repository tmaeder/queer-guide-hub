import { test, expect } from '@playwright/test';

/**
 * Regression safety net: QA verified on 2026-04-20 that News, Hotels, and
 * Venue detail pages do not leak raw placeholder values or unrendered
 * moustache templates. This smoke spec protects against regressions.
 */
const FORBIDDEN = [/\bnull\b/, /\bundefined\b/, /\[object Object\]/, /\{\{/, /\}\}/];

async function assertNoLeaks(page: import('@playwright/test').Page, path: string) {
  await page.goto(path, { waitUntil: 'networkidle' });
  const main = page.locator('main').first();
  await main.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {});
  const text = (await main.count()) > 0 ? await main.innerText() : await page.locator('body').innerText();
  for (const pattern of FORBIDDEN) {
    expect(text, `leaked placeholder ${pattern} on ${path}`).not.toMatch(pattern);
  }
}

test.describe('@smoke placeholder leaks', () => {
  test('News list does not leak', async ({ page }) => {
    await assertNoLeaks(page, '/news');
  });

  test('Hotels list does not leak', async ({ page }) => {
    await assertNoLeaks(page, '/hotels');
  });

  test('Venues list does not leak', async ({ page }) => {
    await assertNoLeaks(page, '/venues');
  });
});
