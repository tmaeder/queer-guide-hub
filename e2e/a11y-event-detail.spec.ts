import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

// Pick the first event slug visible on /events as the detail target. Avoids
// hardcoding a slug that may rotate out of the dataset.
async function pickEventSlug(page: import('@playwright/test').Page): Promise<string | null> {
  await page.goto('/events');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('a[href^="/events/"]', { timeout: 30_000 }).catch(() => {});
  const href = await page
    .locator('a[href^="/events/"]')
    .first()
    .getAttribute('href')
    .catch(() => null);
  if (!href) return null;
  const slug = href.replace(/^\/events\//, '');
  return slug && slug !== '' ? slug : null;
}

test.describe('Event detail — automated a11y + SEO landmarks', () => {
  test.setTimeout(120_000);

  test('detail page has no serious/critical axe violations', async ({ page }) => {
    const slug = await pickEventSlug(page);
    test.skip(!slug, 'No events visible to drive a detail-page test');

    await page.goto(`/events/${slug}`);
    await page.waitForLoadState('domcontentloaded');

    const results = await new AxeBuilder({ page })
      .exclude('footer')
      .disableRules(['link-in-text-block'])
      .withTags(WCAG_TAGS)
      .analyze();

    const blocking = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });

  test('detail page exposes a single h1 and an event-specific title', async ({ page }) => {
    const slug = await pickEventSlug(page);
    test.skip(!slug, 'No events visible to drive a detail-page test');

    await page.goto(`/events/${slug}`);
    await page.waitForLoadState('domcontentloaded');

    const h1Count = await page.locator('h1').count();
    expect(h1Count, 'event detail page should have exactly one <h1>').toBe(1);

    const title = await page.title();
    expect(
      title.length,
      'event-specific titles should not collapse to the bare default',
    ).toBeGreaterThan('Queer Guide'.length);
    expect(title).not.toBe('Queer Guide');
  });
});
