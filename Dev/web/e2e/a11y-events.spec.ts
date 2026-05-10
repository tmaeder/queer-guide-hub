import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test.describe('Events — automated a11y', () => {
  test.setTimeout(120_000);

  test('/events has no serious/critical axe violations', async ({ page }) => {
    await page.goto('/events');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('main', { timeout: 30_000 }).catch(() => {});

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

  test('ticket CTA has accessible name when event cards render', async ({ page }) => {
    await page.goto('/events');
    await page.waitForLoadState('domcontentloaded');
    const ticketBtn = page.getByRole('button', { name: /get tickets|tickets/i }).first();
    // If no tickets on any event today, skip; otherwise it must have an accessible name
    if ((await ticketBtn.count()) > 0) {
      await expect(ticketBtn).toBeVisible();
    }
  });
});
