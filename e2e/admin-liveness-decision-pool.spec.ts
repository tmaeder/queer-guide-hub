/**
 * /admin/content/liveness reports the engine's working set, not a superset of it.
 *
 * The page showed four numbers per type and only three came from the same
 * population. "Dead signals (120d)" sat beneath three decision counts and was
 * read as the pool they are drawn from. It was not:
 *
 *     type          card showed    engine's reading    overstated by
 *     event              43,258                   3          14,419x
 *     marketplace         2,690                 835             3.2x
 *     venue                 308                  91             3.4x
 *
 * Two independent causes. It counted signal kinds `run_existence_decision`
 * cannot act on -- 43,253 of the events were `date_lifecycle`, i.e. "this
 * event's date has passed", which on a corpus deliberately holding ~36.5k past
 * Wayback events is not a defect at all -- and it counted HISTORY rather than
 * STATE, so a link broken in August and alive ever since still counted for 120
 * days. The second half is why venue and marketplace were wrong too, where
 * every signal is `http_status` and the first cause does not apply.
 *
 * ASSERT THE INVARIANT, NOT THE REPAIR'S TRANSIENT STATE. The numbers above are
 * a snapshot; the engine re-reads them every night and the review queue refills.
 * So nothing here pins a count. What must hold forever is the RELATIONSHIP: the
 * decision pool is a subset of the any-kind total, the lifecycle inflation is
 * gone from the pool, and every number the page prints comes with its own
 * denominator. A spec that pinned "events reads 3" would go red the next time a
 * ticket URL 404s, for the fix having worked.
 *
 * Admin-only, so it skips when no admin storageState was minted — see
 * auth.setup.ts. It runs for real in the nightly (e2e-nightly.yml passes
 * E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD) against https://queer.guide.
 */
import { test, expect, type Page } from '@playwright/test';

/**
 * Probe for the page's own <h1>. This is the positive control for every
 * assertion below: "the card does not show a 43,258" is trivially satisfied by
 * a login screen, a redirect or a blank page, so without proving we reached the
 * page first the whole file is vacuous in exactly the environment it ships to.
 */
async function openLiveness(page: Page): Promise<boolean> {
  await page.goto('/admin/content/liveness', { waitUntil: 'domcontentloaded' });
  return page
    .getByRole('heading', { name: /Liveness & closure/i })
    .waitFor({ state: 'visible', timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
}

/** Read a labelled number off one of the three type cards. */
async function cardRow(page: Page, type: string, label: string): Promise<number | null> {
  const card = page.locator('div').filter({ has: page.getByText(type, { exact: true }) });
  const row = card.getByText(label, { exact: true }).first();
  if (!(await row.isVisible().catch(() => false))) return null;
  const value = await row.locator('xpath=following-sibling::span[1]').first().textContent();
  const n = Number((value ?? '').replace(/[^0-9]/g, ''));
  return Number.isFinite(n) ? n : null;
}

test.describe('/admin/content/liveness', () => {
  test('every card row is a decision quantity', async ({ page }) => {
    test.skip(!(await openLiveness(page)), 'no admin session — see auth.setup.ts');

    // The three type cards rendered at all. Without this the absence assertions
    // below pass against a page that renders nothing.
    for (const t of ['venue', 'event', 'marketplace']) {
      await expect(page.getByText(t, { exact: true }).first()).toBeVisible();
    }

    // The corrected row exists and the misleading one is gone from the card.
    // `Dead signals (120d)` was the old label; it counted every kind over the
    // whole window. The RPC still returns that quantity under
    // `dead_signals_any_kind` — it is simply not rendered here, because beside
    // three decision counts it reads as a backlog.
    await expect(page.getByText('Reads as dead now').first()).toBeVisible();
    await expect(page.getByText('Archives on next run').first()).toBeVisible();
    await expect(page.getByText('Dead signals (120d)')).toHaveCount(0);

    // `Flagged for review` must still be there: the correction removed a row,
    // and a sweep that removed the wrong one would satisfy the assertion above.
    await expect(page.getByText('Flagged for review').first()).toBeVisible();
  });

  test('the events pool is no longer inflated by past event dates', async ({ page }) => {
    test.skip(!(await openLiveness(page)), 'no admin session — see auth.setup.ts');

    const pool = await cardRow(page, 'event', 'Reads as dead now');
    expect(pool).not.toBeNull();

    // The whole defect in one claim. `events` holds tens of thousands of rows
    // whose date has passed, every one of which carries a dead `date_lifecycle`
    // signal. If any of them reach the decision pool this number runs to five
    // figures. A generous ceiling rather than an exact value, so the spec
    // survives the corpus moving and still catches the regression.
    expect(pool!).toBeLessThan(1_000);
  });

  test('the blind-spot list states that it is a sample', async ({ page }) => {
    test.skip(!(await openLiveness(page)), 'no admin session — see auth.setup.ts');

    const badges = page.locator('text=/^(venue|event|marketplace):/');
    const shown = await badges.count();
    test.skip(shown === 0, 'no blind spots in the corpus right now');

    // The RPC applies its LIMIT per type, so the list is up to 50 per branch
    // against real totals in the thousands. 100 badges with no denominator read
    // as the whole set. Assert the denominator is printed AND that it exceeds
    // what is rendered — a "Showing N of N" would be the defect restated.
    const line = await page
      .getByText(/Showing \d+ of [\d,]+/)
      .first()
      .textContent();
    expect(line).toBeTruthy();
    const m = line!.match(/Showing (\d+) of ([\d,]+)/);
    expect(m).not.toBeNull();
    const [, shownStr, totalStr] = m!;
    expect(Number(totalStr.replace(/,/g, ''))).toBeGreaterThan(Number(shownStr));
  });

  test('the review queue is reachable and self-describing', async ({ page }) => {
    test.skip(!(await openLiveness(page)), 'no admin session — see auth.setup.ts');

    await expect(page.getByText('Review queue').first()).toBeVisible();

    // The queue is legitimately empty most days, so its emptiness is not the
    // assertion — that it SAYS which state it is in, is. An empty queue and a
    // failed fetch must not render identically, which is the failure
    // /admin/inbox shipped for six weeks.
    const empty = page.getByText('Nothing awaiting review');
    const rows = page.getByRole('button', { name: /Archive|Still here/ });
    expect((await empty.count()) + (await rows.count())).toBeGreaterThan(0);
  });
});
