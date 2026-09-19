import { test, expect, type Page } from '@playwright/test';
import { REDUCED_MOTION } from './support/reducedMotion';

/**
 * Homepage news topic rails (#3818) — asserted against the configured baseURL,
 * which defaults to PRODUCTION.
 *
 * Why this exists as its own spec rather than more cases in home-magazine.spec.ts:
 * that file deliberately asserts section CHROME and ORDER and stays resilient to
 * rotating rows. This one asserts a CONTROL that changes what the reader sees, so
 * it has to interact, and an interaction spec that fails leaves a different
 * diagnosis than a layout one.
 *
 * THE FAILURE THIS GUARDS IS AN EMPTY RAIL, NOT A MISSING ONE. A topic rail with
 * no content renders identically to a broken filter, so "the tablist exists" is
 * not sufficient — every assertion below requires the selected rail to still be
 * showing article links. Measured on prod before this shipped:
 * rights-legal 32, community 21, culture-arts 16, podcasts 6, of an 80-item pool.
 *
 * Podcasts is deliberately NOT required to be non-empty. It filters on
 * `media_type`, a different KIND of thing from a category, and its pool is the
 * thinnest of the five (6 of 80) — pinning it to >0 would make this spec fail on
 * a quiet podcast week, which is the cry-wolf shape this repo has removed from
 * gates before. Its rail is asserted to EXIST and to be selectable.
 */
test.use(REDUCED_MOTION);

const DESKTOP = { width: 1280, height: 900 };

async function dismissCookieBanner(page: Page) {
  const banner = page.getByRole('region', { name: /cookie settings/i });
  if (!(await banner.isVisible().catch(() => false))) return;
  await banner
    .getByRole('button', { name: /necessary only|accept all/i })
    .first()
    .click();
  await expect(banner)
    .toBeHidden()
    .catch(() => {});
}

/** The news block is below the fold behind DeferredSection — scroll it in. */
async function gotoNews(page: Page) {
  await page.setViewportSize(DESKTOP);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.locator('main h1').waitFor({ state: 'visible', timeout: 30_000 });
  await dismissCookieBanner(page);
  const tablist = page.getByRole('tablist', { name: /news topics/i });
  for (let i = 0; i < 10 && !(await tablist.isVisible().catch(() => false)); i++) {
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(600);
  }
  await expect(tablist).toBeVisible({ timeout: 20_000 });
  return tablist;
}

/** Article links inside the news section, which is what "the rail has content" means. */
function newsLinks(page: Page) {
  return page.locator('main a[href*="/news/"]');
}

test.describe('homepage news topics', () => {
  test.setTimeout(120_000);

  test('the topic rail mounts with every topic and a default selection', async ({ page }) => {
    const tablist = await gotoNews(page);
    const tabs = tablist.getByRole('tab');

    // Five topics: All + the four measured rails.
    await expect(tabs).toHaveCount(5);
    for (const name of [/^all$/i, /rights/i, /community/i, /culture/i, /podcast/i]) {
      await expect(tablist.getByRole('tab', { name })).toBeVisible();
    }

    // Exactly one selected — a tablist with none, or several, is a broken control
    // that still renders and still passes a bare "is visible" check.
    await expect(tablist.locator('[role="tab"][aria-selected="true"]')).toHaveCount(1);

    // And the default view is not empty.
    await expect(newsLinks(page).first()).toBeVisible({ timeout: 20_000 });
  });

  test('selecting a topic moves the selection AND keeps articles on screen', async ({ page }) => {
    const tablist = await gotoNews(page);
    const rights = tablist.getByRole('tab', { name: /rights/i });

    await rights.click();
    await expect(rights).toHaveAttribute('aria-selected', 'true');
    await expect(tablist.locator('[role="tab"][aria-selected="true"]')).toHaveCount(1);

    // The point of the feature. An empty rail is the failure mode, and it is
    // indistinguishable from a broken filter without this assertion.
    await expect(newsLinks(page).first()).toBeVisible({ timeout: 20_000 });
    expect(await newsLinks(page).count()).toBeGreaterThan(0);
  });

  test('community and culture rails both carry content on prod', async ({ page }) => {
    const tablist = await gotoNews(page);
    for (const name of [/community/i, /culture/i]) {
      const tab = tablist.getByRole('tab', { name });
      await tab.click();
      await expect(tab).toHaveAttribute('aria-selected', 'true');
      await expect(newsLinks(page).first()).toBeVisible({ timeout: 20_000 });
      expect(
        await newsLinks(page).count(),
        `rail ${name} rendered no article links`,
      ).toBeGreaterThan(0);
    }
  });

  test('podcasts rail is selectable (content not required — thinnest pool)', async ({ page }) => {
    const tablist = await gotoNews(page);
    const podcasts = tablist.getByRole('tab', { name: /podcast/i });
    await podcasts.click();
    await expect(podcasts).toHaveAttribute('aria-selected', 'true');
    // Deliberately no content assertion. See the header.
  });

  test('signed-out readers are NOT offered the follow control', async ({ page }) => {
    // Asserts the component's STATED contract, not an absence I happened to observe:
    // NewsMagazine returns null for the follow popover when there is no user
    // ("signed-out readers have nothing to follow with; the chip row above is their
    // control"), the same contract as FollowedTagsRail.
    //
    // The first draft of this test asserted the control WAS visible, and it failed on
    // prod against correct code because Playwright runs anonymous. Written this way it
    // earns its place twice: it fails if the control is ever exposed to a signed-out
    // reader — a control that cannot work — and it records why the signed-in path is
    // not covered here.
    const tablist = await gotoNews(page);
    await expect(page.getByRole('button', { name: /follow topics|following \d/i })).toHaveCount(0);
    // The topic chips ARE the signed-out reader's control, and they work.
    await expect(tablist.getByRole('tab')).toHaveCount(5);
  });

  test('no PostgREST 4xx while the news block mounts and topics are switched', async ({ page }) => {
    const failures: string[] = [];
    page.on('response', (r) => {
      const u = r.url();
      if (u.includes('/rest/v1/') && r.status() >= 400 && r.status() < 500) {
        failures.push(`${r.status()} ${u.split('?')[0]}`);
      }
    });

    const tablist = await gotoNews(page);
    for (const name of [/rights/i, /community/i, /culture/i, /podcast/i, /^all$/i]) {
      await tablist.getByRole('tab', { name }).click();
      await page.waitForTimeout(400);
    }

    expect(failures, `PostgREST 4xx responses:\n${failures.join('\n')}`).toEqual([]);
  });
});
