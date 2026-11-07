/** Real production autocomplete -> detail navigation; no mocked responses or writes. */
import { test, expect } from '@playwright/test';
import { waitForAppReady } from './support/appReady';

test.use({ storageState: { cookies: [], origins: [] } });

for (const scenario of [
  {
    scope: 'Cities',
    type: 'city',
    query: 'Berlin',
    result: /Berlin.*Germany/,
    route: /\/city\/berlin(?:[?#]|$)/,
    heading: 'Berlin',
  },
  {
    scope: 'Venues',
    type: 'venue',
    query: 'Sonntags',
    result: /Sonntags-Club Café/,
    route: /\/venues\/sonntags-club-cafe(?:[?#]|$)/,
    heading: 'Sonntags-Club Café',
  },
]) {
  test(`${scenario.scope} autocomplete reaches its real detail page`, async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    await page.getByRole('banner').getByRole('button', { name: 'Search', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Search Queer Guide' });
    await expect(dialog).toBeVisible();
    await dialog
      .getByRole('combobox', { name: 'Search Queer Guide', exact: true })
      .fill(scenario.query);

    const response = page.waitForResponse((res) => {
      const url = new URL(res.url());
      if (
        url.hostname !== 'search.queer.guide' ||
        url.pathname !== '/autocomplete' ||
        res.request().method() !== 'POST'
      )
        return false;
      const body = res.request().postDataJSON();
      return body?.query === scenario.query && body?.types?.includes(scenario.type);
    });
    await dialog
      .getByRole('group', { name: 'Search scope' })
      .getByRole('button', { name: new RegExp(scenario.scope) })
      .click();
    const scoped = await response;
    const payload = await scoped.json();
    const request = scoped.request();
    const timing = request.timing();
    const { requestStart, responseStart } = timing;
    if (!scoped.ok() || payload.suggestions.length === 0) {
      const headers = scoped.headers();
      const diagnostic = {
        url: scoped.url(),
        request: request.postDataJSON(),
        status: scoped.status(),
        response: payload,
        timing,
        cfRay: headers['cf-ray'],
        serverTiming: headers['server-timing'],
      };
      const body = JSON.stringify(diagnostic, null, 2);
      await test.info().attach('scoped-autocomplete-response', {
        body,
        contentType: 'application/json',
      });
      // Keep the evidence in the job log even if report upload fails.
      console.info('Unexpected scoped autocomplete response', body);
    }
    expect(scoped.status()).toBe(200);
    expect(
      payload.suggestions.length,
      `Scoped autocomplete response after ${Math.round(responseStart - requestStart)} ms`,
    ).toBeGreaterThan(0);
    expect(payload.suggestions.every((hit: { type: string }) => hit.type === scenario.type)).toBe(
      true,
    );

    const result = dialog.getByRole('option', { name: scenario.result }).first();
    await expect(result).toBeVisible();
    const searchScreenshot = test.info().outputPath('scoped-autocomplete.png');
    await page.screenshot({ path: searchScreenshot });
    await test
      .info()
      .attach('scoped autocomplete', { path: searchScreenshot, contentType: 'image/png' });
    await result.click();
    await expect(page).toHaveURL(scenario.route);
    await expect(
      page.getByRole('heading', { level: 1, name: scenario.heading, exact: true }),
    ).toBeVisible();
    const detailScreenshot = test.info().outputPath('detail-page.png');
    await page.screenshot({ path: detailScreenshot });
    await test.info().attach('detail page', { path: detailScreenshot, contentType: 'image/png' });
  });
}
