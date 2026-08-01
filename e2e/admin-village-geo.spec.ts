/**
 * Queer Villages CMS geography — the fix in #2487, asserted against production.
 *
 * The reported symptom was "City / Country / Latitude / Longitude are empty, run
 * a backfill". The data was never missing (190/190 villages carry all four, and
 * city_id/country_id are NOT NULL so a gap is impossible). The CMS could not
 * read them: `queer_villages` stores geography as FKs only, `relatedFields` is a
 * write-only name→FK map, and the two picker fields named columns that do not
 * exist — so the editor showed placeholders, and picking a city put `city` in
 * the UPDATE payload, which PostgREST rejects wholesale (PGRST204), losing the
 * city_id the picker had just resolved.
 *
 * Three assertions, one per layer of that:
 *   1. the list renders the geography it always had
 *   2. the editor resolves the FK to a name instead of showing its placeholder
 *   3. the save payload carries city_id/country_id and NOT city/country
 *
 * (3) intercepts and ABORTS the PATCH rather than letting it through — this runs
 * against production, and proving the payload shape must not mutate a real row.
 *
 * Admin-only: skipped when no admin storage state was minted (see auth.setup.ts).
 */
import { test, expect, type Page } from '@playwright/test';

const LIST = '/admin/content/queer_villages';

async function isAuthed(page: Page): Promise<boolean> {
  await page.goto(LIST, { waitUntil: 'domcontentloaded' });
  return page
    .getByRole('table')
    .first()
    .waitFor({ state: 'visible', timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
}

/**
 * Open the first village in the record editor, on its Location tab.
 *
 * Via the row's "Edit" button, not a row click: a row click lands on whichever
 * cell is under it and opens that cell's INLINE editor instead.
 *
 * The tab regex is deliberately unanchored at the end — every tab carries a
 * field-count badge, so its accessible name is "Location 4", not "Location".
 * The editor fully unmounts the list (including its own "City" / "Country"
 * filter textboxes), so page-level queries below cannot collide with them.
 */
async function openFirstRecord(page: Page): Promise<void> {
  await page.getByRole('table').first().locator('tbody tr').first()
    .getByRole('button', { name: /^edit$/i }).click();

  const location = page.getByRole('tab', { name: /^Location\b/ });
  await expect(location).toBeVisible({ timeout: 20_000 });
  await location.click();
}

test.describe('Queer Villages CMS geography', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!(await isAuthed(page)), 'No admin session — set E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD.');
  });

  test('list shows City, Country, Latitude and Longitude for every row', async ({ page }) => {
    const table = page.getByRole('table').first();
    await expect(table).toBeVisible();

    const headers = (await table.locator('thead th').allInnerTexts()).map((h) => h.trim());
    for (const col of ['City', 'Country', 'Latitude', 'Longitude']) {
      expect(headers, `"${col}" is missing from the list columns`).toContain(col);
    }

    const idx = Object.fromEntries(
      ['City', 'Country', 'Latitude', 'Longitude'].map((c) => [c, headers.indexOf(c)]),
    );

    const rows = table.locator('tbody tr');
    const n = Math.min(await rows.count(), 10);
    expect(n, 'no village rows rendered').toBeGreaterThan(0);

    for (let r = 0; r < n; r++) {
      const cells = await rows.nth(r).locator('td').allInnerTexts();
      for (const col of ['City', 'Country', 'Latitude', 'Longitude'] as const) {
        const value = (cells[idx[col]] ?? '').trim();
        // `--` is renderColumnValue's placeholder for null/undefined/empty.
        expect(value, `row ${r}: ${col} rendered empty`).not.toBe('');
        expect(value, `row ${r}: ${col} rendered the null placeholder`).not.toBe('--');
      }
      const lat = Number((await rows.nth(r).locator('td').allInnerTexts())[idx.Latitude]);
      expect(Number.isFinite(lat), `row ${r}: latitude is not numeric`).toBe(true);
      expect(Math.abs(lat)).toBeLessThanOrEqual(90);
    }
  });

  test('editor resolves city_id / country_id to names, not placeholders', async ({ page }) => {
    await openFirstRecord(page);

    for (const label of ['City', 'Country']) {
      const control = page.getByRole('combobox', { name: new RegExp(`^${label}$`, 'i') }).first();
      await expect(control, `${label} control never rendered`).toBeVisible({ timeout: 20_000 });
      const text = ((await control.innerText()) ?? '').trim();
      // The bug: the FK was set but the picker fell back to its placeholder,
      // because it read row.city — a column queer_villages does not have.
      expect(text, `${label} still shows its placeholder`).not.toMatch(/search or create|select a/i);
      expect(text.length, `${label} rendered empty`).toBeGreaterThan(0);
    }
  });

  test('save payload sends city_id/country_id, never the phantom city/country', async ({ page }) => {
    await openFirstRecord(page);

    const bodies: string[] = [];
    // Abort every write: this is production, and the payload shape is the claim.
    await page.route(
      (url) => url.hostname.endsWith('.supabase.co') && url.pathname.includes('queer_villages'),
      async (route) => {
        const req = route.request();
        if (req.method() === 'PATCH' || req.method() === 'POST') {
          bodies.push(req.postData() ?? '');
          return route.abort();
        }
        return route.fallback();
      },
    );

    // Pick a city from the dropdown — the exact interaction that used to fail,
    // because it marks `city` dirty and `city` has no column. Which option is
    // irrelevant (the write never lands), so take the first rather than reading
    // the trigger: pre-fix the trigger shows only a placeholder, and matching an
    // option against it would make this test depend on the bug it is checking.
    const city = page.getByRole('combobox', { name: /^city$/i }).first();
    await expect(city).toBeVisible({ timeout: 20_000 });
    await city.click();
    const option = page.getByRole('option').first();
    await option.waitFor({ state: 'visible', timeout: 15_000 });
    await option.click();

    await page.getByRole('button', { name: /^save$/i }).first().click();
    await expect
      .poll(() => bodies.length, { timeout: 20_000, message: 'no write was attempted' })
      .toBeGreaterThan(0);

    for (const body of bodies) {
      const payload = JSON.parse(body) as Record<string, unknown>;
      const keys = Object.keys(payload);
      // The whole defect: a key with no column fails the entire statement.
      expect(keys, 'phantom `city` is back in the payload').not.toContain('city');
      expect(keys, 'phantom `country` is back in the payload').not.toContain('country');
      expect(keys, 'phantom `city_name` is back in the payload').not.toContain('city_name');
      expect(keys, 'phantom `country_name` is back in the payload').not.toContain('country_name');
    }
  });
});
