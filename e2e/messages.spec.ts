import { test, expect, type Page } from '@playwright/test';

/**
 * E2E coverage for the Unified Inbox at /messages.
 *
 * The page (src/pages/Messages.tsx) is a two-pane hub: a merged rail
 * (chats + mail + notifications, via the get_inbox_feed RPC) on the left and a
 * per-kind detail pane on the right. It is auth-gated (AuthGate). Signed-in
 * tests use the storageState minted by e2e/auth.setup.ts and run as the
 * `claude-test` admin user. They are skipped when no signed-in session is
 * available (e.g. PR runs without admin creds).
 *
 * Most mutation flows depend on seeded, test-user-owned fixtures. Re-apply with
 * the SQL below (Supabase MCP / SQL editor) before running locally:
 *
 *   -- claude-test:   dfec8c70-5b7d-4e31-bf0e-1fc1521a0720  (mailbox_address 'claudetest')
 *   -- claude-test-2: e2e00002-0000-4000-8000-000000000002  (chat partner "Claude Test Two")
 *   -- conversation:  e2e00000-0000-4000-8000-0000000000c0  (+ seed message ...c1 from u2)
 *   -- inbound mail:  ...c4 "E2E seeded inbound — open me", ...c5 "E2E seeded inbound — delete me"
 *   -- notification:  ...c3 "E2E seeded alert" (action_url /events)
 *
 * Each fixture-dependent test annotate-skips (does not fail) when its seed row
 * is absent, so the nightly suite stays green if the fixtures are ever cleaned.
 */

const BASE = process.env.E2E_BASE_URL || 'https://queer.guide';
const SIGNED_IN = Boolean(process.env.E2E_ADMIN_EMAIL || process.env.E2E_STORAGE_STATE);

const SEED = {
  conversationId: 'e2e00000-0000-4000-8000-0000000000c0',
  partnerName: 'Claude Test Two',
  partnerMessage: 'Seeded E2E partner message',
  mailOpen: 'E2E seeded inbound — open me',
  mailDelete: 'E2E seeded inbound — delete me',
  notification: 'E2E seeded alert',
  selfEmail: 'claudetest@queer.guide',
};

/** Accept the cookie-consent banner if present — its fixed bottom overlay
 *  intercepts clicks on bottom-anchored controls (the Send buttons). */
async function dismissConsent(page: Page) {
  const accept = page.getByRole('button', { name: /accept all/i });
  if (await accept.isVisible().catch(() => false)) {
    await accept.click().catch(() => {});
    await accept.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
  }
}

/** Wait for the authed inbox shell (rail + filter tabs) to render. */
async function gotoInbox(page: Page, query = '') {
  await page.goto(`/messages${query}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('tab', { name: /^all$/i })).toBeVisible({ timeout: 20_000 });
  await dismissConsent(page);
}

const tab = (page: Page, name: RegExp) => page.getByRole('tab', { name });

/** Skip the current test if a seeded rail item never loaded. */
async function requireRailItem(page: Page, label: string) {
  const item = page.getByText(label, { exact: false }).first();
  const found = await item
    .waitFor({ state: 'visible', timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  test.skip(!found, `Seed fixture "${label}" not present in the inbox feed.`);
  return item;
}

// ---------------------------------------------------------------------------
// Auth gate — runs without a session.
// ---------------------------------------------------------------------------
test.describe('/messages — auth gate (anonymous)', () => {
  test('anonymous visitor sees the sign-in gate, not the inbox', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    try {
      await page.goto(`${BASE}/messages`, { waitUntil: 'domcontentloaded' });
      await expect(
        page.getByText(/please sign in to access your messages/i),
      ).toBeVisible({ timeout: 20_000 });
      const signIn = page.getByRole('link', { name: /sign in/i });
      await expect(signIn).toBeVisible();
      await expect(signIn).toHaveAttribute('href', /\/auth/);
      // The inbox filter tablist must NOT render for anon.
      await expect(page.getByRole('tab', { name: /^all$/i })).toHaveCount(0);
    } finally {
      await ctx.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Signed-in suite.
// ---------------------------------------------------------------------------
test.describe('/messages — unified inbox (signed in)', () => {
  test.skip(
    !SIGNED_IN,
    'Requires a signed-in session (E2E_ADMIN_EMAIL / E2E_STORAGE_STATE).',
  );

  // Pre-seed cookie consent so the fixed bottom banner never mounts — it
  // otherwise races page load and intercepts clicks on the Send buttons.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem(
          'queer-guide-cookie-consent',
          JSON.stringify({
            preferences: { necessary: true, functional: true, analytics: true, marketing: true },
            version: '1.0',
            timestamp: new Date(0).toISOString(),
          }),
        );
      } catch {
        /* storage unavailable — fall back to dismissConsent */
      }
    });
  });

  test('renders the two-pane shell: header, rail, compose, search, filter tabs', async ({ page }) => {
    await gotoInbox(page);
    await expect(page.getByRole('heading', { name: 'Messages' })).toBeVisible();
    // Rail header now carries a vibe chip + compose + a search box (the old
    // static "Inbox" label was replaced by the vibe editor).
    await expect(page.getByRole('button', { name: /compose/i })).toBeVisible();
    await expect(page.getByPlaceholder(/^search$/i)).toBeVisible();
    for (const name of [/^all$/i, /^chats$/i, /^mail$/i, /^alerts$/i]) {
      await expect(tab(page, name)).toBeVisible();
    }
    await expect(tab(page, /^all$/i)).toHaveAttribute('aria-selected', 'true');
  });

  test('rail search box filters the inbox', async ({ page }) => {
    await gotoInbox(page);
    const search = page.getByPlaceholder(/^search$/i);
    await search.fill('zzzznomatchzzzz');
    await expect(page.getByText(/no matches/i)).toBeVisible({ timeout: 10_000 });
    await search.clear();
    await expect(tab(page, /^all$/i)).toBeVisible();
  });

  test('compose → New message opens the recipient picker', async ({ page }) => {
    await gotoInbox(page);
    await page.getByRole('button', { name: /compose/i }).click();
    await page.getByRole('menuitem', { name: /new message/i }).click();
    await expect(page.getByPlaceholder(/search people/i)).toBeVisible({ timeout: 10_000 });
  });

  test('vibe editor opens from the rail header', async ({ page }) => {
    await gotoInbox(page);
    await page.getByRole('button', { name: /set a vibe|✨/i }).first().click();
    await expect(page.getByText(/your vibe/i)).toBeVisible({ timeout: 10_000 });
  });

  test('filter chips toggle aria-selected', async ({ page }) => {
    await gotoInbox(page);
    await tab(page, /^mail$/i).click();
    await expect(tab(page, /^mail$/i)).toHaveAttribute('aria-selected', 'true');
    await expect(tab(page, /^all$/i)).toHaveAttribute('aria-selected', 'false');
    await tab(page, /^chats$/i).click();
    await expect(tab(page, /^chats$/i)).toHaveAttribute('aria-selected', 'true');
    await expect(tab(page, /^mail$/i)).toHaveAttribute('aria-selected', 'false');
  });

  test('changing the filter clears a deep-linked selection from the URL', async ({ page }) => {
    await gotoInbox(page, `?conversation=${SEED.conversationId}`);
    // Deep-link selects the chat — partner name shows in the detail header.
    const partner = page.getByText(SEED.partnerName).first();
    const selected = await partner
      .waitFor({ state: 'visible', timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!selected, 'Seeded conversation not present.');
    await expect(page).toHaveURL(/conversation=/);
    await tab(page, /^mail$/i).click();
    await expect(page).not.toHaveURL(/conversation=/);
  });

  test('bad deep-link id leaves the empty "Select an item" prompt', async ({ page }) => {
    await gotoInbox(page, '?conversation=00000000-0000-0000-0000-000000000000');
    await expect(page.getByText(/select an item|choose a message/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test('compose chooser opens the New email sheet with the user mailbox + validation', async ({
    page,
  }) => {
    await gotoInbox(page);
    await page.getByRole('button', { name: /compose/i }).click();
    await expect(page.getByRole('menuitem', { name: /new message/i })).toBeVisible();
    await page.getByRole('menuitem', { name: /new email/i }).click();

    await expect(page.getByText(`From: ${SEED.selfEmail}`)).toBeVisible({ timeout: 10_000 });
    const send = page.getByRole('button', { name: /^send$/i });
    await expect(send).toBeDisabled(); // disabled until a recipient is entered
    await page.getByPlaceholder('recipient@example.com').fill(SEED.selfEmail);
    await expect(send).toBeEnabled();
  });

  test('compose New email sends a correctly-shaped request (object payload, not positional)', async ({
    page,
  }) => {
    await gotoInbox(page);
    await page.getByRole('button', { name: /compose/i }).click();
    await page.getByRole('menuitem', { name: /new email/i }).click();

    const subject = `E2E compose ${Date.now()}`;
    await page.getByPlaceholder('recipient@example.com').fill(SEED.selfEmail);
    await page.getByPlaceholder('Email subject').fill(subject);
    await page.getByPlaceholder('Write your message...').fill('Sent by the /messages e2e spec.');

    const reqPromise = page.waitForRequest(
      (r) => r.url().includes('/functions/v1/send-mailbox-email') && r.method() === 'POST',
    );
    await page.getByRole('button', { name: /^send$/i }).click();
    const body = (await reqPromise).postDataJSON();

    // Regression guard for the positional-args bug: the payload must be an
    // object with named fields, not a JSON-encoded bare string.
    expect(typeof body).toBe('object');
    expect(body.to).toBe(SEED.selfEmail);
    expect(body.subject).toBe(subject);
    expect(typeof body.body_text).toBe('string');
  });

  test('chat: open seeded thread, send a message, add a reaction', async ({ page }) => {
    await gotoInbox(page, `?conversation=${SEED.conversationId}`);
    const partner = page.getByText(SEED.partnerName).first();
    const ok = await partner
      .waitFor({ state: 'visible', timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!ok, 'Seeded conversation not present.');

    await expect(page.getByText(SEED.partnerMessage).first()).toBeVisible();

    // Send a message.
    const body = `e2e chat ${Date.now()}`;
    const input = page.getByPlaceholder('Type a message...');
    await input.fill(body);
    await input.press('Enter');
    await expect(page.getByText(body).first()).toBeVisible({ timeout: 15_000 });
    await expect(input).toHaveValue('');

    // React to the message we just sent (fresh + own → deterministic 0→1, so
    // the toggle behaviour can't flip an existing reaction off on re-runs). The
    // quick-react bar appears on hover; click 👍 and assert the grouped badge.
    const bubble = page
      .locator('div.relative', { has: page.locator('p.text-sm', { hasText: body }) })
      .last();
    await bubble.scrollIntoViewIfNeeded();
    await bubble.hover();
    await bubble.getByRole('button', { name: '👍' }).first().click({ force: true });
    await expect(page.getByText('👍 1').first()).toBeVisible({ timeout: 15_000 });
  });

  test('chat: reply affordance shows the reply banner', async ({ page }) => {
    await gotoInbox(page, `?conversation=${SEED.conversationId}`);
    const seeded = page.getByText(SEED.partnerMessage).first();
    const ok = await seeded
      .waitFor({ state: 'visible', timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!ok, 'Seeded conversation not present.');

    const bubble = page
      .locator('div.relative', { has: page.locator('p.text-sm', { hasText: SEED.partnerMessage }) })
      .last();
    await bubble.scrollIntoViewIfNeeded();
    await bubble.hover();
    await bubble.getByRole('button', { name: /^reply$/i }).click({ force: true });
    await expect(page.getByText(/replying to/i)).toBeVisible({ timeout: 10_000 });
  });

  test('chat: sticker picker opens', async ({ page }) => {
    await gotoInbox(page, `?conversation=${SEED.conversationId}`);
    const ok = await page
      .getByText(SEED.partnerName)
      .first()
      .waitFor({ state: 'visible', timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!ok, 'Seeded conversation not present.');
    await page.getByRole('button', { name: /^stickers$/i }).click();
    await expect(page.getByText(/^stickers$/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('chat: free-to-meet toggle reveals the ribbon', async ({ page }) => {
    await gotoInbox(page, `?conversation=${SEED.conversationId}`);
    const ok = await page
      .getByText(SEED.partnerName)
      .first()
      .waitFor({ state: 'visible', timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!ok, 'Seeded conversation not present.');
    const toggle = page.getByRole('button', { name: /free to meet|free now/i }).first();
    await toggle.click();
    await expect(page.getByText(/free to meet right now|marked free to meet/i)).toBeVisible({
      timeout: 10_000,
    });
    // Reset so re-runs start clean.
    await toggle.click();
  });

  test('mail: open seeded inbound, reply (correct payload), then archive', async ({ page }) => {
    await gotoInbox(page);
    await tab(page, /^mail$/i).click();
    const item = await requireRailItem(page, SEED.mailOpen);
    await item.click();

    await expect(page.getByRole('button', { name: /reply/i })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: /reply/i }).click();
    await expect(page.getByText(new RegExp(`reply to ${SEED.selfEmail}`, 'i'))).toBeVisible();
    await page.getByPlaceholder(/write your reply/i).fill('Reply from the e2e spec.');

    const reqPromise = page.waitForRequest(
      (r) => r.url().includes('/functions/v1/send-mailbox-email') && r.method() === 'POST',
    );
    await page.getByRole('button', { name: /^send$/i }).click();
    const replyBody = (await reqPromise).postDataJSON();
    expect(typeof replyBody).toBe('object');
    expect(replyBody.to).toBe(SEED.selfEmail);
    expect(String(replyBody.subject)).toMatch(/^Re:/i);

    // Archive removes it from the inbox folder; a fresh load must not list it.
    await page.getByRole('button', { name: /archive/i }).click();
    await gotoInbox(page);
    await tab(page, /^mail$/i).click();
    await expect(page.getByText(SEED.mailOpen)).toHaveCount(0, { timeout: 15_000 });
  });

  test('mail: delete a seeded inbound email removes it from the inbox', async ({ page }) => {
    await gotoInbox(page);
    await tab(page, /^mail$/i).click();
    const item = await requireRailItem(page, SEED.mailDelete);
    await item.click();
    await expect(page.getByRole('button', { name: /delete/i })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: /delete/i }).click();

    await gotoInbox(page);
    await tab(page, /^mail$/i).click();
    await expect(page.getByText(SEED.mailDelete)).toHaveCount(0, { timeout: 15_000 });
  });

  test('alerts: seeded notification shows its Open action', async ({ page }) => {
    await gotoInbox(page);
    await tab(page, /^alerts$/i).click();
    const item = await requireRailItem(page, SEED.notification);
    await item.click();
    const open = page.getByRole('link', { name: /^open$/i });
    await expect(open).toBeVisible({ timeout: 15_000 });
    await expect(open).toHaveAttribute('href', /\/events/);
  });

  test('responsive: selecting an item swaps the rail for the detail pane on mobile', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoInbox(page);
    await tab(page, /^alerts$/i).click();
    const item = await requireRailItem(page, SEED.notification);
    await item.click();
    // Detail pane shows the notification + a mobile Back control.
    // Exact match avoids colliding with the "Share feedback" FAB (…back).
    const back = page.getByRole('button', { name: 'Back', exact: true });
    await expect(back).toBeVisible({ timeout: 15_000 });
    await back.click();
    // Rail returns: the filter tabs are visible again.
    await expect(tab(page, /^alerts$/i)).toBeVisible();
  });
});
