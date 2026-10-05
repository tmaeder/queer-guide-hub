import { test, expect } from '@playwright/test';
import { waitForAppReady } from './support/appReady';
import { REDUCED_MOTION } from './support/reducedMotion';

/**
 * The crisis-UX invariants of /help, as tests rather than as comments.
 *
 * Each of these encodes a defect that was live in production before the
 * 2026-08-11 rebuild, so each one can regress silently again.
 */

test.use(REDUCED_MOTION);

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

test('help carries the ordinary site chrome and keeps the safety actions clear', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openHelp(page, '/help/ch');

  // /help used to replace the product header with a bespoke crisis bar and
  // drop the footer and bottom nav entirely (#4062). It is an ordinary page
  // again: a visitor who lands here cold must be able to reach the rest of the
  // site. The bespoke header is asserted ABSENT as well as the real one
  // present, so the old shape cannot quietly return alongside the new one.
  await expect(page.locator('[data-testid="help-safety-header"]')).toHaveCount(0);
  await expect(page.locator('header')).toHaveCount(1);
  await expect(page.locator('footer')).not.toHaveCount(0);
  await expect(page.getByRole('navigation', { name: /^navigation$/i })).toHaveCount(1);

  // The safety actions survived the restoration, in the content column rather
  // than in a fixed overlay — a floating control is the one thing that can
  // cover crisis content.
  await expect(
    page.locator('main').getByRole('button', { name: /leave this page immediately/i }),
  ).toBeVisible();
  await expect(page.locator('main').getByRole('button', { name: /hide screen/i })).toBeVisible();

  // ...and the sticky site header must not sit on top of them, nor on the
  // acute-danger strip, at first paint.
  const covered = await page.evaluate(() => {
    const header = document.querySelector('header');
    if (!header) return -1;
    const bar = header.getBoundingClientRect();
    return Array.from(
      document.querySelectorAll('main h1, main h2, main a[href^="tel:"], main button'),
    ).filter((element) => {
      const rect = element.getBoundingClientRect();
      if (rect.bottom <= 0 || rect.top >= window.innerHeight) return false;
      return rect.top < bar.bottom && rect.bottom > bar.top;
    }).length;
  });
  expect(covered).toBe(0);
});

test('Australian help shows the local emergency number', async ({ page }) => {
  await openHelp(page, '/help/au');
  // The number moved out of the bespoke safety header and into CrisisBar, the
  // life-safety strip at the top of the page — still above the fold, still
  // country-aware, now inside the ordinary content column.
  await expect(page.locator('main a[href="tel:000"]').first()).toBeVisible();
});

test('the hide-screen cover hides everything, chrome included', async ({ page }) => {
  // Restoring the ordinary page chrome put three new fixed layers on /help —
  // the site header, the bottom nav and the cookie consent banner. The banner
  // sits at --z-sticky (100), which is exactly where this cover used to sit,
  // and it renders after the route content, so at equal z-index it painted
  // over the cover: "Queer Guide uses cookies", still on screen, after someone
  // pressed the button whose whole job is leaving nothing on screen.
  await openHelp(page, '/help/ch');
  await page
    .locator('main')
    .getByRole('button', { name: /hide screen/i })
    .click();

  const cover = page.getByRole('button', { name: /click anywhere to show the page again/i });
  await expect(cover).toBeVisible();

  // Sample the real compositing result rather than the class list: ask what is
  // actually painted at a grid of points. A z-index assertion passes against a
  // cover that some other stacking context has trapped.
  const leaks = await page.evaluate(() => {
    const cover = document.querySelector('[aria-label*="show the page again" i]');
    if (!cover) return ['no cover'];
    const found = new Set<string>();
    for (let x = 0.1; x < 1; x += 0.2) {
      for (let y = 0.05; y < 1; y += 0.15) {
        const hit = document.elementFromPoint(
          Math.round(window.innerWidth * x),
          Math.round(window.innerHeight * y),
        );
        if (hit && !cover.contains(hit) && hit !== cover) {
          found.add(hit.tagName + (hit.className ? `.${String(hit.className).slice(0, 40)}` : ''));
        }
      }
    }
    return [...found];
  });
  expect(leaks, 'elements painting over the privacy cover').toEqual([]);
});

test('self-help keeps emergency and privacy actions available', async ({ page }) => {
  await openHelp(page, '/help/ch');
  await page.getByRole('button', { name: /not ready to talk/i }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('link', { name: /112/ })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /hide screen/i })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /leave this page immediately/i })).toBeVisible();
});
