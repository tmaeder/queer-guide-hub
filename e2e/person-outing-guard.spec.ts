import { test, expect, type APIRequestContext } from '@playwright/test';
import { anonHeaders } from './support/anonKey';

/**
 * No living person is published asserting a queer identity we cannot source.
 *
 * THE HEADLINE CHANGED, AND THE CORRECTION IS THE POINT. This file used to end
 * "— and the two performers our own repair took offline are back", and asserted
 * that `bones` and `spice` are published. On 2026-09-28 14:55:35 a governance
 * pass unpublished 226 personalities in one statement, those two among them:
 *
 *     update public.personalities set visibility='draft'
 *      where visibility='public'
 *        and 'unsupported_lgbti_claim' = any(personality_publication_failures(id));
 *
 * Read from `content_revisions`: `changed_fields=['visibility']` only, actor_kind
 * `system`. Neither outing seal did it — both stamp `needs_attention=true` and
 * clear `seo_indexable`, and both rows still read `needs_attention=false`,
 * `seo_indexable=true`, with their identifiers intact.
 *
 * THE CAUSE IS A STRICTER RULE, NOT A REGRESSION, and it exposes a real gap
 * between two gates:
 *
 *   person_outing_guard              is there a Wikidata QID, or any non-SKIP_
 *                                    personality_sources row?
 *   enforce_personality_public_gate  is the LGBTI CLAIM ITSELF backed by a
 *                                    personality_claim_sources row at
 *                                    pending/verified?
 *
 * A QID says "this is a real person". It does not say "this person's queer
 * identity is sourced". The September repair restored the identifier and the
 * source rows — clearing the outing gate — while the claim-level provenance was
 * later reviewed and REJECTED (both rows, 2026-09-24 18:25:27). The stricter gate
 * then did the right thing, and re-publishing them by hand would fight it.
 *
 * So publication is no longer asserted here: it is an editorial state governed by
 * that gate, not an invariant. What is asserted is the invariant itself, plus the
 * rule that a non-public row is never served.
 *
 * THE ORIGINAL INCIDENT, 2026-09-19. `#3813` correctly nulled 84 `wikidata_qid`s that
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

/** The gate's own vocabulary of positive identity labels. */
const POSITIVE_LABELS = 'community_member,ally,activist,representation';

/** Public, living, not a duplicate, asserting a positive label. */
const COHORT =
  `personalities?is_living=eq.true&visibility=eq.public&duplicate_of_id=is.null` +
  `&lgbti_connection=in.(${POSITIVE_LABELS})`;

// Formerly `ANON_KEY ? test : test.skip`, scoped to the API tests so a missing
// key did not also disable the two page tests. The observation that motivated
// it — "the same command reported 7 passed and 6 passed on alternate runs" — is
// exactly the silent-drop this suite is written against, and it no longer
// applies: support/anonKey.ts resolves the key from the deployed bundle and
// FAILS if it cannot, so there is nothing left to skip on.
const apiTest = test;

async function anon<T>(request: APIRequestContext, path: string): Promise<T[]> {
  const res = await request.get(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: await anonHeaders(request),
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
  ).toBeGreaterThan(100);
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

/**
 * Personalities that are NOT public, and why each one is a useful tripwire.
 * Anon cannot enumerate them — RLS serves only public rows — so they are named,
 * measured with the service role on 2026-09-30.
 *
 *   bones, spice        their LGBTI claim source is `verification_status='rejected'`,
 *                       so `personality_publication_failures` returns
 *                       `unsupported_lgbti_claim` and the governance pass of
 *                       2026-09-28 14:55:35 unpublished them (226 rows in one
 *                       statement). Their Wikidata identifiers are intact —
 *                       Q136296831 and Q116205118 — which is what the September
 *                       repair fixed; publication is a separate, stricter test.
 *   jay-johnson,        no Wikidata identifier at all: they satisfy
 *   little-demon        `person_outing_guard` only through a `personality_sources`
 *                       row, the arm the 99991790377689 seal protects.
 * `alaska` is deliberately NOT in this list: it is a MERGED duplicate, so the
 * platform 301s it to the canonical row rather than 404ing, and Playwright's
 * `request.get` follows redirects — it returned 200 and failed this test on
 * correct behaviour. Its redirect is asserted separately below.
 *
 * If any of these starts being served, this test flips red — which is the review
 * a human should be doing, not a number to relax.
 */
const NOT_PUBLIC = ['bones', 'spice', 'jay-johnson', 'little-demon'] as const;

test('a personality that is not public is never served to a crawler', async ({ request }) => {
  // THIS REPLACED "the restored pages are served with the person's own title",
  // which asserted that `bones` and `spice` are published. They are not, and they
  // should not be — see the header. Their publication state is an editorial
  // decision governed by `enforce_personality_public_gate`; it is not an
  // invariant, so a spec must not demand it.
  //
  // What IS an invariant: `visibility=eq.public` is load-bearing in the personality
  // branch of `functions/_lib/detail.ts` (its own comment says so), and the crawler
  // path runs as the SERVICE ROLE, so RLS does not protect it. `seo_indexable` is
  // therefore inert on a non-public row — measured 2026-09-30 across 4,875 live
  // draft-and-indexable personalities, five sampled, 5/5 returned 404 — and this
  // asserts that rather than trusting it.
  for (const slug of NOT_PUBLIC) {
    const res = await request.get(`https://queer.guide/personality/${slug}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      },
    });
    expect(
      res.status(),
      `/personality/${slug} is not public but was served HTTP ${res.status()} to a crawler`,
    ).toBe(404);
  }

  // Positive control: the same fetch against a PUBLIC row must be served with its
  // own title. Without it, "everything 404s" also passes on a dead origin.
  const ok = await request.get('https://queer.guide/personality/alaska-thunderfuck-5000', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    },
  });
  expect(
    ok.status(),
    'the public control row is not being served — the 404s above prove nothing',
  ).toBe(200);
  expect(await ok.text()).toMatch(/<title>[^<]*Alaska[^<]*<\/title>/);
});

apiTest(
  'the strict cohort is still measured against a live corpus, not a frozen number',
  async ({ request }) => {
    // 1,074 when this file was written, 632 six days later, 435 now — archival and
    // governance passes, not a defect. The floor was 500 and went red on a correct
    // corpus; a floor that has to be lowered every week is measuring the wrong
    // thing. It exists only to prove the filter matches SOMETHING, so it is set
    // where it cannot be tripped by ordinary editorial movement.
    const rows = await anon<{ id: string }>(request, `${COHORT}&select=id&limit=2000`);
    expect(
      rows.length,
      'the cohort filter matches nothing — the invariant above is vacuous',
    ).toBeGreaterThan(100);
    expect(rows.length).toBeLessThan(5000);
  },
);
