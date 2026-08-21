import { test, expect } from '@playwright/test';
import { waitForAppReady } from './support/appReady';

/**
 * The crisis-UX invariants of /help, as tests rather than as comments.
 *
 * Each of these encodes a defect that was live in production before the
 * 2026-08-11 rebuild, so each one can regress silently again.
 */

test.use({ reducedMotion: 'reduce' });

async function openHelp(page: import('@playwright/test').Page, path = '/help') {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('main h1', { timeout: 30_000 });
  await waitForAppReady(page);
}

test('the EmergencyService JSON-LD describes the line the page actually recommends', async ({
  page,
}) => {
  // useMeta's effect did not depend on `jsonLd`, so the block was captured on
  // the first render — while the hotline list was still empty — and never
  // updated. It therefore never carried a telephone number at all.
  await openHelp(page, '/help/gb');

  const heroName = (await page.locator('main h2').nth(1).textContent())?.trim();
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  const emergency = blocks.map((b) => JSON.parse(b)).find((b) => b['@type'] === 'EmergencyService');

  expect(emergency, 'no EmergencyService block found').toBeTruthy();

  // The invariant is that the structured data describes whatever the panel is
  // showing — which has two legitimate states, not one. When the CMS returns
  // no hotlines the panel heads "We could not load the directory" and the
  // JSON-LD falls back to the generic name; both are correct, and asserting
  // only the happy path made a data hiccup look like a structured-data bug.
  // The 2026-08-14 nightly failed exactly this way (expected "We could not
  // load the directory", received "LGBTQIA+ Crisis Support") while the page
  // was behaving perfectly.
  const cmsEmpty = /could not load the directory|could not work out where you are/i.test(
    heroName ?? '',
  );

  if (cmsEmpty) {
    // Still a real assertion: the two must fall back TOGETHER. A generic
    // JSON-LD name beside a real hero heading is the original bug.
    expect(emergency.name).toBe('LGBTQIA+ Crisis Support');
    expect(
      emergency.telephone,
      'a fallback block must not invent a number for a line we could not load',
    ).toBeFalsy();
    return;
  }

  expect(emergency.name).toBe(heroName);
  expect(emergency.telephone, 'structured data must carry a dialable number').toBeTruthy();
});

test('searching cannot rewrite the emergency structured data', async ({ page }) => {
  await openHelp(page, '/help/gb');
  const before = await page.locator('script[type="application/ld+json"]').allTextContents();
  const beforeEmergency = before.find((b) => b.includes('EmergencyService'));

  await page.getByPlaceholder(/search hotlines/i).fill('zzz-no-such-line');
  await expect(page.getByText(/0 lines/i)).toBeVisible();

  const after = await page.locator('script[type="application/ld+json"]').allTextContents();
  expect(after.find((b) => b.includes('EmergencyService'))).toBe(beforeEmergency);
});

test('choosing a country puts it in the URL so the page can be shared', async ({ page }) => {
  // The picker used to write only localStorage, so a friend or case worker
  // could not send someone the page for their own country.
  await openHelp(page);
  await page.getByRole('button', { name: /^change$/i }).click();
  await page.getByRole('button', { name: 'Deutschland' }).click();

  await expect(page).toHaveURL(/\/help\/de$/);
  await expect(page.getByRole('link', { name: /^canonical$/i })).toHaveCount(0);
});

test('a directory is never presented as a callable line', async ({ page }) => {
  // Audit H-1. Directories render as a plain link list, call-now lines as
  // <article> rows with a Call button — different shapes, not just different
  // sections, so the difference survives a glance.
  await openHelp(page, '/help/int');

  const cards = page.locator('main article');
  await expect(cards).toHaveCount(0);
  await expect(page.locator('main a[href^="tel:"]').filter({ hasText: /call now/i })).toHaveCount(
    0,
  );
  await expect(page.getByRole('heading', { name: /directories/i })).toBeVisible();
});

test('a line with unstructured hours is never labelled closed', async ({ page }) => {
  // Telling someone a crisis line is shut when we merely could not parse its
  // hours is the harmful direction, so unknown must render as silence.
  await openHelp(page, '/help/au');

  // QLife opens 15:00-21:00 in each state's own local time, which no single
  // IANA zone can represent — so it deliberately carries no hours_slots.
  const qlife = page.locator('main article').filter({ hasText: 'QLife' });
  await expect(qlife).toHaveCount(1);
  await expect(qlife).not.toContainText(/closed right now/i);
});
