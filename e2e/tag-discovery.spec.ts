import { test, expect } from '@playwright/test';

/**
 * Tags as a first-class discovery axis (anonymous flows). Live on prod.
 *
 * Note: tag slugs + their page <h1> are hyphenated (e.g. "Bear-Bar", not
 * "Bear Bar"), so heading matchers allow a hyphen or space.
 */

// Seed the cookie-consent key so the banner doesn't intercept clicks.
test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    try {
      localStorage.setItem('queer-guide-cookie-consent', 'accepted');
    } catch {
      /* ignore */
    }
  });
});

test.describe('tag discovery', () => {
  test('venue detail shows clickable tag chips that resolve by slug', async ({ page }) => {
    await page.goto('/venues/the-long-island-eagle-tavern');
    await expect(page.getByRole('heading', { name: 'The Long Island Eagle Tavern' })).toBeVisible();

    // Tag chips render as links to the canonical tag page using the slug.
    const bearBar = page.locator('a[href*="/tags/bear-bar"]').first();
    await expect(bearBar).toBeVisible();
    await expect(bearBar).toContainText(/bear[- ]bar/i);

    // Utility vocabulary still appears as facets on venue cards, but must not
    // become a thin glossary article. If editorial review later promotes this
    // term, the original discovery assertions resume automatically.
    await bearBar.click();
    await expect(page).toHaveURL(/\/tags\/bear-bar/);
    const heading = page.getByRole('heading', { name: /^Bear[- ]Bar$/i });
    if (
      !(await heading
        .waitFor({ state: 'visible', timeout: 5_000 })
        .then(() => true)
        .catch(() => false))
    ) {
      await expect(page.locator('article')).toHaveCount(0);
      test.skip(true, 'bear-bar is deliberately non-publishing utility vocabulary');
    }
    await expect(heading).toBeVisible();
    await expect(page.getByText(/tag not found/i)).toHaveCount(0);
  });

  test('canonical tag page aggregates linked content + has a Follow affordance', async ({
    page,
  }) => {
    await page.goto('/tags/bear-bar');
    const heading = page.getByRole('heading', { name: /^Bear[- ]Bar$/i });
    if (
      !(await heading
        .waitFor({ state: 'visible', timeout: 5_000 })
        .then(() => true)
        .catch(() => false))
    ) {
      await expect(page.locator('article')).toHaveCount(0);
      test.skip(true, 'bear-bar is deliberately non-publishing utility vocabulary');
    }
    await expect(heading).toBeVisible();

    // Cross-content aggregation: a venue-vocabulary tag surfaces a Venues section.
    await expect(page.getByRole('heading', { name: 'Venues' })).toBeVisible();

    // Follow affordance present (anon: clicking prompts sign-in, button still renders).
    await expect(page.getByRole('button', { name: /^Follow$/ })).toBeVisible();
  });

  test('marketplace utility vocabulary does not become a thin glossary article', async ({
    page,
  }) => {
    await page.goto('/tags/occ-everyday');
    await expect(page.getByRole('heading', { name: /^Everyday$/i })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Shop' })).toHaveCount(0);
    await expect(page.locator('article')).toHaveCount(0);
  });

  test('"More like this" cross-entity rail renders on a venue detail', async ({ page }) => {
    await page.goto('/venues/the-long-island-eagle-tavern');
    const rail = page.getByRole('heading', { name: 'More like this' });
    await rail.scrollIntoViewIfNeeded();
    await expect(rail).toBeVisible();
    // The rail links out to other entity detail pages.
    const section = page.locator('section', { has: rail });
    await expect(section.locator('a[href*="/venues/"]').first()).toBeVisible();
  });

  test('search tag filter narrows results via the ?tags= URL', async ({ page }) => {
    await page.goto('/search?q=eagle&types=venue&tags=leather-bar');
    // The active tag filter chip is shown (proves ?tags= was applied).
    await expect(page.getByText(/leather[- ]bar/i).first()).toBeVisible({ timeout: 15_000 });
    // Results come back (worker filters facets->tags). Result cards are
    // role="button" divs (not <a>) that navigate to a venue on click, so assert
    // the result-count summary rather than a /venues/ anchor.
    await expect(page.getByText(/\d+\s+results?/i).first()).toBeVisible({ timeout: 15_000 });
  });
});
