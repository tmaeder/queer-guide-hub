import { test, expect, type APIRequestContext } from '@playwright/test';

// A merged venue's old URL must still reach the reader.
//
// The venue dedup sweep merges duplicates SOFTLY: the dropped row keeps its id and
// gains `duplicate_of_id`, and its slug is written into `venue_slug_redirects`
// pointing at the survivor. Every link that ever existed to the dropped venue — a
// shared URL, a search result, a city-page card — resolves through that table. If the
// redirect is not written, or not served, the merge turns working links into 404s,
// and it does so silently: the merge itself still reports success.
//
// This became load-bearing on 2026-09-06, when the venue arms went from merging
// NOTHING (the auto gate was `both coordinates AND haversine < 150 m`, which matched
// 0 of 483 candidate pairs on a corpus where 2,665 venues share 908 placeholder
// coordinate points) to merging on corroborated address / domain / phone. A dedup
// engine that produces broken links is worse than one that produces none.
//
// Sibling of e2e/event-merge-redirect.spec.ts, deliberately structured the same way.
// Runs against the deployed site (playwright baseURL defaults to https://queer.guide)
// and reads through the ANON PostgREST role — the same role the browser uses — so it
// asserts what a reader is actually served, not what a privileged query can see.

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? 'https://xqeacpakadqfxjxjcewc.supabase.co';
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

test.skip(!ANON_KEY, 'VITE_SUPABASE_ANON_KEY not set');

async function rest<T>(request: APIRequestContext, path: string): Promise<T[]> {
  const res = await request.get(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: ANON_KEY!, Authorization: `Bearer ${ANON_KEY!}` },
  });
  expect(res.ok(), `${path} -> HTTP ${res.status()}`).toBeTruthy();
  return res.json();
}

type Redirect = { old_slug: string; venue_id: string };
type Venue = { id: string; slug: string; name: string; duplicate_of_id: string | null };

/**
 * A redirect whose target is a live (non-merged) venue, or null if none exists.
 *
 * Reads MORE redirects than the event sibling (200 vs 50) for a venue-specific
 * reason: venues in criminalizing countries carry `safety_gated = true` and their
 * RLS policy is `USING (NOT safety_gated OR auth.uid() IS NOT NULL)`, so an anon
 * lookup of a gated survivor returns an empty array rather than a row. Those
 * redirects are correctly invisible here and are skipped, not failed — but they
 * consume candidates, so the window has to be wide enough to find an ungated one.
 */
async function liveRedirect(
  request: APIRequestContext,
): Promise<{ oldSlug: string; survivor: Venue } | null> {
  const redirects = await rest<Redirect>(
    request,
    'venue_slug_redirects?select=old_slug,venue_id&limit=200',
  );
  for (const r of redirects) {
    const [survivor] = await rest<Venue>(
      request,
      `venues?select=id,slug,name,duplicate_of_id&id=eq.${r.venue_id}&limit=1`,
    );
    // The survivor must itself be live, and its slug must differ from the old one —
    // a redirect pointing at its own slug proves nothing about resolution.
    if (survivor && !survivor.duplicate_of_id && survivor.slug && survivor.slug !== r.old_slug) {
      return { oldSlug: r.old_slug, survivor };
    }
  }
  return null;
}

// --- positive control --------------------------------------------------------
// "The redirect resolved" also passes when there are no redirects to test, which is
// exactly the state the blind engine produced: nothing merged, so nothing to
// redirect. Without this control the spec below would have gone green throughout the
// months the venue arms matched zero pairs.
test('merged venues exist and carry a slug redirect', async ({ request }) => {
  const redirects = await rest<Redirect>(request, 'venue_slug_redirects?select=old_slug&limit=1');
  expect(
    redirects.length,
    'venue_slug_redirects is empty — either nothing has ever merged, or _venue_merge_core stopped writing redirects',
  ).toBeGreaterThan(0);

  const found = await liveRedirect(request);
  expect(
    found,
    'no redirect points at a live, publicly-visible venue with a different slug — the redirect table may be stale',
  ).not.toBeNull();
});

test("a merged venue's old slug resolves to its survivor", async ({ page, request }) => {
  const found = await liveRedirect(request);
  test.skip(!found, 'no resolvable redirect available (covered by the control above)');
  const { oldSlug, survivor } = found!;

  const res = await page.goto(`/venues/${oldSlug}`, { waitUntil: 'domcontentloaded' });

  // Not a 404. The edge middleware issues the SEO-correct 301; VenueDetail carries a
  // client-side fallback for in-app navigation. Either is acceptable — what must not
  // happen is the reader landing on nothing.
  expect(res?.status(), `/venues/${oldSlug} must not 404`).toBeLessThan(400);

  await page.waitForURL((url) => url.pathname === `/venues/${survivor.slug}`, { timeout: 20_000 });
  await expect(page.locator('h1').first()).toContainText(survivor.name.slice(0, 40), {
    timeout: 20_000,
  });
});

// The dropped row must be hidden from the public corpus, not merely redirected. A
// merge that writes the redirect but leaves the duplicate readable produces two live
// pages for one venue — the state the dedup engine exists to remove — and the
// redirect test above would still pass.
test('the dropped venue is no longer served as its own page', async ({ request }) => {
  const found = await liveRedirect(request);
  test.skip(!found, 'no resolvable redirect available');
  const { oldSlug, survivor } = found!;

  const rows = await rest<Venue>(
    request,
    `venues?select=id,slug,name,duplicate_of_id&slug=eq.${oldSlug}&duplicate_of_id=is.null&limit=1`,
  );
  expect(
    rows.length,
    `a LIVE venue still occupies the merged slug "${oldSlug}" — the merge did not hide the duplicate`,
  ).toBe(0);

  // ...and the survivor is genuinely reachable, so the assertion above is not passing
  // merely because both rows vanished.
  const alive = await rest<Venue>(
    request,
    `venues?select=id&id=eq.${survivor.id}&duplicate_of_id=is.null&limit=1`,
  );
  expect(alive.length, 'the survivor itself is not publicly readable').toBe(1);
});

// NOT TESTED HERE: "no auto-eligible pair is left waiting in dedup_review_queue", and
// "the arms still match something". Both need the service role — dedup_review_queue is
// admin/moderator-only under RLS, so the anon role this spec uses gets an empty array
// rather than an error, and the assertion would pass without ever having looked. That
// is the exact failure mode every control above exists to avoid. They are covered
// where the credentials are real: venue_dup_signals().open_auto_eligible and
// .would_merge, read by scripts/check-pipeline-health.mjs with the service role.
