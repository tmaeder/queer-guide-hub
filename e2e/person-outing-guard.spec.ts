import { test, expect, type APIRequestContext } from '@playwright/test';

/**
 * No living person is published asserting a queer identity we cannot source —
 * and the two performers our own repair took offline are back.
 *
 * THE INCIDENT, 2026-09-19. `#3813` correctly nulled 84 `wikidata_qid`s that
 * pointed at the wrong entity. Three of the 84 were public, living people whose
 * `lgbti_connection` asserts a positive identity label, so removing the
 * identifier left a published claim with nothing behind it and the CRITICAL
 * `person_outing_guard` went 0 -> 3. It did not self-heal: two hand-applied prod
 * repairs raced a HUMAN who re-published `alaska` through the admin UI at
 * 13:29:58, which is the 0->3->0->1->0 flicker.
 *
 * WHY THIS IS AN E2E AND NOT ONLY A GATE. `release_gate_checks()` runs as the
 * service role in CI. This reads through the ANON PostgREST role — the same role
 * the browser uses — so it asserts what a reader is actually served rather than
 * what a privileged query can see. During the incident those two answers
 * differed for twenty-three minutes.
 *
 * ONE DELIBERATE DIVERGENCE FROM THE GATE, stated rather than hidden. The gate
 * accepts EITHER a well-formed `wikidata_qid` OR a non-`SKIP_`
 * `personality_sources` row. `personality_sources` is **not anon-readable** (401),
 * so a row published on the sources arm alone offers the reader no provenance
 * they can reach either. This file therefore asserts the stricter, reader-facing
 * property: anything anon can see carries an identifier. Measured at the time of
 * writing: 1,074 such rows, **0** without one. If that ever goes non-zero
 * legitimately, it is a decision to publish an identity claim whose evidence the
 * reader cannot follow — which is worth a human look, not a loosened assertion.
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? 'https://xqeacpakadqfxjxjcewc.supabase.co';
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

/** The gate's own vocabulary of positive identity labels. */
const POSITIVE_LABELS = 'community_member,ally,activist,representation';

/** Public, living, not a duplicate, asserting a positive label. */
const COHORT =
  `personalities?is_living=eq.true&visibility=eq.public&duplicate_of_id=is.null` +
  `&lgbti_connection=in.(${POSITIVE_LABELS})`;

test.skip(!ANON_KEY, 'VITE_SUPABASE_ANON_KEY not set');

async function anon<T>(request: APIRequestContext, path: string): Promise<T[]> {
  const res = await request.get(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: ANON_KEY!, Authorization: `Bearer ${ANON_KEY!}` },
  });
  expect(res.ok(), `${path} -> HTTP ${res.status()}`).toBeTruthy();
  return res.json();
}

// --- positive control --------------------------------------------------------
// "Zero unsourced people" is equally true of an empty table, a broken filter and
// a corpus nobody publishes. Without this the assertion below means nothing.

test('the cohort the guard protects is non-empty and reachable by anon', async ({ request }) => {
  const rows = await anon<{ id: string }>(request, `${COHORT}&select=id&limit=2000`);
  expect(
    rows.length,
    'anon can see no public living person asserting a positive LGBTI label — the filter is broken or the corpus is gone, and the invariant below is vacuous',
  ).toBeGreaterThan(500);
});

// --- the invariant -----------------------------------------------------------

test('no anon-visible living person asserts a queer identity without an identifier', async ({
  request,
}) => {
  const missing = await anon<{ slug: string; name: string; lgbti_connection: string }>(
    request,
    `${COHORT}&wikidata_qid=is.null&select=slug,name,lgbti_connection&limit=50`,
  );
  expect(
    missing.map((r) => r.slug),
    'published identity claim with no identifier a reader can follow',
  ).toEqual([]);

  // A malformed identifier is the same exposure as a missing one: the gate tests
  // `~ '^Q[0-9]+$'`, so a `SKIP_<uuid>` sentinel does NOT satisfy it.
  const malformed = await anon<{ slug: string; wikidata_qid: string }>(
    request,
    `${COHORT}&wikidata_qid=not.like.Q*&select=slug,wikidata_qid&limit=50`,
  );
  expect(
    malformed.map((r) => `${r.slug}=${r.wikidata_qid}`),
    'published identity claim whose identifier is not a Wikidata QID',
  ).toEqual([]);
});

// --- the three rows the incident ran through ---------------------------------

test('the two performers whose provenance came back are published again', async ({ request }) => {
  const rows = await anon<{
    slug: string;
    visibility: string;
    seo_indexable: boolean;
    wikidata_qid: string | null;
  }>(
    request,
    'personalities?slug=in.(bones,spice)&select=slug,visibility,seo_indexable,wikidata_qid',
  );

  expect(rows.map((r) => r.slug).sort(), 'bones and spice are not anon-visible').toEqual([
    'bones',
    'spice',
  ]);
  for (const r of rows) {
    expect(r.visibility, `${r.slug} is still unpublished`).toBe('public');
    expect(r.seo_indexable, `${r.slug} is still deindexed`).toBe(true);
    // Verified live on the two gates `_shared/tag-wiki-guard.ts` requires — the
    // entity must be a human and its label must agree with the published name:
    //   Q136296831 "Bones" P31=Q5 British drag performer
    //   Q116205118 "Spice" P31=Q5 American drag queen
    expect(r.wikidata_qid, `${r.slug} is published without an identifier`).toMatch(/^Q\d+$/);
  }
});

test('the merged duplicate a human re-published is not served to anyone', async ({ request }) => {
  // `alaska` carried Q797 — the US STATE — and is a thin import duplicate of
  // `alaska-thunderfuck-5000`, which holds the real Q16029552. It cannot hold
  // that identifier (the column is UNIQUE), so publishing it asserts an identity
  // with no provenance. A human republished it at 13:29:58 and nothing stopped
  // them; it is merged away now.
  const dup = await anon<{ slug: string; visibility: string; duplicate_of_id: string | null }>(
    request,
    'personalities?slug=eq.alaska&select=slug,visibility,duplicate_of_id',
  );
  for (const r of dup) {
    expect(r.visibility, 'the merged duplicate is public again').not.toBe('public');
  }

  // Positive control for the same query shape: the canonical row IS served, so a
  // zero above cannot come from a filter that matches nothing.
  const canonical = await anon<{ slug: string; visibility: string; wikidata_qid: string }>(
    request,
    'personalities?slug=eq.alaska-thunderfuck-5000&select=slug,visibility,wikidata_qid',
  );
  expect(canonical, 'the canonical row is not anon-visible — the control is dead').toHaveLength(1);
  expect(canonical[0].visibility).toBe('public');
  expect(canonical[0].wikidata_qid).toBe('Q16029552');
});

// --- what a reader and a crawler actually get --------------------------------

test('the restored pages render on prod', async ({ page }) => {
  // Asserted on the TITLE rather than on an <h1> becoming visible. The title is
  // injected per request by functions/_lib/detail.ts, so it is deterministic;
  // waiting for the SPA's <h1> races hydration and flaked once under parallel
  // workers while passing on every serial run. A flaky trust-&-safety spec
  // teaches people to re-run it, which is the failure mode this whole incident
  // was about.
  for (const [slug, name] of [
    ['bones', 'Bones'],
    ['spice', 'Spice'],
  ] as const) {
    const res = await page.goto(`/personality/${slug}`, { waitUntil: 'domcontentloaded' });
    expect(res?.status(), `/personality/${slug} -> HTTP ${res?.status()}`).toBeLessThan(400);
    // A draft row serves the not-found shell, whose title is not the person's name.
    await expect(page).toHaveTitle(new RegExp(name));
    await expect(page.locator('body')).not.toContainText(/page not found/i);
  }
});
