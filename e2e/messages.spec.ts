import { test, expect, type Page } from '@playwright/test';
import { preventMessageDelivery } from './support/noMessageDelivery';
import { preserveInboxFixtures } from './support/inboxFixtureTransport';

// Routing cannot stop service-worker-owned requests. Disable those so no send
// can bypass the transport fixtures, including delayed DM-digest source writes.
test.use({ serviceWorkers: 'block' });
const fixtureGuards = new WeakMap<Page, Awaited<ReturnType<typeof preserveInboxFixtures>>>();
const deliveryGuards = new WeakMap<Page, Awaited<ReturnType<typeof preventMessageDelivery>>>();

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
 * The transport checks read existing, test-user-owned fixtures. Their write
 * requests are intercepted locally; do not reseed or move production rows:
 *
 *   -- claude-test:   dfec8c70-5b7d-4e31-bf0e-1fc1521a0720  (mailbox_address 'claudetest')
 *   -- claude-test-2: e2e00002-0000-4000-8000-000000000002  (chat partner; display name is mutable)
 *   -- conversation:  e2e00000-0000-4000-8000-0000000000c0  (+ seed message ...c1 from u2)
 *   -- inbound mail:  ...c4 "E2E seeded inbound — open me", ...c5 "E2E seeded inbound — delete me"
 *   -- notification:  ...c3 "E2E seeded alert" (action_url /events)
 *
 * Each fixture-dependent test annotate-skips (does not fail) when its seed row
 * is absent, so the nightly suite stays green if the fixtures are ever cleaned.
 */

const BASE = process.env.E2E_BASE_URL || 'https://queer.guide';
const SIGNED_IN = Boolean(process.env.E2E_ADMIN_EMAIL || process.env.E2E_STORAGE_STATE);
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

const SEED = {
  conversationId: 'e2e00000-0000-4000-8000-0000000000c0',
  ownerId: 'dfec8c70-5b7d-4e31-bf0e-1fc1521a0720',
  partnerId: 'e2e00002-0000-4000-8000-000000000002',
  mailOpenId: 'e2e00000-0000-4000-8000-0000000000c4',
  mailDeleteId: 'e2e00000-0000-4000-8000-0000000000c5',
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

/** Wait for the authed inbox shell (rail + filter tabs) to render.
 *  Enters via the legacy /messages URL on purpose — asserting the
 *  locale/query-preserving redirect into /hub on every run. */
async function gotoInbox(page: Page, query = '') {
  await page.goto(`/messages${query}`, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/hub/, { timeout: 20_000 });
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

/** Wait for a completed fresh mail feed before asserting an item is absent. */
async function gotoMailRail(page: Page) {
  await gotoInbox(page);
  const loaded = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === '/rest/v1/mailbox_emails' &&
      response.request().method() === 'GET' &&
      url.searchParams.get('folder') === 'in.(inbox,sent)'
    );
  });
  await tab(page, /^mail$/i).click();
  const response = await loaded;
  expect(response.ok(), 'Reviewer mail rail must be readable').toBe(true);
  await response.finished();
  await expect(page.getByRole('status', { name: 'Loading messages', exact: true })).toHaveCount(0);
}

/** Resolve the current rail title by stable identity, then verify the real chat. */
async function gotoSeedConversation(page: Page) {
  const feed = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/rest/v1/rpc/get_inbox_feed' &&
      response.request().method() === 'POST' &&
      response.request().postDataJSON()?.p_filter === 'all',
  );
  await gotoInbox(page, `?conversation=${SEED.conversationId}`);
  const response = await feed;
  expect(response.ok(), 'Reviewer inbox feed must be readable').toBe(true);
  expect(response.request().postDataJSON().p_user).toBe(SEED.ownerId);
  const items = await response.json();
  const conversation = items.find(
    (item: { id: string }) => item.id === `conv_${SEED.conversationId}`,
  );
  test.skip(!conversation, 'Seeded conversation not present in the reviewer inbox.');
  expect(conversation.kind).toBe('chat');
  expect(conversation.other_user_id).toBe(SEED.partnerId);
  expect(conversation.title).toEqual(expect.any(String));
  expect(conversation.title.trim()).not.toBe('');
  await expect(
    page.getByText(conversation.title, { exact: true }).and(page.locator('p.font-medium')),
  ).toBeVisible();
  await expect(page.getByText(SEED.partnerMessage).first()).toBeVisible();
  expect(new URL(page.url()).searchParams.get('conversation')).toBe(SEED.conversationId);
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
        page.getByText(/sign in to see your messages, plans and saved places/i),
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
  test.skip(!SIGNED_IN, 'Requires a signed-in session (E2E_ADMIN_EMAIL / E2E_STORAGE_STATE).');

  // Pre-seed cookie consent so the fixed bottom banner never mounts — it
  // otherwise races page load and intercepts clicks on the Send buttons.
  test.beforeEach(async ({ page }) => {
    deliveryGuards.set(page, await preventMessageDelivery(page.context(), SEED.conversationId));
    fixtureGuards.set(
      page,
      await preserveInboxFixtures(page.context(), {
        ownerId: SEED.ownerId,
        conversationId: SEED.conversationId,
        mailIds: [SEED.mailOpenId, SEED.mailDeleteId],
      }),
    );
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

  test.afterEach(async ({ page }) => {
    expect(
      fixtureGuards.get(page)?.blockedWrites,
      'Unexpected fixture mutation was blocked',
    ).toEqual([]);
    const guard = deliveryGuards.get(page);
    if (guard)
      expect(guard.blockedWrites, 'Unexpected delivery-producing mutation was blocked').toEqual([]);
  });

  test('renders the two-pane shell: header, rail, compose, search, filter tabs', async ({
    page,
  }) => {
    await gotoInbox(page);
    // Hub shell renders the module nav around the inbox workspace.
    await expect(page.getByRole('navigation', { name: /hub modules/i }).first()).toBeVisible();
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
    await page
      .getByRole('button', { name: /set a vibe|✨/i })
      .first()
      .click();
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
    await gotoSeedConversation(page);
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

  test('compose New email constructs a correctly-shaped request without delivery', async ({
    page,
  }) => {
    await gotoInbox(page);
    await page.getByRole('button', { name: /compose/i }).click();
    await page.getByRole('menuitem', { name: /new email/i }).click();

    const subject = `E2E compose ${Date.now()}`;
    await page.getByPlaceholder('recipient@example.com').fill(SEED.selfEmail);
    await page.getByPlaceholder('Email subject').fill(subject);
    // The message body is a Tiptap RichTextEditor, not a <textarea>. Its
    // "Write your message..." string is fed to @tiptap/extension-placeholder,
    // which renders it as a `data-placeholder` attribute drawn via CSS ::before —
    // there is no `placeholder` (or `aria-placeholder`) attribute anywhere in the
    // DOM, and those two are the only things getByPlaceholder matches. So the
    // old locator could never resolve and the test spent its whole 30s budget
    // waiting for an element that does not exist. Target the contenteditable.
    // Keyed on `[contenteditable]` rather than Tiptap's own `.ProseMirror` class:
    // the wrapper class is ours (RichTextEditor.tsx) and contenteditable is what
    // the element must be for the field to work at all, so neither half can be
    // renamed out from under this by a Tiptap upgrade.
    await page
      .locator('.rich-text-content [contenteditable]')
      .fill('Sent by the /messages e2e spec.');

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
    expect(body.request_id).toMatch(UUID);
    const guard = deliveryGuards.get(page)!;
    await expect.poll(() => guard.mailFulfilled).toBe(1);
    expect(guard.mailRequests).toEqual([body]);
    await expect(page.getByPlaceholder('recipient@example.com')).toBeHidden();
  });

  test('chat: construct a message and reaction without notifying recipients', async ({ page }) => {
    test.setTimeout(60_000); // Seeded inbox reads can be slow; send/reaction transport stays local.
    await gotoSeedConversation(page);

    // Send a message.
    const body = `e2e chat ${Date.now()}`;
    const input = page.getByPlaceholder('Type a message…', { exact: true });
    await input.fill(body);
    await input.press('Enter');
    await expect(page.getByText(body).first()).toBeVisible({ timeout: 15_000 });
    await expect(input).toHaveValue('');

    const guard = deliveryGuards.get(page)!;
    // Wait for the intercepted receipt's stable message ID, then scope both
    // the reaction and badge to it. A relative ancestor can contain the seeded
    // partner message too, whose reaction must stay blocked and unchanged.
    const message = page.locator(`#msg-${guard.messageId}`);
    await expect(message.getByText(body, { exact: true })).toBeVisible({ timeout: 15_000 });
    await message.hover();
    await message.getByRole('button', { name: '👍', exact: true }).click();
    await expect(message.getByRole('button', { name: '👍 1', exact: true })).toBeVisible({
      timeout: 15_000,
    });
    expect(guard.chatRequests).toHaveLength(1);
    expect(guard.chatRequests[0]).toMatchObject({
      conversation_id: SEED.conversationId,
      content: body,
    });
    expect(guard.chatRequests[0].sender_id).toMatch(UUID);
    expect(guard.reactionRequests).toHaveLength(1);
    expect(guard.reactionRequests[0]).toMatchObject({
      message_id: guard.messageId,
      user_id: guard.chatRequests[0].sender_id,
      emoji: '👍',
    });
  });

  test('chat: reply affordance shows the reply banner', async ({ page }) => {
    await gotoSeedConversation(page);
    const bubble = page
      .locator('div.relative', { has: page.locator('p.text-sm', { hasText: SEED.partnerMessage }) })
      .last();
    await bubble.scrollIntoViewIfNeeded();
    await bubble.hover();
    await bubble.getByRole('button', { name: /^reply$/i }).click({ force: true });
    await expect(page.getByText(/replying to/i)).toBeVisible({ timeout: 10_000 });
  });

  test('chat: sticker picker opens', async ({ page }) => {
    await gotoSeedConversation(page);
    await page.getByRole('button', { name: /^stickers$/i }).click();
    await expect(page.getByText(/^stickers$/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('chat: free-to-meet toggle reveals the ribbon', async ({ page }) => {
    await gotoSeedConversation(page);
    const toggle = page.getByRole('button', { name: /free to meet|free now/i }).first();
    await toggle.click();
    await expect(page.getByText(/free to meet right now|marked free to meet/i)).toBeVisible({
      timeout: 10_000,
    });
    // Reset the browser-only availability fixture and verify both RPC payloads.
    await toggle.click();
    await expect.poll(() => fixtureGuards.get(page)?.availabilityRequests).toEqual([60, 0]);
  });

  test('mail: reply to the existing inbound from its current folder without delivery', async ({
    page,
  }) => {
    const emailRead = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.pathname === '/rest/v1/mailbox_emails' &&
        response.request().method() === 'GET' &&
        url.searchParams.get('id') === `eq.${SEED.mailOpenId}`
      );
    });
    // MailDetail reads by ID independently of the rail's Inbox/Sent folder scope.
    // This exercises the actual archived row without moving it back to Inbox.
    await gotoInbox(page, `?email=${SEED.mailOpenId}`);
    const response = await emailRead;
    expect(response.ok(), 'Existing inbound fixture must remain reviewer-readable').toBe(true);
    const email = await response.json();
    expect(email).toMatchObject({
      id: SEED.mailOpenId,
      owner_id: SEED.ownerId,
      direction: 'inbound',
      subject: SEED.mailOpen,
    });
    expect(['inbox', 'archive']).toContain(email.folder);
    const inboundEmailId = new URL(page.url()).searchParams.get('email');
    expect(inboundEmailId).toBe(SEED.mailOpenId);
    await expect(page.getByRole('heading', { name: SEED.mailOpen, exact: true })).toBeVisible();

    await expect(page.getByRole('button', { name: 'Reply', exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole('button', { name: 'Reply', exact: true }).click();
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
    expect(replyBody.in_reply_to_email_id).toBe(inboundEmailId);
    expect(replyBody.request_id).toMatch(UUID);
    const guard = deliveryGuards.get(page)!;
    await expect.poll(() => guard.mailFulfilled).toBe(1);
    expect(guard.mailRequests).toEqual([replyBody]);
    await expect(page.getByPlaceholder(/write your reply/i)).toBeHidden();

    // Keep the archive action and payload assertion, with no production write.
    await page.getByRole('button', { name: 'Archive', exact: true }).click();
    await expect
      .poll(() => fixtureGuards.get(page)?.folderRequests)
      .toEqual([{ id: SEED.mailOpenId, folder: 'archive' }]);
    await gotoMailRail(page);
    await expect(page.getByText(SEED.mailOpen)).toHaveCount(0, { timeout: 15_000 });
  });

  test('mail: delete a seeded inbound email removes it from the inbox', async ({ page }) => {
    await gotoInbox(page);
    await tab(page, /^mail$/i).click();
    const item = await requireRailItem(page, SEED.mailDelete);
    await item.click();
    await expect(page).toHaveURL(new RegExp(`email=${SEED.mailDeleteId}`));
    await expect(page.getByRole('heading', { name: SEED.mailDelete, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete', exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect
      .poll(() => fixtureGuards.get(page)?.folderRequests)
      .toEqual([{ id: SEED.mailDeleteId, folder: 'trash' }]);

    await gotoMailRail(page);
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
    // Exact match avoids colliding with the global "Contribute to Queer Guide" FAB (…back).
    const back = page.getByRole('button', { name: 'Back', exact: true });
    await expect(back).toBeVisible({ timeout: 15_000 });
    await back.click();
    // Rail returns: the filter tabs are visible again.
    await expect(tab(page, /^alerts$/i)).toBeVisible();
  });
});
