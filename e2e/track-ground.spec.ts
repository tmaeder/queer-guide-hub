import { test, expect, type Page } from '@playwright/test';

/**
 * The ground layer (src/components/layout/TrackGround.tsx): four faint track
 * lines behind every public page, drifting slowly.
 *
 * Until 2026-11-27 the lines were a tile on `body`, hidden on every page by
 * LayoutShell's opaque backdrop and cut by page-coloured sticky bars. These
 * assertions are about what a visitor SEES, so each one checks what paints at
 * a point, not merely that the element exists — an element that is present
 * but covered is exactly the defect this spec exists for.
 */

const ROUTES = ['/', '/events', '/cities', '/tags', '/news'];

async function settle(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('track-ground')).toBeAttached({ timeout: 30_000 });
  await page.waitForTimeout(1500);
}

/**
 * Full-width elements between the ground and the viewer that paint an opaque
 * fill in the page colour. Those are invisible as surfaces and only cut the
 * lines. Cards and wells (a different tone) are intended and not counted.
 */
async function pageColouredBands(page: Page) {
  return page.evaluate(() => {
    const page = getComputedStyle(document.body).backgroundColor;
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('#root *')) {
      if (el.closest('[data-testid="track-ground"], header, footer, [role="dialog"]')) continue;
      const cs = getComputedStyle(el);
      if (cs.backgroundColor !== page) continue;
      const r = el.getBoundingClientRect();
      if (r.width < innerWidth * 0.85 || r.height < 8 || r.bottom < 0 || r.top > innerHeight)
        continue;
      out.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 100)}`);
    }
    return out;
  });
}

for (const route of ROUTES) {
  test(`${route}: the ground is drawn and nothing page-coloured cuts it`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await settle(page, route);

    const ground = page.getByTestId('track-ground');
    await expect(ground.locator('svg.track-ground-line')).toHaveCount(4);

    // Positive control: each line is actually stroked in a track colour, so a
    // "no bands" pass cannot come from a ground that draws nothing.
    const strokes = await ground
      .locator('svg.track-ground-line')
      .evaluateAll((svgs) => svgs.map((s) => getComputedStyle(s).stroke));
    expect(new Set(strokes).size, `strokes: ${strokes.join(', ')}`).toBe(4);
    for (const s of strokes) expect(s).not.toBe('none');

    expect(await pageColouredBands(page)).toEqual([]);
  });
}

test('the lines drift', async ({ page }) => {
  await settle(page, '/tags');
  const read = () =>
    page
      .locator('.track-ground-line')
      .evaluateAll((els) => els.map((e) => getComputedStyle(e).transform));
  const a = await read();
  await page.waitForTimeout(2500);
  const b = await read();
  expect(b, 'no track moved in 2.5s').not.toEqual(a);
});

test.describe('motion is off where it must be', () => {
  test('under prefers-reduced-motion', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await settle(page, '/tags');
    const names = await page
      .locator('.track-ground-line')
      .evaluateAll((els) => els.map((e) => getComputedStyle(e).animationName));
    expect(names).toEqual(['none', 'none', 'none', 'none']);
    await ctx.close();
  });

  test('on /help (crisis pages stay animation-free)', async ({ page }) => {
    await settle(page, '/help');
    await expect(page.getByTestId('track-ground')).toHaveAttribute('data-motion', 'still');
    const names = await page
      .locator('.track-ground-line')
      .evaluateAll((els) => els.map((e) => getComputedStyle(e).animationName));
    expect(names).toEqual(['none', 'none', 'none', 'none']);
  });
});

test('sticky bars are transparent at rest and frosted once pinned', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await settle(page, '/events');
  const bar = page.locator('.sticky-glass').first();
  await expect(bar).toBeVisible();
  await expect(bar).not.toHaveAttribute('data-stuck');
  expect(await bar.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgba(0, 0, 0, 0)');

  await page.mouse.wheel(0, 1600);
  await expect(bar).toHaveAttribute('data-stuck', '', { timeout: 5000 });
  const bg = await bar.evaluate((e) => getComputedStyle(e).backgroundColor);
  expect(bg).not.toBe('rgba(0, 0, 0, 0)');
});
