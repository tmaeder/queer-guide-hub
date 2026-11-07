import { expect, test } from '@playwright/test';
import { ADMIN_SESSION_REQUIRED, authenticated, gotoAdmin } from './support/adminAuth';

test('admin inventory loads production sources and automations', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Uses the desktop admin session');
  test.skip(!authenticated, ADMIN_SESSION_REQUIRED);

  const snapshot = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/rest/v1/rpc/admin_data_operations_overview' &&
      response.request().method() === 'POST',
    { timeout: 30_000 },
  );
  await gotoAdmin(page, '/admin/pipelines', 'Pipelines');
  const response = await snapshot;
  expect(response.status()).toBe(200);
  const payload = (await response.json()) as {
    observed_at: string;
    entries: { kind: string; name: string; identifier: string | null }[];
  };
  expect(Number.isFinite(Date.parse(payload.observed_at))).toBe(true);
  const kinds = new Set(payload.entries.map((entry) => entry.kind));
  for (const kind of ['adapter', 'scraper', 'feed', 'automation']) {
    expect(kinds.has(kind), `Inventory is missing the ${kind} registry`).toBe(true);
  }

  const automation = payload.entries.find(
    (entry) => entry.kind === 'automation' && entry.identifier,
  );
  if (!automation?.identifier) throw new Error('No registered automation can be opened');

  const table = page.getByRole('table', { name: 'Sources and automations inventory' });
  await expect(table).toBeVisible();
  await page.getByRole('combobox', { name: 'Registry' }).selectOption('automation');
  await page.getByRole('searchbox', { name: 'Search inventory' }).fill(automation.identifier);
  await table
    .getByRole('link', { name: `Manage ${automation.name}`, exact: true })
    .first()
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page).toHaveURL(
    new RegExp(`/admin/automation\\?automation=${encodeURIComponent(automation.identifier)}$`),
  );
});
