import { test, expect, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { waitForAppReady } from './support/appReady';

const FINAL_BUILD = 'bc3f0d87e0201af1445d77b0496850c441723059';

// Temporary production verification only. Seed and cleanup belong to the release
// owner through independent SQL. Never merge this fixed fixture into nightly CI.
const FIXTURE = {
  id: 'c02f6893-d08e-47b2-b427-5a8e939d2550',
  key: 'e2e_email_workspace_ci_20261025',
  name: '[E2E] Inactive unified email workspace CI 2026-10-25',
  initialSubject: 'Hello {{display_name}} — CI workspace verification',
  subject: 'Hello {{display_name}} — unified workspace CI audit',
};

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

test('production email workspace preserves and saves only its isolated inactive fixture', async ({
  page,
}, info) => {
  test.setTimeout(240_000);
  await normalLogin(page, info.project.use.baseURL);

  let fixtureWrites = 0;
  const blocked: string[] = [];
  await page.route('**/rest/v1/email_*', async (route) => {
    const req = route.request();
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method())) return route.continue();
    const url = new URL(req.url());
    const body = req.postDataJSON() as Record<string, unknown>;
    const html = typeof body.html_content === 'string' ? body.html_content : '';
    const safe =
      req.method() === 'PATCH' &&
      url.pathname === '/rest/v1/email_templates' &&
      url.searchParams.get('id') === `eq.${FIXTURE.id}` &&
      ![...url.searchParams.keys()].some((key) => !['id', 'select'].includes(key)) &&
      body.name === FIXTURE.name &&
      body.subject === FIXTURE.subject &&
      body.is_active === false &&
      !('template_key' in body) &&
      !('id' in body) &&
      html.includes('queer-guide-email-blocks:v1:') &&
      html.includes('{{display_name}}') &&
      html.includes('{{action_url}}') &&
      /<hr[\s>]/i.test(html) &&
      !html.includes('River') &&
      fixtureWrites === 0;
    if (!safe) {
      blocked.push(`${req.method()} ${url.pathname}`);
      return route.abort('blockedbyclient');
    }
    fixtureWrites++;
    await route.continue();
  });
  await page.route('**/functions/v1/**', async (route) => {
    const req = route.request();
    const name = new URL(req.url()).pathname.split('/').pop() ?? '';
    if (
      (name === 'send-email' || name === 'send-mailbox-email' || name.startsWith('email-')) &&
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method())
    ) {
      blocked.push(`${req.method()} ${name}`);
      return route.abort('blockedbyclient');
    }
    await route.continue();
  });

  const loaded = page.waitForResponse(
    (res) =>
      res.request().method() === 'GET' &&
      new URL(res.url()).pathname === '/rest/v1/email_templates',
  );
  await page.goto('/admin/email-templates');
  await waitForAppReady(page);
  await expect(page).toHaveURL(/\/admin\/email\?tab=templates$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Email', exact: true })).toHaveCount(1);
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Email', exact: true })).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Email Templates', exact: true })).toHaveCount(0);
  const rows = (await (await loaded).json()) as Array<Record<string, unknown>>;
  const fixture = rows.filter((row) => row.id === FIXTURE.id);
  expect(fixture).toHaveLength(1);
  expect(fixture[0]).toMatchObject({
    template_key: FIXTURE.key,
    name: FIXTURE.name,
    subject: FIXTURE.initialSubject,
    is_active: false,
  });
  expect(String(fixture[0].html_content)).not.toContain('queer-guide-email-blocks:v1:');
  const choose = () => page.getByRole('button').filter({ hasText: FIXTURE.key });
  await expect(choose()).toHaveCount(1);
  await choose().click();
  const workspace = page.getByRole('region', { name: 'Template workspace', exact: true });
  await expect(workspace.getByRole('heading', { name: FIXTURE.name, exact: true })).toBeVisible();
  await workspace.getByRole('button', { name: 'Edit', exact: true }).click();
  await workspace.getByRole('button', { name: 'Use block editor', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Convert to email blocks?' })
    .getByRole('button', { name: 'Convert draft', exact: true })
    .click();
  await expect(workspace.getByRole('textbox', { name: 'Email block content' })).toBeVisible();
  await workspace.getByRole('button', { name: 'Add block', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Divider', exact: true }).click();
  await workspace.getByLabel('Subject line', { exact: true }).fill(FIXTURE.subject);
  await expect(workspace.getByRole('switch', { name: 'Delivery status' })).not.toBeChecked();
  const tabs = page.getByRole('tablist', { name: 'Email workspace', exact: true });
  await tabs.getByRole('tab', { name: 'Campaigns', exact: true }).click();
  await expect(page).toHaveURL(/tab=campaigns/);
  await page.goBack();
  await expect(tabs.getByRole('tab', { name: 'Templates', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(workspace.getByLabel('Subject line', { exact: true })).toHaveValue(FIXTURE.subject);
  await tabs.getByRole('tab', { name: 'Content', exact: true }).click();
  await page.getByRole('link', { name: 'Edit base templates in Templates', exact: true }).click();
  await expect(workspace.getByLabel('Subject line', { exact: true })).toHaveValue(FIXTURE.subject);
  await workspace.getByRole('button', { name: 'Preview', exact: true }).click();
  const preview = page.getByRole('region', { name: 'Draft email preview', exact: true });
  await preview.getByLabel('display_name', { exact: true }).fill('River');
  await preview.getByLabel('action_url', { exact: true }).fill('https://queer.guide');
  await expect(preview.frameLocator('iframe[title="Email preview"]').locator('body')).toContainText(
    'River',
  );
  await expect(workspace.getByRole('button', { name: 'Test email', exact: true })).toBeDisabled();
  const adminIdentity = page.getByRole('button', { name: 'Sign out', exact: true }).locator('..');
  await info.attach('desktop-workspace', {
    body: await page.screenshot({ fullPage: true, mask: [adminIdentity] }),
    contentType: 'image/png',
  });
  await preview.getByRole('button', { name: 'Mobile', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  const dimensions = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
    preview:
      document.querySelector('iframe[title="Email preview"]')?.getBoundingClientRect().width ?? 0,
  }));
  expect(dimensions.width).toBe(390);
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width);
  expect(dimensions.preview).toBeGreaterThan(0);
  expect(dimensions.preview).toBeLessThanOrEqual(390);
  await info.attach('mobile-workspace', {
    body: await page.screenshot({ fullPage: true, mask: [adminIdentity] }),
    contentType: 'image/png',
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  const save = workspace.getByRole('button', { name: 'Save', exact: true });
  await expect(save).toBeEnabled();
  const saved = page.waitForResponse(
    (res) =>
      res.request().method() === 'PATCH' &&
      new URL(res.url()).pathname === '/rest/v1/email_templates',
  );
  const beforeSave = await page.request.get('/build-id.txt');
  expect((await beforeSave.text()).trim()).toBe(FINAL_BUILD);
  await save.click();
  expect((await saved).ok()).toBe(true);
  await expect(workspace.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
  const reloaded = page.waitForResponse(
    (res) =>
      res.request().method() === 'GET' &&
      new URL(res.url()).pathname === '/rest/v1/email_templates',
  );
  await page.reload();
  await waitForAppReady(page);
  const savedRows = (await (await reloaded).json()) as Array<Record<string, unknown>>;
  const persisted = savedRows.find((row) => row.id === FIXTURE.id);
  expect(persisted).toMatchObject({
    template_key: FIXTURE.key,
    name: FIXTURE.name,
    subject: FIXTURE.subject,
    is_active: false,
  });
  const html = String(persisted?.html_content);
  expect(html).toContain('queer-guide-email-blocks:v1:');
  expect(html).toContain('{{display_name}}');
  expect(html).toContain('{{action_url}}');
  expect(html).toMatch(/<hr[\s>]/i);
  expect(html).not.toContain('River');
  await choose().click();
  await workspace.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(workspace.getByRole('textbox', { name: 'Email block content' })).toBeVisible();
  await expect(
    workspace.getByRole('button', { name: 'Use block editor', exact: true }),
  ).toHaveCount(0);
  await expect(workspace.getByLabel('Subject line', { exact: true })).toHaveValue(FIXTURE.subject);
  expect(fixtureWrites).toBe(1);
  expect(blocked, 'No forbidden email mutation or send should be attempted').toEqual([]);
  await tabs.getByRole('tab', { name: 'Operations', exact: true }).click();
  await expect(page.getByText('Queued delivery events', { exact: true })).toBeVisible();
  await expect(page.getByText('Dead-letter delivery events', { exact: true })).toBeVisible();
  await expect(
    page.getByText(/Queue measurements checked at|Queue measurements are unavailable/),
  ).toBeVisible();
  expect(fixtureWrites).toBe(1);
  expect(blocked).toEqual([]);
  const build = await page.request.get('/build-id.txt');
  expect(build.ok()).toBe(true);
  await info.attach('verification-summary', {
    body: JSON.stringify({
      fixture: FIXTURE.id,
      inactive: true,
      writes: fixtureWrites,
      sends: 0,
      build: (await build.text()).trim(),
      dimensions,
      operationsQueueLabelsVerified: true,
      cleanup: 'Independent SQL owner must remove exact fixture and compare canonical hashes.',
    }),
    contentType: 'application/json',
  });
});

test('optional original-owner Mail round-trip allows at most one personal message', async ({
  page,
}, info) => {
  test.setTimeout(180_000);
  const user = await normalLogin(page, info.project.use.baseURL);
  const addressHash = createHash('sha256').update(user.email.trim().toLowerCase()).digest('hex');
  const originalOwner =
    user.id === 'a60e7b7f-a454-4b13-8cd9-458d46d67e2b' &&
    user.emailConfirmed &&
    addressHash === '68de5ab2e8b0022f45c4975eab4b8fa0b505978b1ffc53dd9600695c52432134';
  if (!originalOwner) {
    await info.attach('mail-verification-not-performed', {
      body: JSON.stringify({
        sends: 0,
        reason:
          'The genuinely signed-in CI account is not the exact original verified owner. No Mail send was attempted.',
      }),
      contentType: 'application/json',
    });
    test.skip(
      true,
      'Personal Mail send requires the exact original verified owner; no send performed.',
    );
    return;
  }
  const run = process.env.GITHUB_RUN_ID;
  const attempt = process.env.GITHUB_RUN_ATTEMPT;
  expect(run).toMatch(/^\d+$/);
  expect(attempt).toMatch(/^\d+$/);
  const subject = `[E2E ${run}.${attempt}] Owner Mail verification`;
  let posts = 0;
  let blocked = 0;
  let sendClicked = false;
  try {
    await page.route('**/functions/v1/send-mailbox-email*', async (route) => {
      const req = route.request();
      if (req.method() !== 'POST') return route.continue();
      const body = req.postDataJSON() as Record<string, unknown>;
      if (
        posts !== 0 ||
        body.to !== user.email ||
        body.subject !== subject ||
        body.in_reply_to_email_id
      ) {
        blocked++;
        return route.abort('blockedbyclient');
      }
      posts++;
      await route.continue();
    });
    await page.goto('/hub/messages');
    await waitForAppReady(page);
    await page.getByRole('tab', { name: /^mail$/i }).click();
    await page.getByRole('button', { name: /^compose$/i }).click();
    await page.getByRole('menuitem', { name: /^new email$/i }).click();
    const composer = page.getByRole('dialog', { name: /^new email$/i });
    await composer.getByPlaceholder('recipient@example.com', { exact: true }).fill(user.email);
    await composer.getByPlaceholder('Email subject', { exact: true }).fill(subject);
    await composer
      .locator('.rich-text-content [contenteditable]')
      .fill(`Controlled personal production verification ${run}.${attempt}. No reply is required.`);
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
    expect((await replyHeading.innerText()).includes(user.email)).toBe(true);
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
      body: JSON.stringify({ subject, posts, blocked, sendClicked }),
      contentType: 'application/json',
    });
    const message = error instanceof Error ? error.message : 'Mail verification failed.';
    const redacted = message.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email address]');
    // eslint-disable-next-line preserve-caught-error -- The original UI diagnostics can contain the private owner address.
    throw new Error(redacted);
  }
});
