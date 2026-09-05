import { test, expect, type APIRequestContext } from '@playwright/test';

// A merged event's old URL must still reach the reader.
//
// The event dedup sweep merges duplicates SOFTLY: the dropped row keeps its id and
// gains `duplicate_of_id`, and its slug is written into `event_slug_redirects`
// pointing at the survivor. Every link that ever existed to the dropped event — a
// shared URL, a search result, an index entry — resolves through that table. If the
// redirect is not written, or not served, the merge turns working links into 404s,
// and it does so silently: the merge itself still reports success.
//
// This became load-bearing on 2027-06-02, when the sweep went from merging NOTHING
// for eleven days (both auto arms matched zero pairs) to merging on
// `exact_instant_same_city`. A dedup engine that produces broken links is worse than
// one that produces none.
//
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

type Redirect = { old_slug: string; event_id: string };
type Event = { id: string; slug: string; title: string; duplicate_of_id: string | null };

/** A redirect whose target is a live (non-merged) event, or null if none exists. */
async function liveRedirect(
  request: APIRequestContext,
): Promise<{ oldSlug: string; survivor: Event } | null> {
  const redirects = await rest<Redirect>(
    request,
    'event_slug_redirects?select=old_slug,event_id&limit=50',
  );
  for (const r of redirects) {
    const [survivor] = await rest<Event>(
      request,
      `events?select=id,slug,title,duplicate_of_id&id=eq.${r.event_id}&limit=1`,
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
// exactly the state the eleven-day outage produced: nothing merged, so nothing to
// redirect. Without this control the spec below would have gone green throughout the
// incident it exists to catch.
test('merged events exist and carry a slug redirect', async ({ request }) => {
  const redirects = await rest<Redirect>(request, 'event_slug_redirects?select=old_slug&limit=1');
  expect(
    redirects.length,
    'event_slug_redirects is empty — either nothing has ever merged, or the merge core stopped writing redirects',
  ).toBeGreaterThan(0);

  const found = await liveRedirect(request);
  expect(
    found,
    'no redirect points at a live event with a different slug — the redirect table may be stale',
  ).not.toBeNull();
});

test("a merged event's old slug resolves to its survivor", async ({ page, request }) => {
  const found = await liveRedirect(request);
  test.skip(!found, 'no resolvable redirect available (covered by the control above)');
  const { oldSlug, survivor } = found!;

  const res = await page.goto(`/events/${oldSlug}`, { waitUntil: 'domcontentloaded' });

  // Not a 404. The edge middleware issues the SEO-correct 301; EventDetail carries a
  // client-side fallback for in-app navigation. Either is acceptable — what must not
  // happen is the reader landing on nothing.
  expect(res?.status(), `/events/${oldSlug} must not 404`).toBeLessThan(400);

  await page.waitForURL((url) => url.pathname === `/events/${survivor.slug}`, { timeout: 20_000 });
  await expect(page.locator('h1').first()).toContainText(survivor.title.slice(0, 40), {
    timeout: 20_000,
  });
});

// NOT TESTED HERE: "no auto-eligible pair is left waiting in dedup_review_queue".
// That table is admin/moderator-only under RLS, so the anon role this spec uses gets
// an empty array rather than an error — the assertion would pass without ever having
// looked, which is the failure mode every control above exists to avoid. It is
// covered where the credentials are real: event_dup_signals().open_auto_eligible,
// read by scripts/check-pipeline-health.mjs with the service role.
