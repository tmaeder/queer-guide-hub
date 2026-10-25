/** Real production autocomplete -> detail navigation; no mocked responses or writes. */
import { test, expect } from '@playwright/test';
import { waitForAppReady } from './support/appReady';

test.use({ storageState: { cookies: [], origins: [] } });

for (const scenario of [
  { scope: 'Cities', type: 'city', query: 'Berlin', result: /Berlin.*Germany/, route: /\/city\/berlin(?:[?#]|$)/, heading: 'Berlin' },
  { scope: 'Venues', type: 'venue', query: 'Sonntags', result: /Sonntags-Club Café/, route: /\/venues\/sonntags-club-cafe(?:[?#]|$)/, heading: 'Sonntags-Club Café' },
]) {
  test(`${scenario.scope} autocomplete reaches its real detail page`, async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    const hero = page.locator('input[role="combobox"][aria-controls="qg-search-listbox-hero"]');
    await expect(hero).toBeVisible();
    await hero.fill(scenario.query);
    const dialog = page.getByRole('dialog', { name: 'Search Queer Guide' });
    await expect(dialog).toBeVisible();

    const response = page.waitForResponse((res) => {
      const url = new URL(res.url());
      if (url.hostname !== 'search.queer.guide' || url.pathname !== '/autocomplete' || res.request().method() !== 'POST') return false;
      const body = res.request().postDataJSON();
      return body?.query === scenario.query && body?.types?.includes(scenario.type);
    });
    await dialog.getByRole('tab', { name: new RegExp(scenario.scope) }).click();
    const scoped = await response;
    expect(scoped.status()).toBe(200);
    const payload = await scoped.json();
    expect(payload.suggestions.length).toBeGreaterThan(0);
    expect(payload.suggestions.every((hit: { type: string }) => hit.type === scenario.type)).toBe(true);

    const result = dialog.getByRole('option', { name: scenario.result }).first();
    await expect(result).toBeVisible();
    const searchScreenshot = test.info().outputPath('scoped-autocomplete.png');
    await page.screenshot({ path: searchScreenshot });
    await test.info().attach('scoped autocomplete', { path: searchScreenshot, contentType: 'image/png' });
    await result.click();
    await expect(page).toHaveURL(scenario.route);
    await expect(page.getByRole('heading', { level: 1, name: scenario.heading, exact: true })).toBeVisible();
    const detailScreenshot = test.info().outputPath('detail-page.png');
    await page.screenshot({ path: detailScreenshot });
    await test.info().attach('detail page', { path: detailScreenshot, contentType: 'image/png' });
  });
}
