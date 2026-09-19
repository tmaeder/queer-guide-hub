import { test, expect } from '@playwright/test';

/**
 * The cookie consent bar must not cover the bottom-fixed chrome.
 *
 * WHY THIS EXISTS. The bar is `fixed inset-x-0 bottom-0` at
 * `z-[var(--z-sticky)]` = 100, against the audio player's z-30 and the FABs'
 * z-45. It is the topmost bottom-anchored layer, so it does not crowd them —
 * it PAINTS OVER them. Measured on prod at 390x844 with an episode playing:
 * bar 638-844 (206px tall), player 674-758. The player was entirely inside
 * the bar's box and invisible until consent was given, which is every first
 * visit — the one session where a reader is most likely to try a podcast.
 *
 * The fix is a published clearance (`--consent-bar-clearance`, measured by
 * ResizeObserver because the height changes with viewport and locale) that
 * the player and both FABs add to their own bottom offset.
 *
 * ASSERTS GEOMETRY, NOT CLASS NAMES. A test that checks for the CSS variable
 * in a style string passes while the bar still covers the player — the whole
 * defect was that every individual style was internally valid.
 */

const MOBILE = { width: 390, height: 844 };

type Box = { top: number; bottom: number; left: number; right: number; h: number };

async function boxes(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const rect = (el: Element | null) => {
      if (!el) return null;
      const b = el.getBoundingClientRect();
      if (b.height === 0 || b.width === 0) return null;
      return {
        top: Math.round(b.top),
        bottom: Math.round(b.bottom),
        left: Math.round(b.left),
        right: Math.round(b.right),
        h: Math.round(b.height),
      };
    };
    const banner = document.querySelector('[role="region"][aria-label="Cookie settings"]');
    const player = document.querySelector('[role="region"][aria-label*="odcast"]');
    const fabs = [...document.querySelectorAll('button, a')]
      .filter((e) => getComputedStyle(e).position === 'fixed')
      .map((e) => ({
        ...(rect(e) as Box | null),
        label: (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 30),
      }))
      .filter((f) => f.top !== undefined && (f as unknown as Box).top > 300);
    return { banner: rect(banner), player: rect(player), fabs };
  });
}

/** Two boxes overlap only if they intersect on BOTH axes. */
function overlaps(a: Box, b: Box): boolean {
  return a.top < b.bottom && b.top < a.bottom && a.left < b.right && b.left < a.right;
}

test.describe('@smoke consent bar clearance', () => {
  test.use({ viewport: MOBILE });

  test('the consent bar does not cover the playing audio bar', async ({ page, context }) => {
    // A fresh context is the whole point: the bar only ever shows before a
    // choice is stored, so a suite that reuses state can never see this.
    await context.clearCookies();

    await page.goto('/podcasts');
    await page.locator('a[href^="/podcasts/"]').first().click();
    await page.locator('a[href^="/news/"]').first().waitFor({ timeout: 30_000 });
    await page.locator('a[href^="/news/"]').first().click();

    const play = page.getByRole('button', { name: /^play$/i }).first();
    await play.waitFor({ timeout: 30_000 });
    await play.click();

    // Wait on the ELEMENT, not the button label — a label can flip on local
    // state while the media never starts.
    await page.waitForFunction(
      () => {
        const a = document.querySelector('audio');
        return !!a && !a.paused && a.currentTime > 0;
      },
      undefined,
      { timeout: 45_000 },
    );
    // Let the published clearance settle through one layout pass.
    await page.waitForTimeout(800);

    const { banner, player } = await boxes(page);

    // POSITIVE CONTROL. Without it "nothing overlaps" also passes when the
    // banner was never shown or the player never mounted — which is exactly
    // the state a stored consent cookie produces.
    expect(banner, 'the consent bar is on screen (fresh context)').not.toBeNull();
    expect(player, 'the audio bar is on screen (episode playing)').not.toBeNull();

    expect(
      overlaps(player as Box, banner as Box),
      `player ${JSON.stringify(player)} overlaps consent bar ${JSON.stringify(banner)}`,
    ).toBe(false);

    // The player must sit ABOVE the bar, not be pushed off-screen by an
    // over-large offset — a clearance bug in the other direction.
    expect((player as Box).bottom).toBeLessThanOrEqual((banner as Box).top);
    expect((player as Box).top).toBeGreaterThan(0);
  });

  test('the consent bar does not cover the floating action buttons', async ({ page, context }) => {
    await context.clearCookies();
    await page.goto('/podcasts');
    await page.waitForSelector('[role="region"][aria-label="Cookie settings"]', { timeout: 30_000 });
    await page.waitForTimeout(800);

    const { banner, fabs } = await boxes(page);
    expect(banner).not.toBeNull();
    // Positive control: if no FAB is rendered there is nothing to assert and
    // a bare "none overlap" would be vacuous.
    expect(fabs.length, 'at least one bottom-fixed FAB is on screen').toBeGreaterThan(0);

    for (const f of fabs) {
      expect(
        overlaps(f as unknown as Box, banner as Box),
        `FAB "${f.label}" ${JSON.stringify(f)} overlaps consent bar ${JSON.stringify(banner)}`,
      ).toBe(false);
    }
  });

  test('dismissing the bar releases the offset', async ({ page, context }) => {
    // The mirror failure: a clearance that is published and never cleared
    // leaves a permanent gap under every FAB for the rest of the session.
    await context.clearCookies();
    await page.goto('/podcasts');
    await page.waitForSelector('[role="region"][aria-label="Cookie settings"]', { timeout: 30_000 });

    const during = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--consent-bar-clearance').trim(),
    );
    expect(during, 'clearance is published while the bar is up').toMatch(/^\d+px$/);
    expect(parseInt(during, 10)).toBeGreaterThan(0);

    await page.getByRole('button', { name: /accept all/i }).first().click();
    await page.waitForFunction(
      () => !document.querySelector('[role="region"][aria-label="Cookie settings"]'),
      undefined,
      { timeout: 10_000 },
    );

    const after = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--consent-bar-clearance').trim(),
    );
    expect(after, 'clearance is released once a choice is stored').toBe('');
  });
});
