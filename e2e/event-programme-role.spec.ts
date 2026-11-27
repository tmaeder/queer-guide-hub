import { test, expect, type APIRequestContext } from '@playwright/test';
import { anonHeaders } from './support/anonKey';

/**
 * Festival programme roles (migration 99991795346624_events_programme_role).
 *
 * The anon half runs everywhere: it asserts what a visitor's role can READ (both
 * columns, through the table and through event_programme()) and that it cannot
 * WRITE them. The write probe sends the row's CURRENT value, so even if RLS were
 * ever opened it changes nothing on prod — the signal is whether PostgREST returns
 * the row as updated, not whether data moved.
 *
 * The admin half needs the configured admin session (nightly). It is read-only on
 * purpose: it asserts the panel renders one role select and one Official switch per
 * child, each reflecting the stored value. The write path is covered by the unit
 * tests and was proven on prod in a rolled-back transaction when the migration
 * shipped; a nightly spec that edits live festival data is not worth that cost.
 */

// Anon-key discovery crawls the deployed bundle on first use, which can outrun the
// default per-test timeout.
test.describe.configure({ timeout: 120_000 });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? 'https://xqeacpakadqfxjxjcewc.supabase.co';
const ROLES = [
  'parade',
  'street_fair',
  'main_party',
  'party',
  'workshop',
  'screening',
  'talk',
  'award',
  'rally',
  'social',
  'sports',
  'market',
  'other',
];

interface Child {
  id: string;
  title: string;
  programme_role?: string | null;
  programme_official?: boolean | null;
}

async function findChild(request: APIRequestContext) {
  const res = await request.get(
    `${SUPABASE_URL}/rest/v1/events?select=id,parent_event_id,programme_role,programme_official&parent_event_id=not.is.null&duplicate_of_id=is.null&limit=1`,
    { headers: await anonHeaders(request) },
  );
  expect(res.ok(), `events read -> HTTP ${res.status()}: ${await res.text()}`).toBe(true);
  const rows = (await res.json()) as Array<{
    id: string;
    parent_event_id: string;
    programme_role: string | null;
    programme_official: boolean;
  }>;
  // Positive control: without a programme child every assertion below is vacuous.
  expect(rows.length, 'no programme child visible to anon').toBe(1);
  return rows[0];
}

async function programme(request: APIRequestContext, eventId: string) {
  const res = await request.post(`${SUPABASE_URL}/rest/v1/rpc/event_programme`, {
    headers: { ...(await anonHeaders(request)), 'content-type': 'application/json' },
    data: { p_event_id: eventId },
  });
  expect(res.ok(), `event_programme -> HTTP ${res.status()}`).toBe(true);
  return (await res.json()) as { umbrella: { id: string } | null; children: Child[] };
}

test.describe('event programme roles — anon', () => {
  test('both columns are readable and carry legal values', async ({ request }) => {
    const child = await findChild(request);
    expect(child).toHaveProperty('programme_role');
    expect(typeof child.programme_official).toBe('boolean');
    if (child.programme_role !== null) expect(ROLES).toContain(child.programme_role);
  });

  test('event_programme() returns role + official on every child', async ({ request }) => {
    const child = await findChild(request);
    const data = await programme(request, child.id);
    expect(data.umbrella?.id).toBe(child.parent_event_id);
    expect(data.children.length).toBeGreaterThan(0);
    for (const c of data.children) {
      expect(c, `child ${c.id}`).toHaveProperty('programme_role');
      expect(typeof c.programme_official, `child ${c.id}`).toBe('boolean');
    }
  });

  test('anon cannot write a programme role', async ({ request }) => {
    const child = await findChild(request);
    const res = await request.patch(`${SUPABASE_URL}/rest/v1/events?id=eq.${child.id}`, {
      headers: {
        ...(await anonHeaders(request)),
        'content-type': 'application/json',
        Prefer: 'return=representation',
      },
      // Current values: a no-op even if the policy were wrong.
      data: { programme_role: child.programme_role, programme_official: child.programme_official },
    });
    if (res.ok()) {
      // RLS filters the UPDATE to zero rows rather than raising.
      expect(await res.json(), 'anon UPDATE matched the row').toEqual([]);
    } else {
      expect([401, 403]).toContain(res.status());
    }
  });
});

const authenticated = Boolean(
  process.env.E2E_STORAGE_STATE || (process.env.E2E_ADMIN_EMAIL && process.env.E2E_ADMIN_PASSWORD),
);

test.describe('event programme roles — admin panel', () => {
  test.skip(!authenticated, 'Requires the configured admin session');

  test('each child row shows its stored role and official flag', async ({ page, request }) => {
    const child = await findChild(request);
    const data = await programme(request, child.id);

    await page.goto(`/admin/content/events?edit=${child.parent_event_id}`);
    // extraPanels render as accordion sections in CMSEditorLayout.
    await page.getByRole('button', { name: 'Programme', exact: true }).click();

    const selects = page.getByRole('combobox', { name: /^Role of / });
    await expect(selects.first()).toBeVisible({ timeout: 20_000 });
    await expect(selects).toHaveCount(data.children.length);
    const switches = page.getByRole('switch', { name: 'Official' });
    await expect(switches).toHaveCount(data.children.length);

    // The panel orders children exactly as the RPC returns them.
    for (const [i, c] of data.children.entries()) {
      await expect(selects.nth(i)).toHaveValue(c.programme_role ?? '');
      await expect(switches.nth(i)).toHaveAttribute(
        'aria-checked',
        String(c.programme_official ?? true),
      );
    }
    // Options are exactly the closed vocabulary plus "No role".
    const values = await selects
      .first()
      .locator('option')
      .evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
    expect(values).toEqual(['', ...ROLES]);
  });
});
