import { test, expect } from '@playwright/test';

/**
 * Zürich late-night mobility, end to end on the deployed site.
 * Design: docs/plans/2026-10-22-zurich-late-night-mobility-design.md
 *
 * Every assertion that something is ABSENT (Berlin has no bikes fact, the browser
 * makes no upstream call) is paired with a positive control on the same page, so a
 * page that failed to render cannot pass for a correct one.
 */

const ZURICH_VENUE = '/venues/petra-s-tip-top-bar';
const BERLIN_VENUE = '/venues/about-blank';
const CLOCK = /\b([01]\d|2[0-3]):[0-5]\d\b/;

// Record the "Necessary only" choice before the first navigation so the banner
// never renders. Clicking it raced page hydration under load and timed out
// (3 of 6 failed on 2026-10-23, all on the click, while the data was correct).
const NECESSARY_ONLY = JSON.stringify({
  version: '1.0',
  preferences: { necessary: true, functional: false, analytics: false, marketing: false },
});

test.describe('Zürich late-night mobility', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(
      ([key, value]) => window.localStorage.setItem(key, value),
      ['queer-guide-cookie-consent', NECESSARY_ONLY],
    );
  });

  test('city page states last departures, the all-night network and its sources', async ({
    page,
  }) => {
    await page.goto('/city/zuerich#travel');
    const section = page.getByRole('region', { name: 'Late night' });
    await expect(section).toBeAttached({ timeout: 20_000 });
    // Facts arrive after the heading (separate query): auto-waiting assertions, not a
    // one-shot innerText read.
    await expect(section).toContainText('Last tram', { timeout: 20_000 });
    await expect(section).toContainText(CLOCK);
    await expect(section).toContainText('All-night service');
    await expect(section).toContainText(/Fri & Sat: \d+ lines until/);
    await expect(section).toContainText('valid until');
    // Punctuality carries its measurement period, never a bare percentage.
    await expect(section).toContainText(/\d+% of tram and bus departures, measured 2023/);
    await expect(section.getByRole('link', { name: /opentransportdata\.swiss/ })).toHaveAttribute(
      'href',
      /opentransportdata\.swiss/,
    );
  });

  test('the national timetable also covers Geneva, without Zürich-only punctuality', async ({
    page,
  }) => {
    await page.goto('/city/geneva#travel');
    const section = page.getByRole('region', { name: 'Late night' });
    await expect(section).toContainText('Last tram', { timeout: 20_000 });
    await expect(section).toContainText(CLOCK);
    await expect(section).toContainText('opentransportdata.swiss');
    // VBZ punctuality is Zürich data; it must not leak onto another city's page.
    await expect(section).not.toContainText('On time after 23:00');
  });

  test('Berlin reads the German timetable, credited to DELFI', async ({ page }) => {
    await page.goto('/city/berlin#travel');
    const section = page.getByRole('region', { name: 'Late night' });
    await expect(section).toContainText('Last metro', { timeout: 20_000 });
    await expect(section).toContainText(CLOCK);
    await expect(section).toContainText('DELFI');
    await expect(section).not.toContainText('opentransportdata.swiss');
  });

  test('Vienna reads the Wiener Linien timetable', async ({ page }) => {
    await page.goto('/city/vienna#travel');
    const section = page.getByRole('region', { name: 'Late night' });
    await expect(section).toContainText('Last tram', { timeout: 20_000 });
    await expect(section).toContainText(CLOCK);
    await expect(section).toContainText('Wiener Linien');
    await expect(section).not.toContainText('DELFI');
  });

  test('Bordeaux reads its own network feed, credited to TBM', async ({ page }) => {
    await page.goto('/city/bordeaux-france#travel');
    const section = page.getByRole('region', { name: 'Late night' });
    await expect(section).toContainText('Last tram', { timeout: 20_000 });
    await expect(section).toContainText(CLOCK);
    await expect(section).toContainText('TBM');
    await expect(section).toContainText('transport.data.gouv.fr');
  });

  test('/going-out in Zürich has a Getting home section', async ({ page }) => {
    await page.goto('/going-out?city=zuerich');
    await expect(page.getByText('Getting home', { exact: false }).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/Last tram/).first()).toBeAttached();
  });

  test('Zürich venue shows nearby shared bikes; a Berlin venue shows none', async ({ page }) => {
    await page.goto(ZURICH_VENUE);
    const fact = page.locator('dt', { hasText: 'Bikes & e-scooters now' }).locator('..');
    await expect(fact).toBeVisible({ timeout: 20_000 });
    await expect(fact).toContainText(/About \d+ within 300 m/);
    await expect(fact).toContainText(/min ago · Shared mobility: sharedmobility\.ch/);

    await page.goto(BERLIN_VENUE);
    // Positive control: the fact grid rendered at all.
    await expect(page.locator('dt', { hasText: 'Category' })).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('dt', { hasText: 'Bikes & e-scooters now' })).toHaveCount(0);
  });

  test('map overlay reads our snapshot and never calls the upstream feed', async ({ page }) => {
    const upstream: string[] = [];
    let snapshotCalls = 0;
    page.on('request', (r) => {
      if (/sharedmobility\.ch/.test(r.url())) upstream.push(r.url());
      if (/shared_mobility_in_bbox/.test(r.url())) snapshotCalls++;
    });
    await page.goto('/map?lat=47.3705&lng=8.5420&z=15');
    await page.getByRole('button', { name: 'Filters' }).click();
    const chip = page.getByRole('button', { name: 'Shared bikes & e-scooters' });
    await chip.click();
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    const status = page.getByRole('status').filter({ hasText: /sharedmobility\.ch/ });
    await expect(status).toBeVisible({ timeout: 20_000 });
    await expect(status).toContainText(/Shared bikes & e-scooters · \d+ min ago/);
    expect(snapshotCalls).toBeGreaterThan(0);
    expect(upstream).toEqual([]);
  });
});
