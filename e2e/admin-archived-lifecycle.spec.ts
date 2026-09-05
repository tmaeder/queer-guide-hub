/**
 * Archived state in the registry-driven content list.
 *
 * Guards the surface that was shipped declared-but-not-rendered: twelve content
 * types set `lifecycle.archive.label` and nothing displayed it, so the only
 * signal a row was archived was the row action flipping Archive→Restore.
 *
 * READ-ONLY BY CONSTRUCTION. It selects rows to reveal the bulk bar and asserts
 * which buttons appear, but never clicks Archive, Restore or Delete. This suite
 * runs against PRODUCTION on the nightly schedule (e2e-nightly.yml passes
 * E2E_BASE_URL=https://queer.guide), so a mutating assertion here would archive
 * real venues every night.
 *
 * Every "it is hidden" assertion is PAIRED with a positive control, because an
 * absence test passes just as well when the page failed to load, when the
 * selector is wrong, and when the filter hides everything. The archived slice
 * additionally asserts a non-zero row count: "all rows are badged" is vacuously
 * true of zero rows.
 *
 * Admin-only: skipped when no admin storage state was minted (auth.setup.ts).
 */
import { test, expect, type Page } from '@playwright/test';

const BADGE = '[data-testid="archived-badge"]';
const TOGGLE = 'Show live or archived rows';

/**
 * The data rows, via their select checkbox.
 *
 * Scoped to <tbody> ON PURPOSE. The header carries `aria-label="Select all
 * rows"`, which also matches /^Select /, and including it broke this spec twice
 * in one run: the row count came back one HIGHER than the badge count (26 vs
 * 25, which reads like a missing badge), and `.first()` in the bulk test
 * clicked select-all — whose state goes indeterminate rather than checked, so
 * Playwright reported "clicking the checkbox did not change its state".
 */
function rows(page: Page) {
  return page.locator('tbody').getByRole('checkbox', { name: /^Select / });
}

/**
 * Probe the page's own furniture, not the URL — the auth guard bounces an
 * anonymous visitor only after the route has already mounted.
 *
 * It deliberately waits for a ROW, not for the toggle. Gating the skip on the
 * feature under test would mean a broken toggle skips the whole suite instead
 * of failing it, and a skip reads as a pass on the summary line. The row
 * checkbox exists with or without this feature, so it separates "not signed in"
 * from "signed in and the toggle is missing".
 */
async function isAuthed(page: Page): Promise<boolean> {
  await page.goto('/admin/content/venues', { waitUntil: 'domcontentloaded' });
  return rows(page)
    .first()
    .waitFor({ state: 'visible', timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
}

/** Identity of the rows currently rendered, so a refetch can be detected. */
async function rowKey(page: Page): Promise<string> {
  return rows(page).evaluateAll((els) =>
    els.map((e) => e.getAttribute('aria-label') ?? '').join('|'),
  );
}

/**
 * Switch the list to a slice and wait for the rows to ACTUALLY change.
 *
 * Waiting for "some rows exist" is the trap: the outgoing slice's rows are
 * still on screen and satisfy that immediately, so the assertions run against
 * the previous view. That is exactly how the first version of this spec failed
 * — it read the live rows, found no badges, and reported the feature broken.
 *
 * The two slices are disjoint by construction (a row is archived or it is not),
 * so the rendered row set is guaranteed to differ once the refetch lands.
 * Selecting the option already showing is a no-op and must not wait for a
 * change that will never come.
 */
async function selectView(page: Page, option: string) {
  const trigger = page.getByLabel(TOGGLE);
  if ((await trigger.textContent())?.trim() === option) return;

  // The baseline must be a REAL row set. Capturing it while the table is still
  // loading yields '', and then the OUTGOING slice finishing its own fetch
  // satisfies "changed" — so the assertions run against the wrong rows. That is
  // what made the cities test flaky on prod: it failed twice with "no ghost
  // cities returned" and passed on the third attempt, purely on load timing.
  await expect(rows(page).first()).toBeVisible({ timeout: 30_000 });
  const before = await rowKey(page);
  await trigger.click();
  await page.getByRole('option', { name: option, exact: true }).click();
  await expect.poll(() => rowKey(page), { timeout: 30_000 }).not.toBe(before);
  await expect(rows(page).first()).toBeVisible();
}

test.describe('archived state in the content list', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!(await isAuthed(page)), 'requires an admin session (E2E_ADMIN_EMAIL/PASSWORD)');
  });

  test('the toggle appears only for a type that can express an archived state', async ({ page }) => {
    // venues archive via review_status='archived'.
    await expect(page.getByLabel(TOGGLE)).toBeVisible();

    // countries declare a lifecycle with NO archive block — their table has no
    // column that can express one, and archive_entity refuses the type. Without
    // this control the assertion above would also pass on a toggle rendered
    // unconditionally, which is the bug it exists to prevent.
    await page.goto('/admin/content/countries', { waitUntil: 'domcontentloaded' });
    await expect(rows(page).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByLabel(TOGGLE)).toHaveCount(0);
  });

  test('every row in the archived slice is badged, and none in the live slice is', async ({
    page,
  }) => {
    await selectView(page, 'Archived');
    const archivedRows = await rows(page).count();
    // Non-vacuity: prod carries ~1.6k archived venues. Zero rows here would make
    // the badge assertion below trivially true.
    expect(archivedRows, 'archived slice returned no rows — the assertion below would be vacuous')
      .toBeGreaterThan(0);
    await expect(page.locator(BADGE)).toHaveCount(archivedRows);

    await selectView(page, 'Live only');
    expect(await rows(page).count()).toBeGreaterThan(0);
    await expect(page.locator(BADGE)).toHaveCount(0);
  });

  test('the badge uses the type-specific word, not a flattened "Archived"', async ({ page }) => {
    // A ghost city is not an archived place — it is not a place. Collapsing the
    // per-type vocabulary would misdescribe the row.
    await page.goto('/admin/content/cities', { waitUntil: 'domcontentloaded' });
    await expect(page.getByLabel(TOGGLE)).toBeVisible({ timeout: 20_000 });
    await selectView(page, 'Not a place');

    const badges = page.locator(BADGE);
    const n = await badges.count();
    expect(n, 'no ghost cities returned — nothing to assert the label on').toBeGreaterThan(0);
    await expect(badges.first()).toHaveText(/not a place/i);
  });

  test('bulk actions follow the visible slice, and never offer both', async ({ page }) => {
    // Read-only: selecting a row reveals the bar; nothing is clicked past that.
    await selectView(page, 'Live only');
    await rows(page).first().check();
    await expect(page.getByRole('button', { name: 'Archive', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Restore', exact: true })).toHaveCount(0);

    await selectView(page, 'Archived');
    await rows(page).first().check();
    await expect(page.getByRole('button', { name: 'Restore', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Archive', exact: true })).toHaveCount(0);
  });
});
