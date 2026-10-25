import { test, expect, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { waitForAppReady } from './support/appReady';

const FINAL_BUILD = '6730900f1beac10ae708b067e0bde5e7b82c4bde';

// The unchanged workflow still runs its existing real-credential auth setup.
// This spec deliberately uses a fresh context and the normal sign-in form.
// Never collect authentication traces or screenshots containing credentials.
test.use({
  storageState: { cookies: [], origins: [] },
  trace: 'off',
  screenshot: 'off',
  video: 'off',
});
test.describe.configure({ retries: 0, mode: 'serial' });

async function normalLogin(page: Page, baseURL: unknown) {
  if (!process.env.E2E_ADMIN_EMAIL || !process.env.E2E_ADMIN_PASSWORD)
    throw new Error('Configured production admin credentials are required; this test cannot skip.');
  expect(new URL(String(baseURL)).origin).toBe('https://queer.guide');
  const deployed = await page.request.get('/build-id.txt');
  expect(deployed.ok()).toBe(true);
  expect((await deployed.text()).trim()).toBe(FINAL_BUILD);
  await page.goto('/auth?redirect=%2Fadmin%2Femail');
  await waitForAppReady(page);
  const cookies = page.getByRole('button', { name: 'Necessary Only', exact: true });
  if (await cookies.isVisible()) await cookies.click();
  try {
    const signedIn = page
      .waitForResponse(
        (response) =>
          new URL(response.url()).pathname === '/auth/v1/token' &&
          new URL(response.url()).searchParams.get('grant_type') === 'password' &&
          response.request().method() === 'POST',
      )
      .catch(() => null);
    const main = page.getByRole('main');
    await main.getByLabel('Email', { exact: true }).fill(process.env.E2E_ADMIN_EMAIL);
    await main.getByLabel('Password', { exact: true }).fill(process.env.E2E_ADMIN_PASSWORD);
    await main.getByRole('button', { name: 'Sign in', exact: true }).click({ timeout: 30_000 });
    await expect(page).not.toHaveURL(/\/auth(?:[/?#]|$)/, { timeout: 45_000 });
    const response = await signedIn;
    if (!response?.ok()) throw new Error('Normal sign-in did not return success.');
    const { user } = await response.json();
    if (!user || typeof user.id !== 'string' || typeof user.email !== 'string')
      throw new Error('Normal sign-in did not return a user.');
    // Read only the user identity from the genuine login response. Never attach,
    // extract, copy, inject or log its session credentials or network payload.
    return {
      id: user.id as string,
      email: user.email as string,
      emailConfirmed: Boolean(user.email_confirmed_at),
    };
  } catch {
    throw new Error(
      'Normal admin form sign-in did not succeed. No auth bypass or fallback was attempted.',
    );
  }
}

test('reserved genuine-admin Mail round-trip allows exactly one verified-owner message', async ({
  page,
}, info) => {
  test.setTimeout(180_000);
  const profileResponses: Array<Promise<Record<string, unknown> | null>> = [];
  page.on('response', (response) => {
    if (new URL(response.url()).pathname === '/rest/v1/rpc/get_my_profile' && response.ok())
      profileResponses.push(
        response
          .json()
          .then((value) => {
            const row = Array.isArray(value) ? value[0] : value;
            return row && typeof row === 'object' ? row : null;
          })
          .catch(() => null),
      );
  });
  const user = await normalLogin(page, info.project.use.baseURL);
  if (!user.emailConfirmed) throw new Error('The genuine sender must have a confirmed account.');
  const subject = '[E2E qg-mail-20261026-a6fbb4d1] Delivery verification';
  const reservation = 'a6fbb4d1-766c-4782-bb8b-3875a3c7adfa';
  const run = process.env.GITHUB_RUN_ID;
  if (!/^\d+$/.test(run ?? '') || process.env.GITHUB_RUN_ATTEMPT !== '1')
    throw new Error('Only the first attempt of the exclusively reserved CI run is allowed.');
  let recipient = '';
  let requestId: string | null = null;
  let receiptProof: Record<string, unknown> | null = null;
  let posts = 0;
  let blocked = 0;
  let sendClicked = false;
  try {
    // Refuse recipient imports, template writes, profile changes, or any other
    // email send. The only allowed mutation is the guarded Mail request below.
    await page.route('**/rest/v1/**', async (route) => {
      const req = route.request();
      const path = new URL(req.url()).pathname;
      if (['GET', 'HEAD', 'OPTIONS'].includes(req.method()) || path.includes('/rpc/'))
        return route.continue();
      blocked++;
      return route.abort('blockedbyclient');
    });
    await page.route('**/functions/v1/**', async (route) => {
      const req = route.request();
      const path = new URL(req.url()).pathname;
      if (
        !['GET', 'HEAD', 'OPTIONS'].includes(req.method()) &&
        path !== '/functions/v1/send-mailbox-email'
      ) {
        blocked++;
        return route.abort('blockedbyclient');
      }
      return route.continue();
    });
    await page.route('**/functions/v1/send-mailbox-email*', async (route) => {
      const req = route.request();
      if (req.method() !== 'POST') return route.continue();
      const body = req.postDataJSON() as Record<string, unknown>;
      if (
        posts !== 0 ||
        body.to !== recipient ||
        !recipient ||
        !sendClicked ||
        Object.keys(body).some(
          (key) =>
            ![
              'to',
              'subject',
              'body_html',
              'body_text',
              'in_reply_to_email_id',
              'request_id',
            ].includes(key),
        ) ||
        body.subject !== subject ||
        body.in_reply_to_email_id ||
        typeof body.request_id !== 'string' ||
        !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
          body.request_id,
        )
      ) {
        blocked++;
        return route.abort('blockedbyclient');
      }
      posts++;
      requestId = body.request_id as string;
      await info.attach('mail-attempt-before-post', {
        body: JSON.stringify({
          reservation,
          subject,
          run,
          request_id: requestId,
          posts,
          blocked,
          sendClicked,
        }),
        contentType: 'application/json',
      });
      await route.continue();
    });
    await page.goto('/admin/email?tab=subscribers');
    await waitForAppReady(page);
    const directory = page.getByRole('region', { name: 'Entity recipients', exact: true });
    await expect(directory).toBeVisible(); // Genuine admin access, no role injection.
    await directory.getByLabel('Recipient type', { exact: true }).selectOption('user');
    const nextDirectoryResponse = () =>
      page.waitForResponse((response) => {
        const url = new URL(response.url());
        return (
          response.request().method() === 'GET' &&
          url.pathname === '/functions/v1/email-admin' &&
          url.searchParams.get('resource') === 'recipients' &&
          url.searchParams.get('kind') === 'user'
        );
      });
    let pendingDirectory = nextDirectoryResponse();
    await directory.getByRole('button', { name: 'Browse recipients', exact: true }).click();
    for (let i = 0; i < 100; i++) {
      const response = await pendingDirectory;
      if (!response.ok()) throw new Error('The normal verified recipient directory did not load.');
      const data = await response.json();
      const row = data.recipients?.find(
        (r: Record<string, unknown>) => r.id === 'a60e7b7f-a454-4b13-8cd9-458d46d67e2b',
      );
      if (row) {
        const hash =
          typeof row.email === 'string'
            ? createHash('sha256').update(row.email.trim().toLowerCase()).digest('hex')
            : '';
        if (
          row.kind !== 'user' ||
          row.evidence !== 'verified_account_mailbox' ||
          hash !== '68de5ab2e8b0022f45c4975eab4b8fa0b505978b1ffc53dd9600695c52432134'
        )
          throw new Error('Exact verified owner recipient proof failed.');
        recipient = row.email;
        break;
      }
      if (!data.next) break;
      pendingDirectory = nextDirectoryResponse();
      await directory.getByRole('button', { name: 'Next recipients', exact: true }).click();
    }
    if (!recipient) throw new Error('Exact verified owner is absent from the normal directory.');
    await page.goto('/hub/messages');
    await waitForAppReady(page);
    await page.getByRole('tab', { name: /^mail$/i }).click();
    await page.getByRole('button', { name: /^compose$/i }).click();
    await page.getByRole('menuitem', { name: /^new email$/i }).click();
    const composer = page.getByRole('dialog', { name: /^new email$/i });
    await expect(composer.getByText(/^From: /)).toBeVisible();
    const profiles = await Promise.all(profileResponses);
    const profile = profiles
      .reverse()
      .find(
        (row) =>
          row?.user_id === user.id &&
          typeof row.mailbox_address === 'string' &&
          row.mailbox_address.length > 0,
      );
    if (!profile)
      throw new Error(
        'Genuine sender has no existing own mailbox in normal self-profile response.',
      );
    const senderMailbox = `${profile.mailbox_address}@queer.guide`;
    // Boolean assertion prevents the private sender address appearing in diagnostics.
    expect((await composer.getByText(/^From: /).innerText()) === `From: ${senderMailbox}`).toBe(
      true,
    );
    await composer.getByPlaceholder('recipient@example.com', { exact: true }).fill(recipient);
    await composer.getByPlaceholder('Email subject', { exact: true }).fill(subject);
    await composer
      .locator('.rich-text-content [contenteditable]')
      .fill('One authorized production delivery verification. No reply is required.');
    const sent = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/functions/v1/send-mailbox-email',
    );
    // Exclusive ownership: exactly one click, no retries or second submission.
    const beforeSend = await page.request.get('/build-id.txt');
    expect((await beforeSend.text()).trim()).toBe(FINAL_BUILD);
    sendClicked = true;
    await composer.getByRole('button', { name: 'Send', exact: true }).click();
    const response = await sent;
    const receipt = (await response.json()) as Record<string, unknown>;
    const proof = {
      reservation,
      request_id: requestId,
      subject,
      posts,
      blocked,
      sendClicked,
      httpStatus: response.status(),
      email_id: typeof receipt.email_id === 'string' ? receipt.email_id : null,
      outbox_id: typeof receipt.outbox_id === 'string' ? receipt.outbox_id : null,
      provider_id: typeof receipt.provider_id === 'string' ? receipt.provider_id : null,
      delivery_status: typeof receipt.delivery_status === 'string' ? receipt.delivery_status : null,
    };
    // Preserve immutable IDs before any later assertion. Never attach payloads,
    // recipient/address, login response, credentials or private mailbox lists.
    receiptProof = proof;
    await info.attach('mail-receipt', {
      body: JSON.stringify(proof),
      contentType: 'application/json',
    });
    expect(response.ok()).toBe(true);
    expect(proof.email_id).toMatch(/^[a-f0-9-]{36}$/i);
    expect(proof.outbox_id).toMatch(/^[a-f0-9-]{36}$/i);
    expect(proof.provider_id).toBeTruthy();
    expect(['accepted', 'delivered']).toContain(proof.delivery_status);
    await expect.poll(() => new URL(page.url()).searchParams.get('email')).toBe(proof.email_id);
    const heading = page.getByRole('heading', { name: subject, exact: true });
    await expect(heading).toBeVisible();
    const detail = heading.locator('..').locator('..');
    const statusResponse = page.waitForResponse(
      (res) =>
        res.request().method() === 'GET' &&
        new URL(res.url()).pathname === '/functions/v1/send-mailbox-email' &&
        new URL(res.url()).searchParams.get('email_id') === proof.email_id,
    );
    await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
    const refreshed = await statusResponse;
    expect(refreshed.ok()).toBe(true);
    const status = (await refreshed.json()).delivery_status;
    expect(['accepted', 'delivered']).toContain(status);
    await expect(
      detail.getByText(status === 'delivered' ? 'Delivery: Delivered' : 'Delivery: Submitted', {
        exact: true,
      }),
    ).toBeVisible();
    if (status === 'accepted')
      await expect(
        detail.getByText('Delivery is not yet confirmed.', { exact: true }),
      ).toBeVisible();
    await info.attach('mail-desktop', {
      body: await detail.screenshot({
        mask: [detail.locator('.min-w-0.break-words')],
      }),
      contentType: 'image/png',
    });
    await detail.getByRole('button', { name: 'Reply', exact: true }).click();
    const replyHeading = page.getByRole('heading', { name: /^Reply to / });
    expect((await replyHeading.innerText()).includes(recipient)).toBe(true);
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(replyHeading).toHaveCount(0);
    await page.reload();
    await waitForAppReady(page);
    await expect(heading).toBeVisible();
    expect(new URL(page.url()).searchParams.get('email')).toBe(proof.email_id);
    await page.setViewportSize({ width: 390, height: 844 });
    const dimensions = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    expect(dimensions.width).toBe(390);
    expect(dimensions.scroll).toBeLessThanOrEqual(390);
    const bounds = await detail.boundingBox();
    expect(bounds && bounds.width > 0 && bounds.width <= 390).toBe(true);
    await info.attach('mail-mobile', {
      body: await detail.screenshot({
        mask: [detail.locator('.min-w-0.break-words')],
      }),
      contentType: 'image/png',
    });
    expect(posts).toBe(1);
    expect(blocked).toBe(0);
    await info.attach('mail-verification-summary', {
      body: JSON.stringify({
        ...proof,
        refreshedStatus: status,
        posts,
        blocked,
        dimensions,
        retained:
          'Legitimate Sent copy retained for independent SQL receipt and duplicate verification.',
      }),
      contentType: 'application/json',
    });
  } catch (error) {
    await info.attach('mail-attempt-failure-proof', {
      body: JSON.stringify({
        reservation,
        subject,
        run,
        request_id: requestId,
        posts,
        blocked,
        sendClicked,
        receipt: receiptProof,
      }),
      contentType: 'application/json',
    });
    const message = error instanceof Error ? error.message : 'Mail verification failed.';
    const redacted = message.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email address]');
    // eslint-disable-next-line preserve-caught-error -- The original UI diagnostics can contain the private owner address.
    throw new Error(redacted);
  }
});
