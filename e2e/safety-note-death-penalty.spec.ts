import { test, expect, type APIRequestContext } from '@playwright/test';
import { deathPenaltyRisk } from '../src/utils/equalityScore';

// A published safety note must never bury a death penalty in a parenthetical.
//
// `20260904203201` established that "death" is THREE states: ILGA splits the
// fact across `death_penalty` and `penalty`, and AF/AE/PK/QA/SO are
// `death_penalty='No legal certainty'` with `penalty='Death Penalty (possible)'`
// — ILGA recording that it cannot rule out execution, which every `='Yes'` test
// reads as identical to `No`. That migration fixed `death_penalty_risk()` and
// `location_is_high_risk()` and NEVER TOUCHED `compose_safety_note()`, which is
// what writes the prose a reader sees. Measured on prod a year later, 8 of 8
// published notes in those five countries still rendered the death penalty as
// "(penalty: Death Penalty (possible))" at tier `high`, while the 7 `confirmed`
// countries buried 0 of 6 — the split that proves the boolean was the mechanism.
// Fixed in 20470922084500.
//
// Read through the ANON PostgREST role — the same role the browser uses — so
// this asserts what an anonymous reader is actually served, not what a
// privileged query can see. The defect was reachable by anon: Karachi, Dubai
// and International City all served the buried form.
//
// The verdict comes from `deathPenaltyRisk()`, which is drift-tested against
// the SQL by `src/lib/__tests__/deathPenaltyRiskSqlParity.test.ts`. It is
// imported rather than restated: the branch ORDER is load-bearing (the
// affirmative `death_penalty` test must precede the `penalty` fallback or
// Nigeria breaks), and a copy here would be a fourth implementation of it.

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? 'https://xqeacpakadqfxjxjcewc.supabase.co';
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

/** The composer's own signature for the defect: a penalty naming death, inside a parenthetical. */
const BURIED = /\(penalty:[^)]*death/i;

type Country = {
  id: string;
  code: string;
  name: string;
  lgbti_criminalization: Record<string, unknown> | null;
};
type City = { name: string; country_id: string; safety_notes: string | null };

test.skip(!ANON_KEY, 'VITE_SUPABASE_ANON_KEY not set');

async function rest<T>(request: APIRequestContext, path: string): Promise<T[]> {
  const res = await request.get(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: ANON_KEY!, Authorization: `Bearer ${ANON_KEY!}` },
  });
  expect(res.ok(), `${path} -> HTTP ${res.status()}`).toBeTruthy();
  return res.json();
}

/** Countries grouped by death-penalty verdict, and the published notes in each. */
async function load(request: APIRequestContext) {
  const countries = await rest<Country>(
    request,
    'countries?select=id,code,name,lgbti_criminalization',
  );

  const byRisk = { confirmed: [] as Country[], possible: [] as Country[] };
  for (const c of countries) {
    const r = deathPenaltyRisk(c.lgbti_criminalization);
    if (r === 'confirmed' || r === 'possible') byRisk[r].push(c);
  }

  const ids = [...byRisk.confirmed, ...byRisk.possible].map((c) => c.id);
  const cities = ids.length
    ? await rest<City>(
        request,
        `cities?select=name,country_id,safety_notes&country_id=in.(${ids.join(',')})` +
          `&safety_notes=not.is.null&duplicate_of_id=is.null&limit=1000`,
      )
    : [];

  const nameById = new Map(countries.map((c) => [c.id, c.name]));
  const riskById = new Map<string, 'confirmed' | 'possible'>();
  for (const c of byRisk.confirmed) riskById.set(c.id, 'confirmed');
  for (const c of byRisk.possible) riskById.set(c.id, 'possible');

  return { byRisk, cities, nameById, riskById };
}

// --- positive controls -------------------------------------------------------
// "Zero buried penalties" also passes on an empty result, a broken filter, and a
// corpus with no death-penalty countries left in it. These two are what make the
// assertions below mean anything.

test('both death-penalty cohorts exist and carry published notes', async ({ request }) => {
  const { byRisk, cities, riskById } = await load(request);

  expect(
    byRisk.confirmed.length,
    'no country resolves to `confirmed` — the vocabulary or the query is broken',
  ).toBeGreaterThan(0);
  expect(
    byRisk.possible.length,
    'no country resolves to `possible` — this is the cohort the fix exists for',
  ).toBeGreaterThan(0);

  const possibleNotes = cities.filter((c) => riskById.get(c.country_id) === 'possible');
  expect(
    possibleNotes.length,
    'no published note in a `possible` country — the assertion below would be vacuous',
  ).toBeGreaterThan(0);
});

test('the `confirmed` cohort states the death penalty as a fact', async ({ request }) => {
  // The control that proves the corpus is readable and the wording is findable:
  // these notes were always correct, because there `='Yes'` is true and the good
  // branch fired. If this goes red the query shape is wrong, not the data.
  const { cities, riskById, nameById } = await load(request);
  const confirmed = cities.filter((c) => riskById.get(c.country_id) === 'confirmed');
  test.skip(confirmed.length === 0, 'no published notes in `confirmed` countries');

  const silent = confirmed.filter((c) => !/death penalty/i.test(c.safety_notes ?? ''));
  expect(
    silent.map((c) => `${c.name} (${nameById.get(c.country_id)})`),
    'a note in a confirmed death-penalty country never mentions it',
  ).toEqual([]);
});

// --- the invariant -----------------------------------------------------------

test('no published safety note buries a death penalty in a parenthetical', async ({ request }) => {
  const { cities, riskById, nameById } = await load(request);

  const buried = cities
    .filter((c) => BURIED.test(c.safety_notes ?? ''))
    .map((c) => `${c.name} (${nameById.get(c.country_id)}, ${riskById.get(c.country_id)})`);

  expect(
    buried,
    'a death penalty rendered as "(penalty: …)" reads as a footnote, not as the ' +
      'headline fact a reader needs before travelling',
  ).toEqual([]);
});

test('every note in a `possible` country mentions the death penalty at all', async ({ request }) => {
  // PRESENCE, not placement — deliberately. The buried form contains the string
  // too, so this test passes on the defect and the one above is what catches it.
  // It earns its place by covering the other direction: a note that drops the
  // fact entirely, which no parenthetical check would ever see.
  const { cities, riskById, nameById } = await load(request);
  const possible = cities.filter((c) => riskById.get(c.country_id) === 'possible');

  const silent = possible
    .filter((c) => !/death penalty/i.test(c.safety_notes ?? ''))
    .map((c) => `${c.name} (${nameById.get(c.country_id)})`);

  expect(
    silent,
    'ILGA records that execution cannot be ruled out in these countries; a note ' +
      'that never says so understates the risk',
  ).toEqual([]);
});
