import { test, expect, type APIRequestContext } from '@playwright/test';
import { anonHeaders } from './support/anonKey';

// An approved editorial hook must publish WHOLE.
//
// `review_field_registry` carried apply_mode='text_truncated' with max_len 120 for
// city.editorial_hook, and `_apply_review_value` implements that mode as a bare
// `left($1, 120)` — a hard character cut, no word boundary, no ellipsis. The 120 was
// never a hard limit: `cities.editorial_hook` is unbounded `text` and the admin editor
// for this very field accepts maxLength 140 while labelling 120 "recommended". So an
// editorial RECOMMENDATION was acting as a silent destructive write, on a field that is
// `batchable=true` and therefore reachable by the machine batch approver unattended.
//
// It had already damaged a human decision. Measured on prod 2026-10-03, a hook approved
// by hand on 2026-10-01 19:24 published as
//   'Khandwa’s rails cross like old stories — … now trains carry the Nimar region forw'
// — exactly 120 characters, cut at "forw".
//
// WHAT THIS ASSERTS, AND WHY IT IS SHAPED THIS WAY.
//
// The obvious spec — "no live hook is exactly 120 characters" — is the mistake
// `geo-namesake-city-links.spec.ts` opens by warning about, in the other direction: it
// pins the BACKLOG rather than the fix. 11 such rows exist today and are deliberately
// not repaired here (each needs a complete hook or a NULL, and bulk-rewriting published
// prose is the experiment this repo retired). A spec that fails on them is red on
// arrival and gets scrolled past.
//
// So the invariant asserted is about GROWTH, not depth: the count of mid-word-cut hooks
// may never EXCEED the baseline that existed when the cutting mode was removed. That
// fails loudly if the mode is ever re-adopted, and stays green while the known 11 are
// worked down by hand.
//
// Read through the ANON PostgREST role — the role a visitor's browser uses — so this
// asserts what a reader can actually be served rather than what a privileged query sees.

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? 'https://xqeacpakadqfxjxjcewc.supabase.co';

/** The cap the retired `text_truncated` mode cut at. A cut hook lands on it exactly. */
const OLD_CAP = 120;

/**
 * Live hooks sitting exactly on the cap when the mode was removed: 12, of which 11 are
 * genuinely cut and one (Daphne) is a complete sentence that happens to be 120 and ends
 * in a full stop. The invariant is "no more than this", so a later hand-repair only ever
 * makes it pass harder.
 */
const CUT_BASELINE = 12;

/** The four hooks a human approved on 2026-10-01, by slug and published length. */
const APPROVED = [
  { slug: 'cremorne-point', len: 107 },
  { slug: 'da-nang', len: 89 },
  { slug: 'daegu', len: 75 },
  { slug: 'djibouti-city', len: 84 },
];

async function anonRows(
  request: APIRequestContext,
  path: string,
): Promise<Record<string, unknown>[]> {
  const res = await request.get(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: await anonHeaders(request),
  });
  expect(res.ok(), `anon read failed for ${path}: ${res.status()} ${await res.text()}`).toBe(true);
  return (await res.json()) as Record<string, unknown>[];
}

test.describe('city editorial_hook publishes whole', () => {
  // POSITIVE CONTROL. Every assertion below is a bound on a filtered count, and all of
  // them are trivially satisfied by a corpus the anon role cannot read at all. Prove the
  // role can see published hooks before trusting any of it.
  test('anon can read published city hooks', async ({ request }) => {
    const rows = await anonRows(
      request,
      'cities?select=id&editorial_hook=not.is.null&duplicate_of_id=is.null&limit=200',
    );
    expect(rows.length).toBeGreaterThan(50);
  });

  test('mid-word-cut hooks never exceed the baseline', async ({ request }) => {
    const rows = await anonRows(
      request,
      `cities?select=name,slug,editorial_hook&duplicate_of_id=is.null` +
        `&editorial_hook=not.is.null&limit=2000`,
    );

    // A hook is CUT when it lands exactly on the old cap and does not end like a
    // finished sentence. Length alone would flag Daphne, which is 120 and complete.
    const cut = rows.filter((r) => {
      const h = String(r.editorial_hook ?? '');
      return h.length === OLD_CAP && !/[.!?…"”’)]$/.test(h.trim());
    });

    expect(
      cut.length,
      `mid-word-cut hooks grew past the baseline — the cutting apply_mode may be back.\n` +
        cut.map((r) => `  /city/${r.slug}: …${String(r.editorial_hook).slice(-34)}`).join('\n'),
    ).toBeLessThanOrEqual(CUT_BASELINE);
  });

  test('anon cannot read the review queue', async ({ request }) => {
    // This test started life as the sharper form of the truncation invariant — compare
    // every APPROVED proposal against the published text and fail on a bare prefix. The
    // anon role cannot read `city_review_queue` at all (401 42501, measured on prod),
    // which is CORRECT: the queue carries unreviewed machine proposals and a reviewer's
    // notes. So that comparison belongs to a privileged probe, not here.
    //
    // Rather than leave a `test.skip` that asserts nothing — the silent-pass failure this
    // whole suite is written against, and the exact reason `support/anonKey.ts` exists —
    // the test now asserts the property that IS true and worth guarding from this role:
    // the queue is closed to anonymous reads. The truncation invariant is covered from
    // the reader's side by the mid-word-cut test above, which needs no queue access.
    const res = await request.get(
      `${SUPABASE_URL}/rest/v1/city_review_queue?select=city_id&limit=1`,
      { headers: await anonHeaders(request) },
    );
    expect(
      res.ok(),
      `anon could READ city_review_queue (${res.status()}) — unreviewed proposals and ` +
        `reviewer notes must not be publicly readable`,
    ).toBe(false);
    expect([401, 403, 404]).toContain(res.status());

    // Control: the same key on the same host CAN read a public table, so the refusal
    // above is a grant decision and not a dead key or a wrong URL.
    const control = await request.get(`${SUPABASE_URL}/rest/v1/cities?select=id&limit=1`, {
      headers: await anonHeaders(request),
    });
    expect(control.ok(), 'control read of `cities` failed — the anon key is not working').toBe(
      true,
    );
  });

  test('the four hooks approved on 2026-10-01 are published complete', async ({ request }) => {
    // The positive half. An invariant about cuts is equally satisfied by a corpus with no
    // hooks at all, so pin the known-good outcomes too.
    const rows = await anonRows(
      request,
      `cities?select=slug,editorial_hook&slug=in.(${APPROVED.map((a) => a.slug).join(',')})`,
    );
    expect(rows.length).toBe(APPROVED.length);
    for (const want of APPROVED) {
      const got = rows.find((r) => r.slug === want.slug);
      const hook = String(got?.editorial_hook ?? '');
      expect(hook.length, `/city/${want.slug} hook length`).toBe(want.len);
      expect(hook.length, `/city/${want.slug} must not sit on the old cap`).toBeLessThan(OLD_CAP);
    }
  });

  test('a rejected rating never reaches the city page', async ({ request }) => {
    // The other half of the triage pass: 13 lgbt_friendly_rating proposals were rejected
    // across both batches. None of those cities may carry a rating.
    //
    // THE SLUG LIST IS NO LONGER THE ASSERTION, and khandwa is why. It was rejected
    // SEVEN times (2026-10-01 x3, 10-02 x2, 10-03, by humans and by auto-triage) and then
    // a human APPROVED rating 3 on 2026-10-04 17:28. The city carries it because someone
    // decided it should. A frozen "these must all be null" list turns that decision into
    // a nightly failure, and "fixing" the data to match would be reverting a human review
    // to satisfy a test.
    //
    // The invariant is the one that actually matters and is stronger than the old one: a
    // published rating must be HUMAN-APPROVED. `approve_city_review` stamps
    // field_provenance.lgbt_friendly_rating.source = 'llm+human', so a rating written
    // past a rejection — the regression this guards — carries no such stamp and still
    // fails. The review queue itself is not readable as anon, correctly, which is why
    // this is asked of the row the reader is served.
    const slugs = [
      'chongqing',
      'clarkefield',
      'cremorne-point',
      'da-nang',
      'daegu',
      'djibouti-city',
      'khandwa',
      'burbank',
      'culver-city',
      'huntington-park',
      'sierra-madre',
      'badalona',
    ];
    const rows = await anonRows(
      request,
      `cities?select=slug,lgbt_friendly_rating,best_time_to_visit,field_provenance` +
        `&slug=in.(${slugs.join(',')})`,
    );
    expect(rows.length).toBeGreaterThan(8); // control: the slugs resolve

    for (const r of rows) {
      if (r.lgbt_friendly_rating == null) continue;
      const prov = (r.field_provenance as Record<string, { source?: string }> | null)
        ?.lgbt_friendly_rating;
      expect(
        prov?.source,
        `/city/${r.slug} publishes rating ${r.lgbt_friendly_rating} with no human approval ` +
          `on the row (provenance source: ${prov?.source ?? 'none'})`,
      ).toBe('llm+human');
    }
    // Da Nang's "January to August" and Sierra Madre's three-month bloom window were both
    // rejected, so neither city may carry a best_time_to_visit from this producer.
    for (const slug of ['da-nang', 'sierra-madre']) {
      const r = rows.find((x) => x.slug === slug);
      if (r) expect(r.best_time_to_visit, `/city/${slug} best_time_to_visit`).toBeNull();
    }
  });
});
