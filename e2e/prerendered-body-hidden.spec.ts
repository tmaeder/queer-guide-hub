import { expect, test } from '@playwright/test';

/**
 * The edge middleware injects a plain-HTML copy of public pages into #root for
 * humans as well as crawlers (functions/_lib/routeBody.ts). Until createRoot
 * replaced it, it painted as bare unstyled text on the page ground. The
 * stylesheet now hides it; this asserts that state BEFORE React can run, so a
 * pass cannot come from React having already swapped the body out.
 */
test.describe('edge-rendered body never paints as bare text', () => {
  test.use({ javaScriptEnabled: false });

  for (const path of ['/marketplace', '/about']) {
    test(`${path} ships the body hidden`, async ({ page }) => {
      await page.goto(path, { waitUntil: 'load' });
      const body = page.locator('#root > [data-prerendered]');
      // Positive control: the body is still served (crawlers and agents need it),
      // so "hidden" is a property of the CSS, not of an absent element.
      await expect(body).toHaveCount(1);
      await expect(body).toHaveCSS('display', 'none');
      await expect(page.getByText('Explore Queer Guide', { exact: true })).toBeHidden();
    });
  }
});
