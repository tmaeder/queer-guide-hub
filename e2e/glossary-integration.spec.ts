import { test, expect } from '@playwright/test';
import { REDUCED_MOTION } from './support/reducedMotion';

/**
 * Glossary integration — the tags wiki surfaced across the product
 * (2026-08-22): the 7th nav intent, the compact footer link, chip hover cards
 * and the homepage band.
 *
 * Data-dependent assertions (hover definition, band cards) navigate through
 * the live glossary hub instead of pinning a fixture slug, so the spec keeps
 * working as the corpus moves.
 */

test.use(REDUCED_MOTION);

test.describe('glossary in navigation', () => {
  test.skip(({ isMobile }) => !!isMobile, 'desktop chrome');

  test('header carries a Knowledge tab that lands on /tags', async ({ page }) => {
    await page.goto('/');
    const tab = page.locator('header nav[aria-label="Primary"] a', { hasText: 'Knowledge' });
    await expect(tab).toBeVisible();
    await tab.click();
    await expect(page).toHaveURL(/\/tags$/);
    await expect(page.locator('main h1')).toBeVisible();
    // The active tab is marked and carries the pink track rule.
    const active = page.locator('header nav[aria-label="Primary"] a[aria-current="page"]');
    await expect(active).toHaveText('Knowledge');
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

  test('footer keeps the glossary reachable from its compact Knowledge link', async ({ page }) => {
    await page.goto('/');
    const footer = page.locator('footer nav[aria-label="Footer navigation"]');
    const knowledge = footer.getByRole('link', { name: 'Knowledge' });
    await expect(knowledge).toBeVisible();
    await expect(knowledge).toHaveAttribute('href', /\/tags$/);
    await knowledge.click();
    await expect(page).toHaveURL(/\/tags$/);
    await expect(page.locator('main h1')).toBeVisible();
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
  for (const state of ['entries', 'empty', 'error'] as const) {
    test(`renders the ${state} response state`, async ({ page }) => {
      // Only fixture the homepage preview query. Other glossary/API requests
      // keep their normal contract; this UI check does not depend on live DB latency.
      await page.route('**/rest/v1/unified_tags?*', async (route) => {
        const params = new URL(route.request().url()).searchParams;
        if (
          params.get('limit') !== '24' ||
          params.get('seo_indexable') !== 'eq.true' ||
          params.get('is_adult') !== 'eq.false'
        ) {
          await route.fallback();
          return;
        }
        await route.fulfill({
          status: state === 'error' ? 400 : 200,
          contentType: 'application/json',
          body: JSON.stringify(
            state === 'error'
              ? { code: 'PGRST100', message: 'Preview fixture rejected' }
              : state === 'empty'
                ? []
                : [
                    {
                      id: '00000000-0000-4000-8000-000000000001',
                      slug: 'glossary-preview-fixture',
                      name: 'Glossary preview fixture',
                      short_description: 'A defined term for the homepage preview test.',
                      description: null,
                      category: 'Identity',
                      is_adult: false,
                      is_sensitive: false,
                      image_url: null,
                      usage_count: 10,
                    },
                  ],
          ),
        });
      });
      await page.goto('/');
      const band = page.getByRole('heading', { name: 'Know the words' });
      for (let i = 0; i < 20 && (await band.count()) === 0; i++) {
        await page.mouse.wheel(0, 1600);
        await page.waitForTimeout(250);
      }
      await band.scrollIntoViewIfNeeded();
      await expect(band).toBeVisible();
      const section = page.locator('section', { has: band });
      const entryLinks = section.getByRole('link', { name: 'Read the entry' });
      if (state === 'entries') {
        await expect(entryLinks).toHaveCount(1);
        await expect(entryLinks.first()).toHaveAttribute(
          'href',
          /\/tags\/glossary-preview-fixture$/,
        );
      } else if (state === 'empty') {
        await expect(section.getByText(/no glossary terms are available right now/i)).toBeVisible();
        await expect(entryLinks).toHaveCount(0);
      } else {
        await expect(section.getByText(/this section could not load/i)).toBeVisible({
          timeout: 15_000,
        });
        await expect(section.getByRole('button', { name: /try again/i })).toBeVisible();
        await expect(entryLinks).toHaveCount(0);
      }
    });
  }
});
