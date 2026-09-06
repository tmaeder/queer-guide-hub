import { test, expect, type APIRequestContext } from '@playwright/test';

/**
 * The events browse feed shows each real-world thing ONCE — end to end, on prod.
 *
 * Three defects converged on this feed and all three are asserted here:
 *
 *  1. `search_events` never excluded `duplicate_of_id`, so 598 upcoming events that
 *     had already been merged into another row were still being served. The sibling
 *     PostgREST path in useEvents.tsx had always excluded them, so which one a
 *     reader got depended on whether a city filter was active — the dedup engine's
 *     entire output was invisible on the city feed.
 *  2. 70.9% of the feed was repeat dates of 289 recurring series (a Zürich library's
 *     opening hours appeared 112 times). They are NOT duplicates — each date carries
 *     its own description and ticket URL — so they are grouped, never merged.
 *  3. A festival published one card per day: "lila Queer Festival" beside
 *     "lila. 26 - queer festival: Donnerstag / Freitag / Samstag".
 *
 * EVERY assertion here carries a positive control, because each of these checks
 * passes trivially on an empty result. "No duplicates served" is also true of a
 * feed that returns nothing, and "nothing collapsed" is also true of a corpus where
 * the recompute never ran. So the spec first proves the feed is populated and that
 * collapsing is actually happening, then proves what must be absent.
 *
 * Reads through the ANON PostgREST role — the same role the browser uses — so it
 * asserts what a reader is served, not what a privileged query can see.
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? 'https://xqeacpakadqfxjxjcewc.supabase.co';
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

test.skip(!ANON_KEY, 'VITE_SUPABASE_ANON_KEY not set');

type EventRow = {
  id: string;
  title: string;
  slug: string;
  duplicate_of_id: string | null;
  parent_event_id: string | null;
  series_next: boolean | null;
  series_size: number | null;
};

async function searchEvents(
  request: APIRequestContext,
  body: Record<string, unknown>,
): Promise<{ total: number; rows: EventRow[] }> {
  const res = await request.post(`${SUPABASE_URL}/rest/v1/rpc/search_events`, {
    headers: {
      apikey: ANON_KEY!,
      Authorization: `Bearer ${ANON_KEY!}`,
      'Content-Type': 'application/json',
    },
    data: body,
  });
  expect(res.ok(), `search_events -> HTTP ${res.status()}: ${await res.text()}`).toBeTruthy();
  const json = (await res.json()) as Array<{ total: number | string; event: EventRow }>;
  return {
    total: json.length > 0 ? Number(json[0].total) : 0,
    rows: json.map((r) => r.event),
  };
}

test('the browse feed serves no merged duplicate, no series repeat and no programme child', async ({
  request,
}) => {
  const { total, rows } = await searchEvents(request, { p_limit: 1000 });

  // Positive control: every assertion below is vacuously true on an empty feed.
  expect(total, 'browse feed is empty — nothing below proves anything').toBeGreaterThan(100);
  expect(rows.length).toBeGreaterThan(50);

  const merged = rows.filter((r) => r.duplicate_of_id !== null);
  expect(
    merged.map((r) => r.slug),
    'merged duplicates are being served again (search_events lost its duplicate_of_id filter)',
  ).toEqual([]);

  const children = rows.filter((r) => r.parent_event_id !== null);
  expect(
    children.map((r) => r.slug),
    'programme children are being served as their own cards again',
  ).toEqual([]);

  const repeats = rows.filter((r) => r.series_next === false);
  expect(
    repeats.map((r) => r.slug),
    'non-representative series occurrences are back in the browse feed',
  ).toEqual([]);
});

test('collapsing is actually happening, and releases when dates are requested', async ({
  request,
}) => {
  const browse = await searchEvents(request, { p_limit: 200 });

  // Positive control for the collapse itself: "no repeats in the feed" is also
  // true of a corpus where nothing was ever grouped. At least one card must be
  // standing in for a series.
  const representing = browse.rows.filter((r) => (r.series_size ?? 0) > 1);
  expect(
    representing.length,
    'no card represents a multi-date series — the recompute is inert or the column is unpopulated',
  ).toBeGreaterThan(0);

  // A reader who asks for a date window wants the individual occurrences, so the
  // collapse must release. Derived from the responses, never a hardcoded number:
  // a pinned figure goes stale the moment the corpus changes.
  const now = new Date();
  const in400d = new Date(now.getTime() + 400 * 24 * 3600 * 1000);
  const ranged = await searchEvents(request, {
    p_start: now.toISOString(),
    p_end: in400d.toISOString(),
    p_limit: 1,
  });

  expect(
    ranged.total,
    'the date-ranged feed is not larger than the collapsed one — the collapse is inert, or it is leaking into the ranged path and hiding dates the reader asked for',
  ).toBeGreaterThan(browse.total);
});

test('a multi-day festival shows once but every day-part page still resolves', async ({
  request,
  page,
}) => {
  const { rows } = await searchEvents(request, { p_search: 'lila', p_limit: 100 });

  const lila = rows.filter((r) => /lila/i.test(r.title));
  expect(lila.length, 'the lila festival is not in the feed at all').toBeGreaterThan(0);

  // The umbrella may appear; its three day-parts must not.
  const dayParts = lila.filter((r) => /donnerstag|freitag|samstag/i.test(r.title));
  expect(
    dayParts.map((r) => r.slug),
    'festival day-parts are published as separate cards again',
  ).toEqual([]);

  // Grouping must not cost the reader a page. Nothing was merged or deleted here,
  // so every original URL has to keep working — that is the whole difference
  // between grouping and merging.
  for (const slug of [
    'lila-queer-festival',
    'lila-26-queer-festival-donnerstag',
    'lila-26-queer-festival-freitag',
    'lila-26-queer-festival-samstag',
  ]) {
    const res = await page.request.get(`/events/${slug}`);
    expect(res.status(), `/events/${slug} should still resolve`).toBe(200);
  }
});
