import type { Locator, Page } from '@playwright/test';
import { test, expect } from './support/taxonomyFixtures';
import {
  referenceMetadata,
  stableValue,
  taxonomyFamilies,
  type TaxonomyFamily,
} from './support/taxonomyCases';

// Deliberately excluded from playwright.config.ts (the production nightly).
// Run only with playwright.taxonomy.config.ts, which validates all endpoints.
if (taxonomyFamilies.length !== 53 || new Set(taxonomyFamilies.map((f) => f.route)).size !== 53)
  throw new Error('Update taxonomy regression coverage: expected 53 distinct families');

const humanize = (key: string) => {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replaceAll('_', ' ')
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};
const kind = (value: unknown) =>
  Array.isArray(value)
    ? 'List'
    : typeof value === 'object' && value !== null
      ? 'Group of fields'
      : typeof value === 'number'
        ? 'Number'
        : typeof value === 'boolean'
          ? 'Yes / No'
          : 'Text';

/** Fill the actual structured editor, including required flag/hanky metadata. */
async function fillObject(
  page: Page,
  scope: Locator,
  value: Record<string, unknown>,
  label: string,
) {
  for (const [key, child] of Object.entries(value)) {
    const keyName = `Name of field ${humanize(key)}`;
    if ((await scope.getByRole('textbox', { name: keyName, exact: true }).count()) === 0) {
      await scope.getByRole('button', { name: 'Add field', exact: true }).last().click();
      await page.getByRole('menuitem', { name: kind(child), exact: true }).click();
      const name = scope.getByRole('textbox', { name: /^Name of field / }).last();
      await name.fill(key);
      await name.press('Enter');
    }
    // A structured field's key and value share this entry container. Unlike
    // a global Add-field lookup, this stays inside the current nested object.
    const entry = scope
      .getByRole('textbox', { name: keyName, exact: true })
      .locator('..')
      .locator('..')
      .locator('..');
    const childLabel = `${label} › ${humanize(key)}`;
    if (Array.isArray(child)) {
      for (const [index, item] of child.entries()) {
        await entry.getByRole('button', { name: 'Add item', exact: true }).last().click();
        if (index === 0)
          await page.getByRole('menuitem', { name: kind(item), exact: true }).click();
        const itemScope = entry
          .getByRole('button', { name: `Remove item ${index + 1}`, exact: true })
          .locator('..')
          .locator('..');
        await fillObject(
          page,
          itemScope,
          item as Record<string, unknown>,
          `${childLabel} › item ${index + 1}`,
        );
      }
    } else if (typeof child === 'object' && child !== null) {
      await fillObject(page, entry, child as Record<string, unknown>, childLabel);
    } else if (typeof child === 'boolean') {
      await entry.getByRole('switch', { name: childLabel, exact: true }).setChecked(child);
    } else {
      await entry
        .getByRole(typeof child === 'number' ? 'spinbutton' : 'textbox', {
          name: childLabel,
          exact: true,
        })
        .fill(String(child));
    }
  }
}

async function save(page: Page, family: TaxonomyFamily, method: 'POST' | 'PATCH') {
  const responsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/rest/v1/${family.id}` &&
      response.request().method() === method,
  );
  await page.getByRole('button', { name: 'Save', exact: true }).press('Enter');
  const response = await responsePromise;
  expect(response.ok(), `${family.label} ${method}: ${await response.text()}`).toBe(true);
  const payload = await response.json();
  const row = Array.isArray(payload) ? payload[0] : payload;
  expect(row?.id, 'Save must return a persisted record').toMatch(/^[\da-f-]{36}$/);
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  return row as Record<string, unknown>;
}

async function reopenAfterReload(page: Page, family: TaxonomyFamily, name: string, id: string) {
  await page.reload({ waitUntil: 'domcontentloaded' });
  const search = page
    .getByRole('region', { name: 'Content workspace controls' })
    .getByRole('textbox');
  await expect(search).toBeVisible();
  await search.fill(name);
  const row = page.getByRole('row').filter({
    has: page.getByRole('checkbox', { name: `Select ${name}`, exact: true }),
  });
  await expect(row).toHaveCount(1);
  const freshRead = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === 'GET' &&
      url.pathname === `/rest/v1/${family.id}` &&
      url.searchParams.get('id') === `eq.${id}`
    );
  });
  await row.getByRole('button', { name: 'Edit', exact: true }).press('Enter');
  const response = await freshRead;
  expect(response.ok()).toBe(true);
  const data = await response.json();
  expect((Array.isArray(data) ? data[0] : data)[family.titleColumn]).toBe(name);
  await expect(page.getByRole('textbox', { name: family.titleInput, exact: true })).toHaveValue(
    name,
  );
}

for (const family of taxonomyFamilies) {
  test(`${family.label}: create, edit, reload and clean up`, async ({
    page,
    taxonomy,
  }, testInfo) => {
    const createdName = `${taxonomy.prefix} Original`;
    const editedName = `${taxonomy.prefix} Edited`;
    let parentId: string | undefined;

    async function create(target: TaxonomyFamily, name: string, active = false) {
      taxonomy.own(target.id);
      await page.goto('/admin/taxonomies');
      await expect(page.getByRole('heading', { name: 'Taxonomies', exact: true })).toBeVisible();
      await page.getByRole('link', { name: target.label, exact: true }).click();
      await page.getByRole('button', { name: /^New / }).press('Enter');
      await page.getByRole('textbox', { name: target.titleInput, exact: true }).fill(name);
      if (target.hasSlug) await page.getByRole('textbox', { name: /^Slug\*?$/ }).fill(taxonomy.key);
      // Gay Bar is stored as venue_type in production. Unrelated edits used
      // to fail because the editor omitted this database-supported Kind.
      if (target.id === 'amenities')
        await page.getByRole('combobox', { name: 'Kind', exact: true }).selectOption('venue_type');
      if (target.taxonomy) {
        // Directory filters scope the list; the shared new-record editor
        // exposes the taxonomy choice explicitly rather than prefilling it.
        await page
          .getByRole('combobox', { name: 'Taxonomy*', exact: true })
          .selectOption(target.taxonomy);
        const key = stableValue(target.taxonomy, taxonomy.key);
        await page.getByRole('textbox', { name: 'Stable value*', exact: true }).fill(key);
      }
      if (target.id === 'kink_categories')
        await page
          .getByRole('combobox', { name: 'Rating axis*', exact: true })
          .selectOption('general');
      if (target.id === 'kink_items')
        await page
          .getByRole('combobox', { name: 'Category*', exact: true })
          .selectOption(parentId!);
      const metadata = referenceMetadata(target.taxonomy);
      if (metadata) {
        await page.getByRole('tab', { name: /^Details / }).press('Enter');
        await fillObject(
          page,
          page.getByRole('group', { name: 'Reference details', exact: true }),
          metadata,
          'Reference details',
        );
      }
      if (target.id !== 'unified_tags') {
        await page.getByRole('tab', { name: /^Settings / }).press('Enter');
        await page.getByRole('switch', { name: 'Active', exact: true }).setChecked(active);
      }
      return save(page, target, 'POST');
    }

    if (family.id.startsWith('kink_')) taxonomy.enableIntimate();
    if (family.id === 'kink_items') {
      const parent = taxonomyFamilies.find((item) => item.id === 'kink_categories')!;
      parentId = String((await create(parent, `${taxonomy.prefix} Parent`, true)).id);
    }
    const created = await test.step('create through the editor', () => create(family, createdName));
    expect(String(created[family.titleColumn]).toLowerCase()).toBe(createdName.toLowerCase());
    if (family.id === 'amenities') expect(created.kind).toBe('venue_type');
    if (family.id === 'unified_tags') {
      expect(created.publication_role).toBe('utility');
      expect(created.seo_indexable).toBe(false);
    }
    await test.step('reload and reopen the created record', async () => {
      await reopenAfterReload(
        page,
        family,
        String(created[family.titleColumn]),
        String(created.id),
      );
      if (family.hasSlug) {
        const slug = page.getByRole('textbox', { name: /^Slug\*?$/ });
        await expect(slug).toHaveValue(taxonomy.key);
        await expect(slug).toBeDisabled();
      }
      if (family.id === 'amenities')
        await expect(page.getByRole('combobox', { name: 'Kind', exact: true })).toHaveValue(
          'venue_type',
        );
      if (family.taxonomy) {
        await expect(page.getByRole('combobox', { name: 'Taxonomy*', exact: true })).toBeDisabled();
        await expect(
          page.getByRole('textbox', { name: 'Stable value*', exact: true }),
        ).toBeDisabled();
      }
      if (family.id === 'unified_tags') {
        await page.getByRole('tab', { name: /^Details / }).press('Enter');
        // This is the original production failure: existing unverified tags
        // appeared blank, then unrelated edits failed registry validation.
        await expect(page.getByRole('combobox', { name: 'Verification', exact: true })).toHaveValue(
          'unverified',
        );
        expect(
          await page
            .getByRole('combobox', { name: 'Verification', exact: true })
            .locator('option')
            .evaluateAll((options) => options.map((option) => option.getAttribute('value'))),
        ).toEqual(['', 'unverified', 'auto', 'reviewed', 'locked']);
        await page.getByRole('tab', { name: /^Basic Info / }).press('Enter');
      }
    });
    await page.getByRole('textbox', { name: family.titleInput, exact: true }).fill(editedName);
    if (family.id !== 'unified_tags') {
      await page.getByRole('tab', { name: /^Settings / }).press('Enter');
      await page.getByRole('spinbutton', { name: /^Sort order$/i }).fill('9876');
    }
    const edited = await test.step('save the edit', () => save(page, family, 'PATCH'));
    expect(edited.id).toBe(created.id);
    if (family.id === 'amenities') expect(edited.kind).toBe('venue_type');
    expect(String(edited[family.titleColumn]).toLowerCase()).toBe(editedName.toLowerCase());
    await test.step('verify persistence after another full reload', async () => {
      await reopenAfterReload(page, family, String(edited[family.titleColumn]), String(edited.id));
      if (family.id === 'amenities')
        await expect(page.getByRole('combobox', { name: 'Kind', exact: true })).toHaveValue(
          'venue_type',
        );
      if (family.id !== 'unified_tags') {
        await page.getByRole('tab', { name: /^Settings / }).press('Enter');
        await expect(page.getByRole('spinbutton', { name: /^Sort order$/i })).toHaveValue('9876');
        await expect(page.getByRole('switch', { name: 'Active', exact: true })).not.toBeChecked();
      } else {
        await page.getByRole('tab', { name: /^Details / }).press('Enter');
        await expect(page.getByRole('combobox', { name: 'Verification', exact: true })).toHaveValue(
          'unverified',
        );
      }
      const records = taxonomy.database.rows(family.id, taxonomy.prefix);
      expect(records).toHaveLength(1);
      expect(records[0].id).toBe(created.id);
      if (family.id === 'amenities') expect(records[0].kind).toBe('venue_type');
      expect(records[0][family.titleColumn]).toBe(edited[family.titleColumn]);
      if (family.hasSlug) expect(records[0].slug).toBe(created.slug);
      if (family.taxonomy) {
        expect(records[0].taxonomy).toBe(family.taxonomy);
        expect(records[0].value).toBe(created.value);
        expect(records[0].metadata).toEqual(created.metadata);
      }
    });
    await testInfo.attach('persisted-record', {
      body: JSON.stringify({ family: family.label, created, edited }, null, 2),
      contentType: 'application/json',
    });
    // Fixture teardown closes the browser, removes owned records and metadata,
    // asserts absence, restores guard/eligibility state and attaches results.
  });
}
