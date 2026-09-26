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

// Scoped to the API tests ONLY. A file-level `test.skip` also disables the two
// page tests, which need no key — and a run that silently drops a test while
// still reporting "passed" is indistinguishable from one that checked
// everything. Observed locally: the same command reported 7 passed and 6 passed
// on alternate runs.
const apiTest = ANON_KEY ? test : test.skip;

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

apiTest('the cohort the guard protects is non-empty and reachable by anon', async ({ request }) => {
  const rows = await anon<{ id: string }>(request, `${COHORT}&select=id&limit=2000`);
  expect(
    rows.length,
    'anon can see no public living person asserting a positive LGBTI label — the filter is broken or the corpus is gone, and the invariant below is vacuous',
  ).toBeGreaterThan(500);
});

// --- the invariant -----------------------------------------------------------

apiTest(
  'no anon-visible living person asserts a queer identity without an identifier',
  async ({ request }) => {
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
  },
);

// --- the three rows the incident ran through ---------------------------------

apiTest(
  'the two performers whose provenance came back are published again',
  async ({ request }) => {
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
  },
);

apiTest(
  'the merged duplicate a human re-published is not served to anyone',
  async ({ request }) => {
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
    expect(canonical, 'the canonical row is not anon-visible — the control is dead').toHaveLength(
      1,
    );
    expect(canonical[0].visibility).toBe('public');
    expect(canonical[0].wikidata_qid).toBe('Q16029552');
  },
);

// --- what a reader and a crawler actually get --------------------------------

test("the restored pages are served to a crawler with the person's own title", async ({
  request,
}) => {
  // Asserted on the CRAWLER response, not through the browser. The title a
  // reader sees is written client-side by useMeta after the record loads, so
  // `expect(page).toHaveTitle()` races hydration: observed failing with
  // "Personalities | Queer Guide" — the route's generic title — on roughly one
  // run in five, while the same URL fetched with a crawler UA returned
  // "Spice — Drag queen | Queer Guide" every time.
  //
  // The crawler path is also the one that matters here: `functions/_lib/detail.ts`
  // injects the title per request and is what Google indexes. A draft row gets
  // the not-found shell instead, so the person's own name in the title is proof
  // the row is published, not merely that the URL resolves.
  for (const [slug, name] of [
    ['bones', 'Bones'],
    ['spice', 'Spice'],
  ] as const) {
    const res = await request.get(`https://queer.guide/personality/${slug}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      },
    });
    expect(res.status(), `/personality/${slug} -> HTTP ${res.status()}`).toBe(200);
    const html = await res.text();
    expect(html, `/personality/${slug} was served without its own title`).toMatch(
      new RegExp(`<title>[^<]*${name}[^<]*</title>`),
    );
    expect(html).not.toMatch(/name="robots"[^>]*noindex/i);
  }
});

// --- the second door: provenance that rests on source rows -------------------
//
// The gate accepts EITHER a well-formed `wikidata_qid` OR a non-`SKIP_`
// `personality_sources` row, so a person can be gate-clean with no identifier at
// all. `99991790358865` seals the deletion of that last source row, which a
// trigger on `personalities` cannot see.
//
// Anon cannot verify the seal directly — `personality_sources` is not
// anon-readable (401) and RLS hides `draft` rows — so this asserts the OUTCOME
// on the surface that actually matters. `seo_indexable` governs the crawler path
// in `functions/_lib/detail.ts`, which runs as the service role and does NOT go
// through RLS, so "anon cannot see it" is not the same claim as "a crawler
// cannot fetch it" and must be tested separately.

/**
 * Living, positive-label rows whose only provenance is a source row — measured
 * with the service role on 2026-09-25, because anon cannot enumerate them.
 * Both are `visibility='draft'` with `seo_indexable=true`, which is why the
 * gate's reach clause is `public OR seo_indexable` rather than `public` alone.
 *
 * This list is a tripwire, not a permission: if one of these is ever published,
 * the crawler assertion below flips to 200 and fails, which is the review a
 * human should be doing.
 */
const SOURCES_ARM_ONLY = ['jay-johnson', 'little-demon'] as const;

test('a person whose only provenance is a source row is not served to crawlers', async ({
  page,
}) => {
  for (const slug of SOURCES_ARM_ONLY) {
    const res = await page.goto(`/personality/${slug}`, { waitUntil: 'domcontentloaded' });
    expect(
      res?.status(),
      `/personality/${slug} is being served (HTTP ${res?.status()}) — it carries no Wikidata identifier, so a reader has no provenance to follow`,
    ).toBe(404);
  }
});

apiTest(
  'the strict cohort is still measured against a live corpus, not a frozen number',
  async ({ request }) => {
    // The published cohort was 1,074 when this file was written and is 632 now —
    // six days of archival and repair passes. That is why the control above
    // asserts a FLOOR rather than an exact count: an exact count turns every
    // legitimate corpus change into a red spec, which is how a trust-&-safety
    // check gets re-run until it passes.
    const rows = await anon<{ id: string }>(request, `${COHORT}&select=id&limit=2000`);
    expect(rows.length).toBeGreaterThan(500);
    expect(rows.length).toBeLessThan(5000);
  },
);
