import { test, expect, type Page } from '@playwright/test';
import {
  authenticated,
  ADMIN_SESSION_REQUIRED,
  gotoAdmin,
  expectAdminHeading,
} from './support/adminAuth';

/**
 * E2E smoke tests for /admin/pipelines.
 * Unauthenticated tests verify the app shell loads without crashes.
 * Authenticated tests cover tab navigation, builder interactions, and the
 * audit / integrations / monitor features.
 *
 * Gating moved off `E2E_ADMIN_COOKIE` (which nothing has ever set, so all eight
 * authenticated tests had never run anywhere) onto the storageState session the
 * config already attaches. See e2e/support/adminAuth.ts.
 */

const HEADING = 'Pipelines';

/** The six real top-level tabs (`TABS` in UnifiedDataOps.tsx). */
const TOP_LEVEL_TABS = ['Overview', 'Builder', 'Monitoring', 'Sources', 'News', 'Audit'];

async function waitForAppReady(page: Page) {
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {
    /* ignore */
  });
}

/** The builder's own toolbar — the marker that the lazy chunk has mounted. */
const saveButton = (page: Page) => page.getByRole('button', { name: /^Save$/ });

/**
 * The Builder opens a modal first-run tour ("Welcome to the Pipeline Builder")
 * gated on localStorage `pipeline-builder-tour-seen-v1`. Every Playwright
 * context is a fresh profile, so it fires on EVERY run — and being a modal it
 * (a) traps focus, so ⌘K and ? never reach the builder, and (b) makes Radix
 * mark the rest of the document `aria-hidden`, so even the page's own
 * <h1> is unreachable. One cause, three failures, none of which looks related
 * from its error text.
 *
 * The first version of this helper used a bare `tour.isVisible()`, which is a
 * point-in-time check with NO auto-wait — it ran before the lazy builder chunk
 * had mounted the tour, found nothing, and skipped. So wait for the tour OR
 * the toolbar first: once either is visible the page has settled and the
 * branch is decided on real state rather than on a race.
 */
async function dismissBuilderTour(page: Page) {
  const tour = page.getByRole('dialog', { name: /Welcome to the Pipeline Builder/i });
  await expect(
    tour.or(saveButton(page)).first(),
    'the builder rendered neither its first-run tour nor its toolbar',
  ).toBeVisible({ timeout: 30_000 });
  if (await tour.isVisible()) {
    await page.getByRole('button', { name: /Skip tour/i }).click();
    await expect(tour).toBeHidden({ timeout: 10_000 });
  }
}

/**
 * Navigate to the builder, clear the tour, THEN assert the heading — in that
 * order, because the modal hides the heading from the a11y tree.
 */
async function gotoBuilder(page: Page, url = '/admin/pipelines?tab=builder') {
  await page.goto(url);
  await dismissBuilderTour(page);
  await expectAdminHeading(page, url, HEADING);
  await expect(saveButton(page)).toBeVisible({ timeout: 15_000 });
}

test.describe('Admin pipelines — unauthenticated', () => {
  test('reaches /admin/pipelines without runtime crash', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    const response = await page.goto('/admin/pipelines', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBeLessThan(500);

    await waitForAppReady(page);

    const crashErrors = errors.filter((e) =>
      /is not defined|ReferenceError|TypeError.*undefined/i.test(e),
    );
    expect(crashErrors, `runtime errors: ${crashErrors.join('; ')}`).toEqual([]);
  });
});

test.describe('Admin pipelines — authenticated', () => {
  test.skip(!authenticated, ADMIN_SESSION_REQUIRED);

  test('Overview tab renders with summary cards and table', async ({ page }) => {
    await gotoAdmin(page, '/admin/pipelines', HEADING);
    // role=tab, not role=button: UnifiedDataOps renders `<button role="tab">`,
    // and an explicit ARIA role wins, so getByRole('button') matched nothing.
    await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Active definitions/i)).toBeVisible();
    await expect(page.getByText(/Runs in last 24h/i)).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /Kind/i })).toBeVisible();
  });

  test('tab navigation reaches each of the six tabs without error', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await gotoAdmin(page, '/admin/pipelines', HEADING);

    // The old list named twelve tabs. Eight of them (Monitor, Review, DLQ,
    // Errors, Alerts, Coverage, Health, Integrations) are no longer top-level:
    // the console was consolidated to six, and those live on as SUB-SECTIONS
    // reached through TAB_ALIAS deep links — which is why the ?tab=monitor,
    // ?tab=audit and ?tab=integrations tests below kept working. Asserting them
    // as top-level tabs could only ever fail.
    await expect(page.getByRole('tablist', { name: /Data ops sections/i })).toBeVisible();
    for (const label of TOP_LEVEL_TABS) {
      const tab = page.getByRole('tab', { name: label });
      await expect(tab, `top-level tab "${label}" is missing`).toBeVisible({ timeout: 15_000 });
      await tab.click({ timeout: 10_000 });
      await expect(tab).toHaveAttribute('aria-selected', 'true');
      if (label === 'Builder') await dismissBuilderTour(page);
    }

    const crashErrors = errors.filter((e) => /is not defined|ReferenceError/i.test(e));
    expect(crashErrors, `tab navigation errors: ${crashErrors.join('; ')}`).toEqual([]);
  });

  test('Builder toolbar shows Save, Run, Dry Run buttons', async ({ page }) => {
    await gotoBuilder(page);
    await expect(page.getByRole('button', { name: /^Run$/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Dry Run$/ })).toBeVisible();
  });

  test('the quick-add palette opens from the builder toolbar', async ({ page }) => {
    // gotoBuilder waits for the toolbar, so nothing here can race the lazy
    // chunk. This covers the pointer route; the test below covers ⌘K, which
    // reaches the builder's quick-add since the capture-phase binding landed.
    // (Until then this comment said the shortcut was shadowed and pointed at
    // that test for proof — it now asserts the opposite, and two comments
    // disagreeing about one behaviour is worse than neither.)
    await gotoBuilder(page);
    await page.getByRole('button', { name: 'Quick-add node' }).click();
    await expect(page.getByPlaceholder(/Type to search nodes/i)).toBeVisible({ timeout: 10_000 });
  });

  test('⌘K in the builder opens quick-add, and the admin palette stays shut', async ({ page }) => {
    // Re-pointed deliberately, which is exactly what the previous version of
    // this test asked for. It pinned the DEFECT — AdminCommandPaletteHost and
    // PipelineBuilder both bound `mod+k` on `window` in the bubble phase with
    // neither stopping propagation, so both fired and the shell's palette,
    // mounting higher, rendered over the builder's — and said in as many words:
    // "whoever fixes the binding sees this test go red and updates it
    // deliberately". The builder now registers in the CAPTURE phase and calls
    // stopPropagation() on ⌘K, so the builder's quick-add wins.
    //
    // BOTH directions are asserted. "quick-add is visible" alone still passes
    // when both palettes open, which is the original defect — the whole point
    // is that the admin one no longer opens here.
    await gotoBuilder(page);
    const isMac = await page.evaluate(() => navigator.platform.includes('Mac'));
    await page.keyboard.press(isMac ? 'Meta+k' : 'Control+k');

    await expect(
      page.getByPlaceholder(/Type to search nodes/i),
      'the builder quick-add palette did not open on ⌘K — the capture-phase binding may have regressed',
    ).toBeVisible({ timeout: 10_000 });

    const adminPalette = page.getByRole('dialog').filter({ hasText: /New Personality/i });
    await expect(
      adminPalette,
      'the admin command palette opened over the builder again — stopPropagation on ⌘K regressed',
    ).toBeHidden();
  });

  test('Audit tab shows event timeline', async ({ page }) => {
    await gotoAdmin(page, '/admin/pipelines?tab=audit', HEADING);
    await expect(page.getByText(/Audit Trail/i)).toBeVisible({ timeout: 10_000 });
    // Filter chips
    await expect(page.getByRole('button', { name: /^save$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^run$/i })).toBeVisible();
  });

  test('Integrations tab allows adding a webhook', async ({ page }) => {
    await gotoAdmin(page, '/admin/pipelines?tab=integrations', HEADING);
    await expect(page.getByText(/Alert Webhook Integrations/i)).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /Add integration/i }).click();
    await expect(page.getByText(/New webhook integration/i)).toBeVisible();
    await expect(page.getByPlaceholder(/#data-ops alerts/i)).toBeVisible();
    // Don't actually submit; just verify form renders
    await page.keyboard.press('Escape');
  });

  test('Monitor tab shows charts', async ({ page }) => {
    await gotoAdmin(page, '/admin/pipelines?tab=monitor', HEADING);
    await expect(page.getByText(/Run duration distribution/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Throughput \(last 24h\)/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Compare runs/i })).toBeVisible();
  });

  test('Help cheat sheet opens with ? key', async ({ page }) => {
    await gotoBuilder(page);
    await page.keyboard.press('Shift+Slash');
    await expect(page.getByRole('dialog', { name: /Keyboard Shortcuts/i })).toBeVisible({
      timeout: 5_000,
    });
  });
});
