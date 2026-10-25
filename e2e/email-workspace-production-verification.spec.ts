import { test, expect } from '@playwright/test';
import { waitForAppReady } from './support/appReady';

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
test.use({ storageState: { cookies: [], origins: [] }, trace: 'off', screenshot: 'off' });
test.describe.configure({ retries: 0 });

test('production email workspace preserves and saves only its isolated inactive fixture', async ({
  page,
}, info) => {
  test.setTimeout(240_000);
  if (!process.env.E2E_ADMIN_EMAIL || !process.env.E2E_ADMIN_PASSWORD)
    throw new Error('Configured production admin credentials are required; this test cannot skip.');

  expect(new URL(String(info.project.use.baseURL)).origin).toBe('https://queer.guide');
  await page.goto('/auth?redirect=%2Fadmin%2Femail');
  await waitForAppReady(page);
  const cookies = page.getByRole('button', { name: 'Necessary Only', exact: true });
  if (await cookies.isVisible()) await cookies.click();
  try {
    await page.getByLabel('Email', { exact: true }).fill(process.env.E2E_ADMIN_EMAIL);
    await page.getByLabel('Password', { exact: true }).fill(process.env.E2E_ADMIN_PASSWORD);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click({ timeout: 30_000 });
    await expect(page).not.toHaveURL(/\/auth(?:[/?#]|$)/, { timeout: 45_000 });
  } catch {
    throw new Error(
      'Normal admin form sign-in did not succeed. No auth bypass or fallback was attempted.',
    );
  }

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
      (name === 'send-email' || name.startsWith('email-')) &&
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
  await info.attach('desktop-workspace', {
    body: await page.screenshot({ fullPage: true }),
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
    body: await page.screenshot({ fullPage: true }),
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
      cleanup: 'Independent SQL owner must remove exact fixture and compare canonical hashes.',
    }),
    contentType: 'application/json',
  });
});
