/**
 * /graphql/v1 must not be reachable, and REST must still be.
 *
 * `graphql_public` was removed from the project's PostgREST exposed schemas on
 * 2026-10-16 (`db_schema` is now `public, pgmq_public`). Before that, anon
 * POSTing `{ countriesCollection(first:1) }` returned HTTP 200 with real rows.
 *
 * THIS SPEC ASSERTS THE INVARIANT, NOT THE REPAIR. It does not pin "the config
 * says pgmq_public" — it pins the two things that must never be true again:
 * anon cannot read data through GraphQL, and anon CAN still read it through
 * REST. Both halves are required. A spec with only the negative passes equally
 * against a dead project, a revoked key, or a network fault.
 *
 * AND A TIMEOUT IS NOT A DENIAL — this is the whole reason the exposure
 * survived an earlier audit. The live endpoint answered `500 57014` (the 8s
 * statement timeout) on the first probe while still serving data on the next
 * three, so "it errored" was read as "it is closed". Every assertion here
 * therefore requires the SPECIFIC refusal (PGRST106 / schema-not-exposed) and
 * treats a 5xx, a timeout, or any other error as a FAILURE.
 *
 * Runs against prod with the publishable anon key — the same key and path a
 * browser uses, which is the only thing the exposure was ever about.
 */
import { test, expect, type APIRequestContext } from '@playwright/test';

const SUPABASE_URL = 'https://xqeacpakadqfxjxjcewc.supabase.co';

// The publishable (anon) key, already hardcoded in src/integrations/supabase/client.ts.
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8';

const HEADERS = {
  apikey: ANON_KEY,
  Authorization: `Bearer ${ANON_KEY}`,
  'Content-Type': 'application/json',
};

/** A GraphQL attempt must be refused for the RIGHT reason, not merely fail. */
async function expectSchemaNotExposed(body: unknown, request: APIRequestContext) {
  const res = await request.post(`${SUPABASE_URL}/graphql/v1`, {
    headers: HEADERS,
    data: body,
    failOnStatusCode: false,
  });
  const text = await res.text();

  // A 5xx here means we learned nothing — the 57014 trap. Fail loudly.
  expect(
    res.status(),
    `expected a schema-not-exposed refusal, got ${res.status()}: ${text.slice(0, 200)}`,
  ).toBeLessThan(500);

  expect(text).toContain('PGRST106');
  expect(text.toLowerCase()).toContain('graphql_public');
  // The refusal must not have leaked data on the way out.
  expect(text).not.toContain('"data"');
  return text;
}

test.describe('pg_graphql endpoint is closed to anon', () => {
  test('a data query is refused as schema-not-exposed, not timed out', async ({ request }) => {
    // The exact query that returned HTTP 200 with rows before the flip.
    const text = await expectSchemaNotExposed(
      { query: '{ countriesCollection(first:1){ edges { node { code } } } }' },
      request,
    );
    // The country code that leaked in the pre-fix measurement must be absent.
    expect(text).not.toContain('countriesCollection');
  });

  test('introspection is refused for the same reason', async ({ request }) => {
    // This used to answer 500/57014 — a timeout across 736 objects, which is
    // exactly what must NOT count as closed.
    await expectSchemaNotExposed({ query: '{ __schema { types { name } } }' }, request);
  });

  test('a second, unrelated collection is refused too', async ({ request }) => {
    // Proves the refusal is schema-wide and not a per-table grant artifact.
    await expectSchemaNotExposed(
      { query: '{ venuesCollection(first:1){ edges { node { id } } } }' },
      request,
    );
  });

  test('POSITIVE CONTROL: the same anon key still reads data over REST', async ({ request }) => {
    // Without this, every assertion above is satisfied by a dead project or a
    // revoked key.
    const res = await request.get(`${SUPABASE_URL}/rest/v1/countries?select=code&limit=1`, {
      headers: HEADERS,
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(200);
    const rows = (await res.json()) as Array<{ code: string }>;
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBe(1);
    expect(rows[0].code).toBeTruthy();
  });

  test('POSITIVE CONTROL: public pages still render', async ({ page }) => {
    // The 2026-04-27 attempt to close this by revoking table SELECT from anon
    // made every public page 401. Guard the thing that regression broke.
    for (const path of ['/', '/venues', '/cities']) {
      const res = await page.goto(path, { waitUntil: 'domcontentloaded' });
      expect(res?.status(), `${path} should render`).toBe(200);
    }
    await expect(page.locator('body')).not.toContainText('permission denied');
  });
});
