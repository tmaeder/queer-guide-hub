import { test, expect, type Page } from '@playwright/test';
import { resolveAnonKey, SUPABASE_REST_URL } from './support/anonKey';

/**
 * The header Inbox badge updates live, with no reload.
 *
 * The signed-in test user inserts one `system` notification for themself
 * through the REST API while the page stays open. The DB trigger sends
 * `inbox_changed` on the private `inbox:<user_id>` channel, the header
 * refetches the counts, and the badge must go up by one. Deleting the row
 * must bring it back down the same way.
 *
 * The write goes through `page.request`, not a second page: nothing in the
 * open page gains or loses focus, so a react-query focus refetch cannot
 * produce the change. Nothing in the app polls the counts, so only the
 * realtime path can move the badge.
 *
 * `type = 'system'` fires no email or push trigger (only the inbox ping), and
 * the row is deleted in `finally`.
 */

const SIGNED_IN = Boolean(process.env.E2E_ADMIN_EMAIL || process.env.E2E_STORAGE_STATE);
const AUTH_KEY = `sb-${new URL(SUPABASE_REST_URL).hostname.split('.')[0]}-auth-token`;

async function session(page: Page) {
  const raw = await page.evaluate((key) => localStorage.getItem(key), AUTH_KEY);
  expect(raw, `no Supabase session in localStorage (${AUTH_KEY})`).toBeTruthy();
  const parsed = JSON.parse(raw!) as { access_token: string; user: { id: string } };
  return { token: parsed.access_token, userId: parsed.user.id };
}

/** Unread total from the Inbox button's accessible name ("Inbox, 3 unread" → 3). */
async function badgeCount(page: Page): Promise<number> {
  const label = await page
    .getByRole('button', { name: /^inbox/i })
    .first()
    .getAttribute('aria-label');
  const match = label?.match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}

test.describe('header Inbox badge — live updates', () => {
  test.skip(!SIGNED_IN, 'Requires a signed-in session (E2E_ADMIN_EMAIL / E2E_STORAGE_STATE).');

  test('a new alert raises the badge and removing it lowers it, without a reload', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const inbox = page.getByRole('button', { name: /^inbox/i }).first();
    await expect(inbox).toBeVisible({ timeout: 20_000 });

    // Wait until the private channel has joined, or the insert could land
    // before anyone is listening.
    let joined = false;
    page.on('websocket', (ws) =>
      ws.on('framereceived', ({ payload }) => {
        const text = typeof payload === 'string' ? payload : payload.toString();
        if (text.includes('realtime:inbox:') && text.includes('"status":"ok"')) joined = true;
      }),
    );
    // The socket may have joined before the listener attached; reload once so
    // the join frame is observed.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect
      .poll(() => joined, { timeout: 20_000, message: 'inbox:<user_id> channel never joined' })
      .toBe(true);
    // Let the initial count settle (one fetch, no polling).
    await page.waitForTimeout(3_000);
    const before = await badgeCount(page);

    const { token, userId } = await session(page);
    const apikey = await resolveAnonKey(page.request);
    expect(apikey, 'anon key not resolvable').toBeTruthy();
    const headers = {
      apikey: apikey!,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    };

    let id: string | null = null;
    // Navigations would remount everything and refetch; fail if any happen.
    let navigations = 0;
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) navigations += 1;
    });

    try {
      const res = await page.request.post(`${SUPABASE_REST_URL}/rest/v1/notifications`, {
        headers,
        data: {
          user_id: userId,
          type: 'system',
          title: 'e2e live badge check',
          content: 'Created and deleted by e2e/inbox-live-badge.spec.ts',
          read: false,
        },
      });
      expect(res.status(), await res.text()).toBe(201);
      id = ((await res.json()) as { id: string }[])[0].id;

      await expect.poll(() => badgeCount(page), { timeout: 15_000 }).toBe(before + 1);
    } finally {
      if (id) {
        const del = await page.request.delete(
          `${SUPABASE_REST_URL}/rest/v1/notifications?id=eq.${id}`,
          { headers },
        );
        expect(del.ok(), `cleanup failed: ${del.status()}`).toBe(true);
      }
    }

    await expect.poll(() => badgeCount(page), { timeout: 15_000 }).toBe(before);
    expect(navigations, 'the page navigated, so the change was not live').toBe(0);
  });
});
