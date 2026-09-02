import { test, expect, type APIRequestContext } from '@playwright/test';

// No entity may assert both halves of an accessibility pair.
//
// `_shared/venue-consensus.ts` votes `accessibility_attributes` as kind:'array',
// and array fields UNION their contributors: every source counted as agreeing,
// so an array could never register a conflict. OSM `wheelchair=no` and Google
// `wheelchairAccessibleEntrance=true` would both survive on one row and
// auto-commit at high confidence. HIGH_RISK_FIELDS did not list the field
// either, so nothing gated it. Fixed 2026-08-30 in the comparator AND in a
// BEFORE trigger on venues/events, because the column has four writers.
//
// This is not a cosmetic concern. `search_events(p_accessibility_attributes)`
// filters on this array, so a row carrying both halves is returned to a user
// filtering for an accessible restroom at a venue that does not have one.
// 20260801150524: "a wrong access claim strands a disabled person at a door
// they cannot get through."
//
// Read through the ANON PostgREST role — the same role the browser uses — so
// this asserts what a user can actually be served, not what a privileged
// query can see.

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? 'https://xqeacpakadqfxjxjcewc.supabase.co';
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

/** [positive, negative] — the negative is the half that survives a conflict. */
const PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['wheelchair-accessible', 'not-wheelchair-accessible'],
  ['step-free-entrance', 'not-step-free'],
  ['accessible-restroom', 'no-accessible-restroom'],
];

test.skip(!ANON_KEY, 'VITE_SUPABASE_ANON_KEY not set');

async function rest<T>(request: APIRequestContext, path: string): Promise<T[]> {
  const res = await request.get(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: ANON_KEY!, Authorization: `Bearer ${ANON_KEY!}` },
  });
  expect(res.ok(), `${path} -> HTTP ${res.status()}`).toBeTruthy();
  return res.json();
}

// --- positive controls -------------------------------------------------------
// "Zero contradicting pairs" also passes on an empty table, on a broken query,
// and on a corpus somebody stripped of every negative assertion. These two tests
// are what make the assertion below mean something.

test('the contradiction vocabulary is deployed and symmetric', async ({ request }) => {
  const rows = await rest<{ slug: string; contradicts: string | null; is_negative_assertion: boolean }>(
    request,
    'amenities?select=slug,contradicts,is_negative_assertion&contradicts=not.is.null',
  );
  expect(rows.length, 'public.amenities.contradicts is unseeded — the guard is not deployed').toBe(
    PAIRS.length * 2,
  );

  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  for (const [pos, neg] of PAIRS) {
    expect(bySlug.get(pos)?.contradicts, `${pos} must point at ${neg}`).toBe(neg);
    expect(bySlug.get(neg)?.contradicts, `${neg} must point at ${pos}`).toBe(pos);
    // Polarity decides which half survives. Inverted, a venue OSM says is
    // inaccessible would publish "wheelchair accessible".
    expect(bySlug.get(neg)?.is_negative_assertion, `${neg} must read as negative`).toBe(true);
    expect(bySlug.get(pos)?.is_negative_assertion, `${pos} must not read as negative`).toBe(false);
  }
});

test('negative assertions still exist in the corpus', async ({ request }) => {
  // The cheap way to make the pair count zero is to delete every negative. That
  // would be a regression, not a fix: "we checked and it is NOT accessible" is
  // more useful to a disabled traveller than silence, and it is exactly what the
  // first-class negative vocabulary exists to carry.
  let found = 0;
  for (const [, neg] of PAIRS) {
    const venues = await rest<{ id: string }>(
      request,
      `venues?select=id&accessibility_attributes=cs.{"${neg}"}&limit=1`,
    );
    const events = await rest<{ id: string }>(
      request,
      `events?select=id&accessibility_attributes=cs.{"${neg}"}&limit=1`,
    );
    found += venues.length + events.length;
  }
  expect(
    found,
    'no entity carries any negative assertion — either the corpus lost them or the query is wrong',
  ).toBeGreaterThan(0);
});

// --- the assertion -----------------------------------------------------------

for (const table of ['venues', 'events'] as const) {
  test(`no ${table} row asserts both halves of a pair`, async ({ request }) => {
    const offenders: Array<{ id: string; pair: string; values: string[] }> = [];

    for (const [pos, neg] of PAIRS) {
      // Fetch on the NEGATIVE, which is rare, then test the positive in code.
      // A `cs.{a,b}` filter would work too but reports nothing useful on failure.
      const rows = await rest<{ id: string; accessibility_attributes: string[] | null }>(
        request,
        `${table}?select=id,accessibility_attributes&accessibility_attributes=cs.{"${neg}"}`,
      );
      for (const row of rows) {
        if ((row.accessibility_attributes ?? []).includes(pos)) {
          offenders.push({ id: row.id, pair: `${pos} + ${neg}`, values: row.accessibility_attributes ?? [] });
        }
      }
    }

    expect(
      offenders,
      `${table} rows publishing contradictory access claims:\n${JSON.stringify(offenders, null, 2)}`,
    ).toEqual([]);
  });
}
