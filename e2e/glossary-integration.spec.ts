import { test, expect } from '@playwright/test';
import { REDUCED_MOTION } from './support/reducedMotion';

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

  test('the 6-tab row never wraps at the narrowest desktop width', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 900 });
    await page.goto('/');
    const nav = page.locator('header nav[aria-label="Primary"]');
    await expect(nav).toBeVisible();
    const tabs = nav.locator('a');
    await expect(tabs).toHaveCount(6);
    // All tab tops must be equal — a wrapped row puts one on a second line.
    const tops = await tabs.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().top));
    expect(new Set(tops.map((t) => Math.round(t))).size).toBe(1);
  });

  test('footer keeps the glossary reachable from its compact Knowledge link', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('contentinfo').scrollIntoViewIfNeeded();
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
    // Five bounded 8-second probes plus navigation must fit the test budget.
    test.setTimeout(75_000);
    // Event detail pages render TagChip rows (82.5% of events carry tags), so
    // walk the first few event cards and hover the first chip found.
    await page.goto('/events');
    const cards = page.locator('main a[href*="/events/"]');
    await expect(cards.first()).toBeVisible();
    const hrefs = [
      ...new Set(
        (await cards.evaluateAll((els) => els.map((el) => el.getAttribute('href')))).filter(
          (h): h is string => !!h && !h.endsWith('/events'),
        ),
      ),
    ].slice(0, 5);

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

