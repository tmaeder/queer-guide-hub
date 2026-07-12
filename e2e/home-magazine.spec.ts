import { test, expect, type Page } from '@playwright/test';

/**
 * Homepage "magazine front page" (PR #2055).
 *
 * Runs against the configured baseURL — defaults to production. Anonymous
 * state, no fixtures. Below-fold sections are mounted lazily by
 * DeferredSection (IntersectionObserver, 800px rootMargin), so tests scroll
 * progressively before asserting on them. Content assertions stay resilient
 * to rotating data: they check section chrome and shape, not today's rows.
 */
test.use({ reducedMotion: 'reduce' });

const DESKTOP = { width: 1280, height: 900 };
const MOBILE = { width: 390, height: 844 };

async function dismissCookieBanner(page: Page) {
  const banner = page.getByRole('region', { name: /cookie settings/i });
  if (!(await banner.isVisible().catch(() => false))) return;
  await banner.getByRole('button', { name: /necessary only|accept all/i }).first().click();
  await expect(banner).toBeHidden().catch(() => {});
}

async function gotoHome(page: Page, viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport);
  // The hero is a live MapLibre map (continuous tile requests) so `networkidle`
  // never settles — wait for the masthead h1 instead (same rationale as
  // design-system.spec.ts).
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.locator('main h1').waitFor({ state: 'visible', timeout: 30_000 });
  await dismissCookieBanner(page);
  await page.waitForTimeout(500); // hydration
}

/** Scroll the page in steps so every DeferredSection mounts and settles. */
async function scrollThrough(page: Page) {
  for (let i = 0; i < 8; i++) {
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(700);
  }
}

test.describe('homepage masthead', () => {
  test.setTimeout(90_000);

  test('desktop: visible h1 masthead with live stat chips over the map', async ({ page }) => {
    await gotoHome(page, DESKTOP);

    // The h1 is the visible identity overlay, not sr-only.
    const h1 = page.locator('main h1');
    await expect(h1).toBeVisible();
    await expect(h1).not.toHaveClass(/sr-only/);

    // Live stat chips: formatted non-zero counts. Skip-null logic means every
    // rendered chip must contain a digit 1-9 somewhere.
    const chips = page.locator('main h1 ~ * .tabular-nums, main .tabular-nums');
    await expect(chips.first()).toBeVisible({ timeout: 20_000 });
    const chipTexts = await chips.allTextContents();
    expect(chipTexts.length).toBeGreaterThanOrEqual(1);
    for (const text of chipTexts.slice(0, 3)) {
      expect(text).toMatch(/[1-9]/);
    }

    // Map CTA present and pointing at /map.
    const mapLink = page.getByRole('link', { name: /open the map/i });
    await expect(mapLink).toBeVisible();
    await expect(mapLink).toHaveAttribute('href', /\/map/);
  });

  test('desktop: masthead fades after first map interaction but stays in the DOM', async ({
    page,
  }) => {
    await gotoHome(page, DESKTOP);
    const h1 = page.locator('main h1');
    await expect(h1).toBeVisible();

    // First pointer interaction anywhere on the hero map dims the masthead.
    await page
      .locator('main section')
      .first()
      .dispatchEvent('pointerdown', { bubbles: true });

    const overlay = page.locator('main h1').locator('xpath=ancestor::div[1]');
    await expect(overlay).toHaveAttribute('aria-hidden', 'true', { timeout: 10_000 });
    // SEO: the headline is still in the DOM.
    await expect(h1).toHaveCount(1);
  });

  test('mobile: identity band renders above the map in normal flow', async ({ page }) => {
    await gotoHome(page, MOBILE);
    const h1 = page.locator('main h1');
    await expect(h1).toBeVisible();
    await expect(h1).not.toHaveClass(/sr-only/);

    // Band precedes the map section (normal flow, not an overlay).
    const bandBox = await h1.boundingBox();
    const mapBox = await page.locator('main section').first().boundingBox();
    expect(bandBox && mapBox && bandBox.y < mapBox.y).toBeTruthy();
  });
});

test.describe('homepage sections', () => {
  test.setTimeout(120_000);

  test('desktop: magazine sections mount in community-first order', async ({ page }) => {
    await gotoHome(page, DESKTOP);
    await scrollThrough(page);

    const headings = page.locator('main h2');
    const texts = (await headings.allTextContents()).map((t) => t.trim());

    // Events section — either the live agenda or its pride-season fallback,
    // never silently absent.
    expect(
      texts.some((t) => /upcoming events|pride season ahead/i.test(t)),
      `events section missing; h2s: ${texts.join(' | ')}`,
    ).toBeTruthy();

    // Destinations — guaranteed by the editorial whitelist.
    expect(texts.some((t) => /where the scene lives/i.test(t))).toBeTruthy();

    // News magazine.
    expect(texts.some((t) => /latest news/i.test(t))).toBeTruthy();

    // Marketplace — owned rail or its community fallback, below the
    // community sections.
    const shopIdx = texts.findIndex((t) => /queer-owned finds|community picks/i.test(t));
    const newsIdx = texts.findIndex((t) => /latest news/i.test(t));
    expect(shopIdx).toBeGreaterThan(-1);
    expect(shopIdx).toBeGreaterThan(newsIdx);

    // Closing CTA.
    expect(texts.some((t) => /built by the community/i.test(t))).toBeTruthy();
  });

  test('desktop: destinations rail links to city pages', async ({ page }) => {
    await gotoHome(page, DESKTOP);
    await scrollThrough(page);

    const cityLinks = page.locator('main a[href*="/city/"]');
    await expect(cityLinks.first()).toBeVisible({ timeout: 20_000 });
    expect(await cityLinks.count()).toBeGreaterThanOrEqual(3);
  });

  test('desktop: born-this-week strip renders with an interactive celebrate control', async ({
    page,
  }) => {
    await gotoHome(page, DESKTOP);
    await scrollThrough(page);

    // Section may legitimately self-hide on a thin week — skip, don't fail.
    const heading = page.locator('main h2', { hasText: /born this week/i });
    test.skip((await heading.count()) === 0, 'no birthdays in the ±3-day window');

    await heading.scrollIntoViewIfNeeded();
    // The PartyPopper celebrate affordance is present and enabled (its gating —
    // one celebration per chip — is covered in HomeBornThisWeek.test). We don't
    // click here: the strip is a live marquee/rail with lazy-loading avatars, so
    // a pixel-stable click is environment-flaky and not what this checks.
    const celebrate = page.getByRole('button', { name: /^celebrate/i }).first();
    await expect(celebrate).toBeVisible();
    await expect(celebrate).toBeEnabled();
  });
});
