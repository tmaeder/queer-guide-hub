import { test, expect } from '@playwright/test';

const RAW_KEY_REGEX = /pages\.events\.(filter(Search|City|NearYou|From|To|NearMe)|clearFilter\w+|showPastEvents|pastEvents|activeFilters|clearAll)/;

test.describe('events i18n chrome', () => {
  test('EN /events has no German chrome leaks', async ({ page }) => {
    await page.goto('/events');
    await page.waitForLoadState('domcontentloaded');
    const body = await page.textContent('body');
    expect(body).toBeTruthy();
    expect(body!).not.toMatch(/Vergangene Veranstaltungen anzeigen/);
    await expect(page.getByText(/Show past events/i).first()).toBeVisible();
  });

  test('DE /de/events has no raw i18n keys', async ({ page }) => {
    await page.goto('/de/events');
    await page.waitForLoadState('domcontentloaded');
    const body = await page.textContent('body');
    expect(body).toBeTruthy();
    expect(body!).not.toMatch(RAW_KEY_REGEX);
    await expect(page.getByText(/Vergangene Veranstaltungen/).first()).toBeVisible();
  });

  test('DE /de/events: filter bar does not leak bare English labels', async ({ page }) => {
    await page.goto('/de/events');
    await page.waitForLoadState('domcontentloaded');
    const body = (await page.textContent('body')) ?? '';
    const banned = [/\bClear All\b/, /\bActive filters:\b/, /\bNear Me\b/, /\bShow past events\b/];
    for (const pattern of banned) {
      expect(body, `expected DE locale not to contain ${pattern}`).not.toMatch(pattern);
    }
  });
});
