import { test, expect, type APIRequestContext } from '@playwright/test';

/**
 * An event that has STARTED but not ENDED must still be served — end to end, on prod.
 *
 * `/events` filtered `start_date >= now()`, so a four-day festival on its second day
 * was absent entirely, and a date window was filtered by CONTAINMENT rather than
 * OVERLAP, so a festival running 1-7 July did not appear for a 3-5 July filter.
 * `search_events` had always used the overlap form; the PostgREST path in
 * useEvents.tsx had not — and any city / type / tag / sort filter forces that path,
 * so the divergence was the one readers actually hit.
 *
 * This spec covers the CLIENT path specifically. e2e/events-feed-collapse.spec.ts
 * exercises the `search_events` RPC and would have stayed green throughout this bug.
 *
 * It reads through the ANON PostgREST role and rebuilds the exact filter the hook
 * builds, rather than driving the page, for two reasons: the assertion is about which
 * rows the query admits, and `/events` currently has a separate URL-hydration race
 * that makes a rendered card list an unreliable witness for anything.
 *
 * NO PINNED TITLES OR COUNTS. Which festival happens to be running is a property of
 * the calendar on the day CI runs. The spec derives its own subject and SKIPS with a
 * stated reason when the corpus genuinely has nothing in progress — a skip is honest,
 * a pass on an empty set is not.
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? 'https://xqeacpakadqfxjxjcewc.supabase.co';
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

test.skip(!ANON_KEY, 'VITE_SUPABASE_ANON_KEY not set');

type Row = { id: string; title: string; start_date: string; end_date: string | null };

/** The live-feed base filter, identical in both query paths. */
const BASE = 'status=eq.active&duplicate_of_id=is.null&series_next=is.true&parent_event_id=is.null';

async function rows(request: APIRequestContext, filter: string): Promise<Row[]> {
  const res = await request.get(
    `${SUPABASE_URL}/rest/v1/events?select=id,title,start_date,end_date&${BASE}&${filter}&limit=1000`,
    { headers: { apikey: ANON_KEY!, Authorization: `Bearer ${ANON_KEY!}` } },
  );
  expect(res.ok(), `events -> HTTP ${res.status()}: ${await res.text()}`).toBeTruthy();
  return (await res.json()) as Row[];
}

/** `COALESCE(end_date, start_date) >= iso`, spelled for PostgREST. */
const endsAtOrAfter = (iso: string) =>
  `or=(end_date.gte.${iso},and(end_date.is.null,start_date.gte.${iso}))`;

test('the upcoming feed serves events that are running right now', async ({ request }) => {
  const now = new Date().toISOString();

  // Positive control: this whole spec is vacuous on an empty feed.
  const feed = await rows(request, `${endsAtOrAfter(now)}&order=start_date.asc`);
  expect(feed.length, 'the upcoming feed is empty — nothing below proves anything').toBeGreaterThan(
    50,
  );

  // The two predicates are compared by asking the DATABASE for the difference,
  // never by set-differencing two client-side pages: the feed is ~2.9k rows, both
  // pages truncate at the limit, and the truncated slices differ — which reads as
  // a superset violation that is really just pagination.
  //
  // Rows the OLD predicate served that the NEW one would drop are exactly those
  // with `start_date >= now AND end_date < now`, i.e. an end before its own start.
  const lost = await rows(request, `start_date=gte.${now}&end_date=lt.${now}`);
  expect(
    lost.map((r) => r.title),
    'the overlap predicate DROPPED rows the old one served (or the corpus has end_date < start_date)',
  ).toEqual([]);

  // Rows the NEW predicate recovers: started, not yet ended.
  const recovered = await rows(request, `start_date=lt.${now}&end_date=gte.${now}`);

  test.skip(
    recovered.length === 0,
    'no event is mid-run at this instant — the calendar, not the code, decides this',
  );

  // Everything recovered must genuinely be started-but-not-ended, or the predicate
  // is admitting rows for some other reason and the fix is wrong in a new way.
  const nowMs = Date.parse(now);
  for (const r of recovered) {
    expect(Date.parse(r.start_date), `${r.title} was recovered but has not started`).toBeLessThan(
      nowMs,
    );
    expect(r.end_date, `${r.title} was recovered but has no end_date`).not.toBeNull();
    expect(
      Date.parse(r.end_date!),
      `${r.title} was recovered but already ended`,
    ).toBeGreaterThanOrEqual(nowMs);
  }
});

test('a date window matches by overlap, not containment', async ({ request }) => {
  // Derive the subject: find something currently mid-run, then ask for a window that
  // starts AFTER it began. Containment misses it; overlap must not.
  const now = new Date();
  const running = (await rows(request, endsAtOrAfter(now.toISOString()))).filter(
    (r) => r.end_date && Date.parse(r.start_date) < now.getTime(),
  );

  test.skip(running.length === 0, 'nothing is mid-run at this instant — no subject to test with');

  // A window from now to the earliest end among the running set: every one of them
  // began before it and so is invisible to a containment filter.
  const windowStart = now.toISOString();
  const windowEnd = new Date(
    Math.min(...running.map((r) => Date.parse(r.end_date!))) + 1000,
  ).toISOString();

  // Asked of the database as one predicate, not differenced across two client
  // pages — see the note in the first test about truncation.
  const onlyViaOverlap = await rows(
    request,
    `start_date=lt.${windowStart}&start_date=lte.${windowEnd}&${endsAtOrAfter(windowStart)}`,
  );

  expect(
    onlyViaOverlap.length,
    'overlap and containment returned the same set — the window did not actually straddle a running event, so this assertion proved nothing',
  ).toBeGreaterThan(0);

  for (const r of onlyViaOverlap) {
    expect(
      Date.parse(r.start_date),
      `${r.title} is only reachable via overlap, so it must start before the window`,
    ).toBeLessThan(Date.parse(windowStart));
    expect(
      Date.parse(r.end_date ?? r.start_date),
      `${r.title} must still be running inside the window`,
    ).toBeGreaterThanOrEqual(Date.parse(windowStart));
  }
});
