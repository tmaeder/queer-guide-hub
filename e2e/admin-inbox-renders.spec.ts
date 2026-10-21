import { test, expect } from '@playwright/test';
const authenticated = Boolean(
  process.env.E2E_STORAGE_STATE || (process.env.E2E_ADMIN_EMAIL && process.env.E2E_ADMIN_PASSWORD),
);
test.describe('unified admin review queue', () => {
  test.skip(!authenticated, 'Requires the configured admin session');
  // The landing page serves independent, decision-ready cases. Raw source tasks
  // and detector findings remain reachable and retain their original partition.
  //
  // THIS REQUEST IS NO LONGER THE UNION CANARY. That changed in 99991792224392. The claim this
  // replaces -- that the union is built before the scope filter, so every registered view executes
  // on every landing request and a plan-time type mismatch therefore surfaces right here -- was
  // true until then, and one such mismatch took this page down for six weeks. An unfiltered page-1
  // request is now served from admin_review_queue_top without touching the union at all (measured
  // 3,009ms -> 95ms for scope=all), so a mismatch would NOT red this test.
  //
  // The canary moved to refresh_admin_review_queue_top, which builds the SAME full-projection
  // union on a */2 cron: if it stops planning, the refresh fails, the snapshot goes stale, and
  // check-pipeline-health's admin_review_top_signals section fails. Do NOT restore the old claim
  // on the grounds that this test still passes -- it passes either way, which is precisely why
  // the protection had to be relocated rather than left implied. The lever for putting the union
  // back into a user request is admin_review_queue_top_depth(), not this spec.
  test('the landing queue renders the full registered source contract', async ({ page }) => {
    const responsePromise = page.waitForResponse(
      (r) =>
        r.url().includes('/rpc/get_admin_review_worklist') &&
        r.request().postDataJSON()?.p_scope === 'ready',
    );
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Review queue', exact: true })).toBeVisible();
    const response = await responsePromise;
    expect(response.ok()).toBe(true);
    const data = await response.json();
    expect(data.sources.length).toBeGreaterThan(17);
    expect(data.sources.reduce((sum: number, s: { count: number }) => sum + s.count, 0)).toBe(
      data.all_total,
    );
    // The two populations must partition the queue, or rows are counted twice or not at all.
    expect(data.decisions_total + data.findings_total).toBe(data.all_total);
    expect(data.total).toBe(data.ready_total);
    expect(data.ready_total + data.research_total + data.blocked_total).toBe(data.case_total);
    expect(data.worklist_available).toBe(true);
    // Non-degenerate in both directions: 0 findings means the registry matched nothing, 0
    // decisions means the classification swallowed the queue. Either passes a presence-only check.
    expect(data.findings_total).toBeGreaterThan(0);
    expect(data.decisions_total).toBeGreaterThan(0);
    await expect(page.getByText('The review queue could not be loaded')).toHaveCount(0);
    if (data.total > 0) {
      await expect(
        page
          .getByRole('region', { name: 'Review worklist' })
          .locator('button[aria-label^="Open "]')
          .first(),
      ).toBeVisible();
      await expect(page.getByRole('navigation', { name: 'Review queue pages' })).toBeInViewport();
      await expect(page.getByRole('button', { name: 'Skip', exact: true })).toBeInViewport();
      expect(
        await page.evaluate(() => document.documentElement.scrollHeight - innerHeight),
        'The queue scrolls its panes instead of stretching the page below the decision controls',
      ).toBeLessThanOrEqual(1);
    } else await expect(page.getByText('No decisions ready')).toBeVisible();
  });
  test('the all-inclusive scope still reaches every row, so nothing is hidden', async ({
    page,
  }) => {
    // The original unfiltered contract, preserved verbatim: findings are reclassified, never
    // removed, so one click must still return the whole union.
    // Finish the initial load before issuing another expensive scope query.
    const initialResponse = page.waitForResponse(
      (r) =>
        r.url().includes('/rpc/get_admin_review_worklist') &&
        r.request().postDataJSON()?.p_scope === 'ready',
    );
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Review queue', exact: true })).toBeVisible();
    const initial = await initialResponse;
    expect(
      initial.ok(),
      `Initial queue HTTP ${initial.status()}: ${initial.ok() ? '' : await initial.text()}`,
    ).toBe(true);
    const rawResponsePromise = page.waitForResponse(
      (r) =>
        r.url().includes('/rpc/get_admin_review_queue') &&
        r.request().postDataJSON()?.p_scope === 'decisions',
    );
    await page.getByRole('combobox', { name: 'Source task scope' }).selectOption('decisions');
    const rawResponse = await rawResponsePromise;
    expect(rawResponse.ok()).toBe(true);
    {
      const data = await rawResponse.json();
      expect(data.total).toBe(data.decisions_total);
    }
    const responsePromise = page.waitForResponse(
      (r) =>
        r.url().includes('/rpc/get_admin_review_queue') &&
        r.request().postDataJSON()?.p_scope === 'all',
    );
    await page.getByRole('combobox', { name: 'Source task scope' }).selectOption('all');
    const response = await responsePromise;
    expect(
      response.ok(),
      `All scope HTTP ${response.status()}: ${response.ok() ? '' : await response.text()}`,
    ).toBe(true);
    const data = await response.json();
    expect(data.total).toBe(data.all_total);
    expect(data.total).toBeGreaterThan(data.decisions_total);
    await expect(page.getByText('The review queue could not be loaded')).toHaveCount(0);
  });
  test('overdue is a row predicate with matching counts', async ({ page }) => {
    const initialResponse = page.waitForResponse(
      (r) =>
        r.url().includes('/rpc/get_admin_review_worklist') &&
        r.request().postDataJSON()?.p_scope === 'ready',
    );
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Review queue', exact: true })).toBeVisible();
    const initial = await initialResponse;
    expect(
      initial.ok(),
      `Initial queue HTTP ${initial.status()}: ${initial.ok() ? '' : await initial.text()}`,
    ).toBe(true);
    const responsePromise = page.waitForResponse(
      (r) =>
        r.url().includes('/rpc/get_admin_review_queue') &&
        r.request().postDataJSON()?.p_scope === 'overdue',
    );
    await page.getByRole('combobox', { name: 'Source task scope' }).selectOption('overdue');
    const response = await responsePromise;
    expect(
      response.ok(),
      `Overdue scope HTTP ${response.status()}: ${response.ok() ? '' : await response.text()}`,
    ).toBe(true);
    const data = await response.json();
    expect(data.total).toBe(data.overdue_total);
    expect(data.items.every((x: { overdue: boolean }) => x.overdue)).toBe(true);
  });
  test('legacy governance URLs resolve to the same queue', async ({ page }) => {
    for (const url of [
      '/admin/inbox',
      '/admin/governance?mode=engines',
      '/admin/governance?mode=tags',
    ]) {
      await page.goto(url);
      await expect(page.getByRole('heading', { name: 'Review queue', exact: true })).toBeVisible();
      await expect(page).toHaveURL(/\/admin(?:\?|$)/);
      await expect(page.getByRole('navigation', { name: 'Governance mode' })).toHaveCount(0);
    }
  });
});
