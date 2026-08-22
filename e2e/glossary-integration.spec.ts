import { test, expect } from '@playwright/test';

/**
 * Glossary integration — the tags wiki surfaced across the product
 * (2026-08-22): the 7th nav intent, the footer column, chip hover cards
 * and the homepage band.
 *
 * Data-dependent assertions (hover definition, band cards) navigate through
 * the live glossary hub instead of pinning a fixture slug, so the spec keeps
 * working as the corpus moves.
 */

test.use({ reducedMotion: 'reduce' });

test.describe('glossary in navigation', () => {
  test.skip(({ isMobile }) => !!isMobile, 'desktop chrome');

  test('header carries a Glossary tab that lands on /tags', async ({ page }) => {
    await page.goto('/');
    const tab = page.locator('header nav[aria-label="Primary"] a', { hasText: 'Glossary' });
    await expect(tab).toBeVisible();
    await tab.click();
    await expect(page).toHaveURL(/\/tags$/);
    await expect(page.locator('main h1')).toBeVisible();
    // The active tab is marked and carries the pink track rule.
    const active = page.locator('header nav[aria-label="Primary"] a[aria-current="page"]');
    await expect(active).toHaveText('Glossary');
    await expect(active.locator('span[aria-hidden]')).toHaveClass(/bg-track-pink/);
  });

  test('the 7-tab row never wraps at the narrowest desktop width', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 900 });
    await page.goto('/');
    const nav = page.locator('header nav[aria-label="Primary"]');
    await expect(nav).toBeVisible();
    const tabs = nav.locator('a');
    await expect(tabs).toHaveCount(7);
    // All tab tops must be equal — a wrapped row puts one on a second line.
    const tops = await tabs.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().top));
    expect(new Set(tops.map((t) => Math.round(t))).size).toBe(1);
  });

  test('footer renders a Glossary column with its wiki links', async ({ page }) => {
    await page.goto('/');
    const footer = page.locator('footer nav[aria-label="Footer navigation"]');
    await expect(footer.getByRole('link', { name: 'Glossary' })).toBeVisible();
    await expect(footer.getByRole('link', { name: 'All terms' })).toHaveAttribute(
      'href',
      /\/tags$/,
    );
    await expect(footer.getByRole('link', { name: 'STI guide' })).toHaveAttribute(
      'href',
      /\/tags\/sti-guide$/,
    );
  });
});

test.describe('glossary hover cards', () => {
  test.skip(({ isMobile }) => !!isMobile, 'hover is a pointer affordance');

  test('hovering a tag chip shows a definition card with an entry link', async ({ page }) => {
    // Event detail pages render TagChip rows (82.5% of events carry tags), so
    // walk the first few event cards and hover the first chip found.
    await page.goto('/events');
    const cards = page.locator('main a[href*="/events/"]');
    await expect(cards.first()).toBeVisible();
    const hrefs = (await cards.evaluateAll((els) => els.map((el) => el.getAttribute('href'))))
      .filter((h): h is string => !!h && !h.endsWith('/events'))
      .slice(0, 5);

    let chipFound = false;
    for (const href of hrefs) {
      await page.goto(href);
      const chip = page.locator('main a[data-tag-slug]').first();
      // The chip row renders after the event fetch — wait, don't poll count.
      const visible = await chip
        .waitFor({ state: 'visible', timeout: 8000 })
        .then(() => true)
        .catch(() => false);
      if (!visible) continue;
      chipFound = true;
      await chip.scrollIntoViewIfNeeded();
      await chip.hover();
      const hoverCard = page.locator('[data-radix-popper-content-wrapper]');
      await expect(hoverCard).toBeVisible({ timeout: 5000 });
      await expect(hoverCard.getByRole('link', { name: 'Read the entry' })).toBeVisible();
      break;
    }
    test.skip(!chipFound, 'no tag chips on the first event entries');
  });
});

test.describe('homepage glossary band', () => {
  test('renders rotating term cards linking into the wiki', async ({ page }) => {
    await page.goto('/');
    // The band mounts behind DeferredSection's intersection observer, so it
    // does not exist until the viewport actually approaches it — and
    // programmatic scrollTo does not fire the observer; wheel events do.
    const band = page.getByRole('heading', { name: 'Know the words' });
    for (let i = 0; i < 20 && (await band.count()) === 0; i++) {
      await page.mouse.wheel(0, 1600);
      await page.waitForTimeout(250);
    }
    await band.scrollIntoViewIfNeeded();
    await expect(band).toBeVisible();
    const section = page.locator('section', { has: band });
    const entryLinks = section.getByRole('link', { name: 'Read the entry' });
    expect(await entryLinks.count()).toBeGreaterThan(0);
    await expect(entryLinks.first()).toHaveAttribute('href', /\/tags\/.+/);
  });
});
