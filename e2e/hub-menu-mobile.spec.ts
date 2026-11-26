import { test, expect, type Page } from '@playwright/test';
import { resolveAnonKey, SUPABASE_REST_URL } from './support/anonKey';

/**
 * Phones: the inbox lives in the dock's Hub sheet (#5764).
 *
 * - The header carries no Inbox / Hub button below md.
 * - The dock's Hub tab carries the inbox's unread total, live: inserting a
 *   `system` notification raises it and deleting it lowers it, with no reload.
 * - Tapping Hub opens one sheet with the Messages / Alerts tabs and the Hub
 *   sections, and "Open inbox" leaves for /messages.
 *
 * Same write path as inbox-live-badge.spec.ts; the row is deleted in `finally`.
 */

const SIGNED_IN = Boolean(process.env.E2E_ADMIN_EMAIL || process.env.E2E_STORAGE_STATE);
const AUTH_KEY = `sb-${new URL(SUPABASE_REST_URL).hostname.split('.')[0]}-auth-token`;

test.use({ viewport: { width: 390, height: 844 } });

async function declineConsent(page: Page) {
  // The banner slides in after load and sits over the dock, so wait for it
  // rather than checking once (checking once lost the race on prod).
  const necessary = page.getByRole('button', { name: /necessary only/i });
  const shown = await necessary
    .waitFor({ state: 'visible', timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  if (shown) {
    await necessary.click().catch(() => {});
    await necessary.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
  }
}

const dock = (page: Page) => page.getByRole('navigation', { name: 'Navigation' });
const hubTab = (page: Page) => dock(page).getByRole('link', { name: /^hub\b/i });

/** Unread total from the dock Hub tab's name ("Hub, 3 unread Hub" → 3). */
async function badgeCount(page: Page): Promise<number> {
  const name = (await hubTab(page).textContent()) ?? '';
  const match = name.match(/(\d+)\s*unread/i);
  return match ? Number(match[1]) : 0;
}

test.describe('Hub menu on phones', () => {
  test.skip(!SIGNED_IN, 'Requires a signed-in session (E2E_ADMIN_EMAIL / E2E_STORAGE_STATE).');

  test('no header inbox; the dock Hub sheet holds the inbox and the Hub sections', async ({
    page,
  }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await declineConsent(page);
    await expect(hubTab(page)).toBeVisible({ timeout: 20_000 });

    // Positive control: the header rendered, so the absence below is real.
    const header = page.locator('header').first();
    await expect(header).toBeVisible();
    await expect(header.getByRole('button', { name: /^(hub|inbox)\b/i })).toHaveCount(0);

    await hubTab(page).click();
    const sheet = page.getByRole('dialog', { name: /^hub$/i });
    await expect(sheet.getByRole('tab', { name: /^messages\b/i })).toBeVisible();
    // Every tab fits without the menu scrolling: each shows a short list,
    // never a scroll area.
    for (const name of ['Messages', 'Alerts', 'Plans', 'Saved', 'Friends', 'Feed', 'Contribute']) {
      await sheet.getByRole('tab', { name: new RegExp(`^${name}\\b`, 'i') }).click();
      await expect(sheet.getByText('Loading…')).toHaveCount(0, { timeout: 15_000 });
      await expect
        .poll(() => sheet.evaluate((el) => el.scrollHeight - el.clientHeight), {
          message: `the Hub menu scrolls on the ${name} tab`,
        })
        .toBeLessThanOrEqual(1);
    }
    await sheet.getByRole('tab', { name: /^saved\b/i }).click();
    await expect(sheet.getByRole('link', { name: /^saved\b/i })).toHaveAttribute(
      'href',
      /\/hub\/saved$/,
    );
    await sheet.getByRole('tab', { name: /^alerts\b/i }).click();
    await expect(sheet.getByRole('link', { name: /all notifications/i })).toHaveAttribute(
      'href',
      /\/messages\?filter=alerts$/,
    );
    await sheet.getByRole('tab', { name: /^messages\b/i }).click();
    await sheet.getByRole('link', { name: /open inbox/i }).click();
    await expect(page).toHaveURL(/\/messages$/);
    await expect(sheet).toBeHidden();
  });

  test('Contribute is a Hub tab, not a dock button; its forms fit without scrolling', async ({
    page,
  }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await declineConsent(page);
    await expect(dock(page).getByRole('button', { name: /contribute/i })).toHaveCount(0);
    await hubTab(page).click();
    const sheet = page.getByRole('dialog', { name: /^hub$/i });
    await sheet.getByRole('tab', { name: /^contribute\b/i }).click();
    // Signed in, the floating Contribute button is gone: the Hub menu replaces it.
    await expect(page.getByRole('button', { name: 'Contribute to Queer Guide' })).toHaveCount(0);
    for (const choice of [/report a problem or idea/i, /fix something on this page/i]) {
      await sheet.getByRole('button', { name: choice }).click();
      await expect(sheet.getByRole('button', { name: /^submit$/i })).toBeVisible({
        timeout: 15_000,
      });
      await expect
        .poll(() => sheet.evaluate((el) => el.scrollHeight - el.clientHeight))
        .toBeLessThanOrEqual(1);
      await sheet
        .getByRole('button', { name: /^back$/i })
        .first()
        .click();
    }
    await sheet.getByRole('button', { name: /add something new/i }).click();
    await expect(sheet.locator('a[href$="/submit/event"]')).toBeVisible();
  });

  test('a new alert raises the dock Hub badge and removing it lowers it, without a reload', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await declineConsent(page);
    await expect(hubTab(page)).toBeVisible({ timeout: 20_000 });

    let joined = false;
    page.on('websocket', (ws) =>
      ws.on('framereceived', ({ payload }) => {
        const text = typeof payload === 'string' ? payload : payload.toString();
        if (text.includes('realtime:inbox:') && text.includes('"status":"ok"')) joined = true;
      }),
    );
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect
      .poll(() => joined, { timeout: 20_000, message: 'inbox:<user_id> channel never joined' })
      .toBe(true);
    await page.waitForTimeout(3_000);
    const before = await badgeCount(page);

    const raw = await page.evaluate((key) => localStorage.getItem(key), AUTH_KEY);
    expect(raw, `no Supabase session in localStorage (${AUTH_KEY})`).toBeTruthy();
    const { access_token: token, user } = JSON.parse(raw!) as {
      access_token: string;
      user: { id: string };
    };
    const apikey = await resolveAnonKey(page.request);
    expect(apikey, 'anon key not resolvable').toBeTruthy();
    const headers = {
      apikey: apikey!,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    };

    let navigations = 0;
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) navigations += 1;
    });

    let id: string | null = null;
    try {
      const res = await page.request.post(`${SUPABASE_REST_URL}/rest/v1/notifications`, {
        headers,
        data: {
          user_id: user.id,
          type: 'system',
          title: 'e2e mobile hub badge check',
          content: 'Created and deleted by e2e/hub-menu-mobile.spec.ts',
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
