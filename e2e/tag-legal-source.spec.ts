import { test, expect } from '@playwright/test';

/**
 * The glossary's "Source of law" block.
 *
 * Track B (a tag naming a CLASS of law) is the case under test: it links to
 * `/rights#<topic>`, and that deep link broke twice while it was being built —
 * first because `/rights/<topic>` is not a route at all, then because the topic
 * cards mount only after the all-countries fetch, so the browser's own fragment
 * jump ran against an empty page and left the reader at the top of a 31,000px
 * document.
 *
 * Both failures are invisible to a unit test: the href was correct throughout.
 * The only thing that distinguishes working from broken is whether the page is
 * ACTUALLY SCROLLED afterwards, so that is what this asserts — never merely that
 * the anchor exists.
 */

test.describe('tag → source of law', () => {
  test('a class-of-law tag links to its rights topic and the anchor lands', async ({ page }) => {
    await page.goto('/tags/marriage-equality', { waitUntil: 'domcontentloaded' });

    // Honest framing first: we do not claim a single statute for this.
    await expect(page.getByText(/not a single law/i)).toBeVisible({ timeout: 30_000 });

    const link = page.getByRole('link', { name: /See status by country/i });
    await expect(link).toHaveAttribute('href', '/rights#marriage');
    await link.click();

    await expect(page.locator('#marriage')).toBeAttached({ timeout: 30_000 });
    await expect
      .poll(async () => await page.evaluate(() => Math.round(window.scrollY)), {
        timeout: 20_000,
        message: 'page never scrolled to the #marriage topic card',
      })
      .toBeGreaterThan(500);

    const top = await page
      .locator('#marriage')
      .evaluate((el) => Math.round(el.getBoundingClientRect().top));
    expect(top, 'topic card should rest near the top of the viewport').toBeLessThan(300);
    expect(top).toBeGreaterThan(-100);
  });

  test('a direct deep link scrolls on a cold load', async ({ page }) => {
    // The harder case: no in-app navigation, so the browser's fragment jump has
    // already happened and failed before any of our code runs.
    await page.goto('/rights#marriage', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#marriage')).toBeAttached({ timeout: 30_000 });
    await expect
      .poll(async () => await page.evaluate(() => Math.round(window.scrollY)), { timeout: 20_000 })
      .toBeGreaterThan(500);
  });

  test('every rights topic has an anchor to land on', async ({ page }) => {
    // tagRightTopics.ts may only point at topics that render an id.
    // Generous: the topic cards wait on the all-250-countries fetch, which is the
    // slowest query on the site and regularly needs >30s cold.
    test.setTimeout(90_000);
    await page.goto('/rights', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('li#marriage')).toBeAttached({ timeout: 30_000 });
    const ids = await page.evaluate(() =>
      [...document.querySelectorAll('li[id]')].map((l) => l.id),
    );
    for (const slug of ['marriage', 'criminalisation', 'gender-recognition', 'hate-crime']) {
      expect(ids, `/rights is missing an anchor for ${slug}`).toContain(slug);
    }
  });

  test('an ordinary tag shows no source-of-law block at all', async ({ page }) => {
    // The component returns null rather than drawing an empty card — the same
    // rule ProvenanceLine follows.
    await page.goto('/tags/bear-bar', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Provenance/i).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Source of law/i)).toHaveCount(0);
    await expect(page.getByText(/not a single law/i)).toHaveCount(0);
  });
});
