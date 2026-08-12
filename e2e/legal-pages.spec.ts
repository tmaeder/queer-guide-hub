import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { waitForAppReady } from './support/appReady';

/**
 * The policy pages as subway lines: each `<h2>` is a station, the rail beside
 * the prose is the route diagram.
 *
 * Everything asserted here was broken before the rebuild:
 *  - the TOC was `<button>` + `scrollIntoView`, so no section of any policy had
 *    a URL and none could be shared or linked to;
 *  - only `<h2>` was indexed, so the Cookie Policy's three cookie categories
 *    were unreachable from navigation;
 *  - section numbers were typed into the heading text, so they could not agree
 *    with anything the layout rendered.
 */

// Route transitions fade opacity 0->1; scanning mid-fade yields phantom
// contrast failures and unstable scroll positions.
test.use({ reducedMotion: 'reduce' });

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const RAIL = 'nav[aria-label="Sections of this policy"]';
const POLICIES = ['/terms', '/privacy', '/cookies', '/dmca'];

async function openPolicy(page: Page, route: string) {
  await page.goto(route);
  await waitForAppReady(page);
  await page.waitForSelector('.qg-cms-body h2', { timeout: 30_000 });
}

test.describe('Policy lines', () => {
  test.setTimeout(120_000);

  for (const route of POLICIES) {
    test(`${route} gives every section a stable id and no typed-in number`, async ({ page }) => {
      await openPolicy(page, route);

      const headings = await page.$$eval('.qg-cms-body h2, .qg-cms-body h3', (els) =>
        els.map((el) => ({ id: el.id, text: (el.textContent ?? '').trim() })),
      );
      expect(headings.length).toBeGreaterThan(0);

      // Every heading is addressable. Half of them were not.
      expect(headings.filter((h) => !h.id)).toEqual([]);
      // Ids are unique, or a fragment is ambiguous.
      expect(new Set(headings.map((h) => h.id)).size).toBe(headings.length);
      // The number comes from the CSS counter, never from the prose. A typed
      // "1." would render as "① 1. Overview".
      expect(headings.filter((h) => /^\d{1,2}\.\s/.test(h.text))).toEqual([]);
    });
  }

  test('a station click writes the fragment and moves the page there', async ({ page }) => {
    await openPolicy(page, '/cookies');

    const link = page.locator(RAIL).last().getByRole('link', { name: /Managing Cookies/i });
    await link.click();
    await expect(page).toHaveURL(/#managing-cookies$/);

    const top = await page
      .locator('#managing-cookies')
      .evaluate((el) => el.getBoundingClientRect().top);
    // Landed near the top of the viewport rather than wherever we started.
    expect(top).toBeLessThan(200);
  });

  test('an inbound deep link lands on the section, not the top of the page', async ({ page }) => {
    // The browser's own fragment jump fires before the CMS body arrives over
    // the network, so the layout has to redo it once the headings exist.
    await page.goto('/privacy#your-rights');
    await waitForAppReady(page);
    await page.waitForSelector('#your-rights', { timeout: 30_000 });
    await page.waitForFunction(() => window.scrollY > 200, undefined, { timeout: 15_000 });

    const top = await page.locator('#your-rights').evaluate((el) => el.getBoundingClientRect().top);
    expect(top).toBeLessThan(250);
    await expect(page.locator(`${RAIL} a[aria-current="true"]`).last()).toHaveAttribute(
      'href',
      '#your-rights',
    );
  });

  test('opening a policy does not rewrite the address bar', async ({ page }) => {
    // Seeding the fragment on load would make every policy URL a section URL,
    // and would fill the Back button with stations the reader never chose.
    await openPolicy(page, '/terms');
    expect(new URL(page.url()).hash).toBe('');
  });

  test('sub-sections reach the rail', async ({ page }) => {
    await openPolicy(page, '/cookies');
    // "Essential Cookies" is an <h3>. Under the old TOC it did not exist.
    await expect(
      page.locator(RAIL).last().getByRole('link', { name: /Essential Cookies/i }),
    ).toBeVisible();
  });

  test('the rail is anchors, so sections are shareable', async ({ page }) => {
    await openPolicy(page, '/terms');
    const rail = page.locator(RAIL).last();
    await expect(rail.locator('button')).toHaveCount(0);
    expect(await rail.locator('a[href^="#"]').count()).toBeGreaterThan(5);
  });
});

test.describe('Legal hub', () => {
  test.setTimeout(120_000);

  test('indexes the four lines in line order, with their lengths', async ({ page }) => {
    await page.goto('/legal');
    await waitForAppReady(page);
    await page.waitForSelector('a[href$="/terms"]', { timeout: 30_000 });

    const titles = await page.$$eval('main a.card-lift h2', (els) =>
      els.map((el) => (el.textContent ?? '').trim()),
    );
    // Terms first: the document you accept is the one you meet first. The hook
    // sorts children by title, which put Cookies and Copyright ahead of it.
    expect(titles).toEqual([
      'Terms of Service',
      'Privacy Policy',
      'Cookie Policy',
      'Copyright Policy',
    ]);
    await expect(page.getByText(/\d+ sections/).first()).toBeVisible();
  });

  test('cards carry the hard ink shadow on hover and none at rest', async ({ page }) => {
    await page.goto('/legal');
    await waitForAppReady(page);
    const card = page.locator('main a.card-lift').first();
    await expect(card).toBeVisible();
    expect(await card.evaluate((el) => getComputedStyle(el).boxShadow)).toBe('none');
    await card.hover();
    await page.waitForTimeout(250);
    expect(await card.evaluate((el) => getComputedStyle(el).boxShadow)).toMatch(
      /[56]px [56]px 0(px)?/,
    );
  });

  test('common requests deep-link into real sections', async ({ page }) => {
    await page.goto('/legal');
    await waitForAppReady(page);
    const link = page.getByRole('link', { name: /Get a copy of my data/i });
    await expect(link).toBeVisible();
    await link.click();
    await waitForAppReady(page);
    // A dead fragment is worse than no link: the page loads and silently does
    // nothing, so the request the reader came for looks unanswered.
    await expect(page.locator('#your-rights')).toBeVisible();
  });
});

test.describe('Policy pages — automated a11y', () => {
  test.setTimeout(120_000);

  for (const route of ['/legal', '/terms', '/accessibility']) {
    test(`${route} has no serious/critical axe violations`, async ({ page }) => {
      await page.goto(route);
      await waitForAppReady(page);
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
  }
});
