import { test, expect, type BrowserContext } from '@playwright/test';

/**
 * Smoke for the feedback → Claude routine loop UI.
 *
 * Skipped without E2E_ADMIN_COOKIE set, like the rest of admin specs. The full
 * happy path (approve → dispatch → retest → verify → archive) is intentionally
 * not seeded here: writing through admin RPCs against the production project
 * would mutate real data. When a staging project lands, swap the SUPABASE_*
 * env vars so this can run against an isolated DB and seed its own story.
 */

async function loginViaCookie(context: BrowserContext) {
  const cookie = process.env.E2E_ADMIN_COOKIE;
  if (!cookie) return false;
  await context.addCookies([
    {
      name: 'sb-access-token',
      value: cookie,
      domain: new URL(process.env.E2E_BASE_URL || 'https://queer.guide').hostname,
      path: '/',
    },
  ]);
  return true;
}

test.describe('Admin feedback — routine loop UI', () => {
  test.beforeEach(async ({ context }) => {
    const ok = await loginViaCookie(context);
    test.skip(!ok, 'requires E2E_ADMIN_COOKIE env var');
  });

  test('story drawer mounts the routine loop section', async ({ page }) => {
    await page.goto('/admin/feedback');

    // Switch to Stories tab if present
    const storiesTab = page.getByRole('button', { name: /Stories/i }).first();
    if (await storiesTab.count()) {
      await storiesTab.click().catch(() => {
        /* tab may be hidden if no data */
      });
    }

    // Open the first story card if any.
    const firstCard = page.locator('[data-testid="story-card"], [data-story-card]').first();
    if (!(await firstCard.count())) {
      test.skip(true, 'no story present to exercise drawer');
      return;
    }
    await firstCard.click();

    // The routine loop section should render with at least one of the
    // approve/dispatch/run/verify cards visible.
    await expect(page.getByTestId('routine-loop')).toBeVisible({ timeout: 10_000 });

    // One of the action affordances must be present depending on phase.
    const anyAction = page
      .getByTestId('approve-for-claude')
      .or(page.getByTestId('dispatch-routine'))
      .or(page.getByTestId('routine-run-card'))
      .or(page.getByTestId('verify-card'))
      .or(page.getByTestId('archive-story'));
    await expect(anyAction.first()).toBeVisible({ timeout: 5_000 });
  });
});
