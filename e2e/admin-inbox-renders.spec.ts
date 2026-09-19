/**
 * The inbox renders its queue — the guard that did not exist when it broke.
 *
 * On 2026-09-14 `/admin/inbox` served nothing but
 * `Failed to load triage queue: UNION types text and editorial_entity_type
 * cannot be matched`, hiding 7,525 items across every queue. One of the
 * seventeen `triage_src_*` views emitted enum columns where the other sixteen
 * emitted `text`, and a UNION type mismatch is a PLAN-time failure — so the
 * *empty* `triage_src_editorial` (0 pending rows) killed the whole union. It
 * survived from `20260801050000` because it only fails UNFILTERED: every
 * `?queue=<one>` deep link builds a one-view union and worked fine, which is
 * also why every deep-linked screenshot looked healthy.
 *
 * Nothing caught it. `e2e/a11y-admin.spec.ts` visits this route, but it asserts
 * axe violations and an error banner has none — so it passed, green, for weeks,
 * on a page that rendered zero rows. That is the gap this file closes: the a11y
 * sweep measures how the page is built, and nobody measured whether it had
 * anything in it.
 *
 * `triage_queue_signals()` (scripts/check-pipeline-health.mjs) guards the same
 * invariant one layer down by EXECUTING the union nightly as service_role. This
 * spec is the layer above it: the union can succeed while the page still fails
 * to show it.
 *
 * Admin-only, so it skips when no admin storageState was minted — see
 * auth.setup.ts. It runs for real in the nightly (e2e-nightly.yml passes
 * E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD) against https://queer.guide.
 */
import { test, expect, type Page } from '@playwright/test';

const ERROR_BANNER = /Failed to load triage queue/i;

/**
 * Probe for the page's own <h1>, not the URL — the auth guard lets an anonymous
 * visitor linger on /admin/inbox for a moment before bouncing, so a URL check
 * reports authenticated when it is not.
 *
 * This is also the positive control for every assertion below. "No error
 * banner" is trivially satisfied by a login screen, a redirect, or a blank
 * page; without proving we reached the inbox first, the whole file would be
 * vacuous in exactly the environments where it matters most.
 */
async function openInbox(page: Page, query = ''): Promise<boolean> {
  await page.goto(`/admin/inbox${query}`, { waitUntil: 'domcontentloaded' });
  return page
    .getByRole('heading', { name: 'Inbox', exact: true })
    .waitFor({ state: 'visible', timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
}

/** Rows are addressed by the overlay button's accessible name, which is part of
 *  the row's a11y contract (one <button> per row, labelled `Open <title>`) and
 *  not a class name that a restyle would move. */
const rows = (page: Page) => page.locator('button[aria-label^="Open "]');

/** The pager prints `1–25 of 4356`. Absent when there is only one page. */
async function totalFromPager(page: Page): Promise<number | null> {
  const text = await page
    .getByText(/\d+–\d+ of \d+/)
    .first()
    .textContent()
    .catch(() => null);
  const m = text?.match(/of\s+(\d+)/);
  return m ? Number(m[1]) : null;
}

test.describe('/admin/inbox', () => {
  test('renders the unfiltered queue', async ({ page }) => {
    test.skip(!(await openInbox(page)), 'no admin session — see auth.setup.ts');

    // The exact failure mode, asserted by its own message.
    await expect(page.getByText(ERROR_BANNER)).toHaveCount(0);

    /*
     * An empty queue and a broken union are DIFFERENT DOM states: the first
     * renders "No items to review.", the second renders the banner above. So
     * this asserts content, not merely the absence of an error.
     *
     * If the platform ever genuinely drains this queue to zero, this should be
     * changed to assert the empty state deliberately — not loosened to "the
     * page did not crash", which is the assertion that let the original bug
     * live for six weeks.
     */
    await expect(page.getByText('No items to review.')).toHaveCount(0);
    await expect(rows(page).first()).toBeVisible();
  });

  test('the unfiltered queue is a union, not one view', async ({ page }) => {
    /*
     * The bug was one view poisoning a union of seventeen, and it was invisible
     * from any single queue. A regression that silently narrowed the union to
     * one view would still render rows and pass the test above — so compare the
     * unfiltered total against one queue's.
     *
     * Strictly greater is a structural property while two queues hold rows (ten
     * do today, 838 of 4,356 in staging alone), not a timing one. If this ever
     * fails, the queue composition has genuinely collapsed and a human should
     * look rather than the bound being relaxed.
     */
    test.skip(!(await openInbox(page)), 'no admin session — see auth.setup.ts');
    const all = await totalFromPager(page);
    test.skip(all === null, 'single page of results — no pager to read a total from');

    await openInbox(page, '?queue=staging');
    await expect(page.getByText(ERROR_BANNER)).toHaveCount(0);
    const staging = await totalFromPager(page);

    expect(staging, 'staging alone should not account for the whole inbox').not.toBeNull();
    expect(all!).toBeGreaterThan(staging!);
  });
});
