import { test, expect, type APIRequestContext } from '@playwright/test';
import { anonHeaders } from './support/anonKey';

// The Rheinfetisch calendar import, asserted through the ANON PostgREST role —
// the same role the browser uses — so this checks what a reader is actually
// served rather than what a privileged query can see.
//
// The source reads Rheinfetisch e.V.'s public Google Calendar (the feed behind
// rheinfetisch.de/kalender). Two properties of `_shared/ics-parse.ts` are the
// reason this file exists, and neither is visible from the row count:
//
//   * FREQ=DAILY IS A SPAN, NOT A RECURRENCE. Every daily rule in this feed is
//     a multi-day festival, so it collapses to ONE row. Expanding it literally
//     would mint ~130 rows each titled for a whole festival and dated to one of
//     its days — which a "we imported N events" check reads as success.
//   * ALL-DAY DTEND IS EXCLUSIVE IN RFC 5545 AND INCLUSIVE HERE. Passing the
//     spec's boundary through makes every festival read a day longer than it
//     runs, and makes our Maspalomas row disagree with patroc's by a day so
//     dedup sees two festivals instead of one.

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? 'https://xqeacpakadqfxjxjcewc.supabase.co';
const SOURCE = 'rheinfetisch';

interface EventRow {
  id: string;
  title: string;
  start_date: string;
  end_date: string | null;
  city: string | null;
  country: string | null;
  venue_name: string | null;
  event_type: string;
  description: string | null;
}

async function rest<T>(request: APIRequestContext, path: string): Promise<T[]> {
  const res = await request.get(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: await anonHeaders(request),
  });
  expect(res.ok(), `${path} -> HTTP ${res.status()}`).toBeTruthy();
  return res.json();
}

const live = (select: string, extra = '') =>
  `events?select=${select}&data_source=eq.${SOURCE}&duplicate_of_id=is.null${extra}`;

const day = (iso: string) => iso.slice(0, 10);

// --- positive controls -------------------------------------------------------
// Every assertion below is of the form "no row is wrong", and that is equally
// true of an empty result, a broken filter and a revoked grant. These two make
// the rest mean something.

test('anon can read Rheinfetisch events at all', async ({ request }) => {
  const rows = await rest<EventRow>(request, live('id,title', '&limit=5'));
  expect(
    rows.length,
    'anon sees no rheinfetisch events — the import is gone, the grant is revoked, or data_source changed',
  ).toBeGreaterThan(0);
});

test('the source is registered and enabled, so the feed keeps being read', async ({ request }) => {
  const rows = await rest<{ slug: string; is_enabled: boolean; target_table: string; edge_function: string }>(
    request,
    'ingestion_sources?select=slug,is_enabled,target_table,edge_function&slug=eq.rheinfetisch',
  );
  // An unregistered source still imports once by hand and then silently rots.
  expect(rows.length, 'ingestion_sources row for rheinfetisch is missing').toBe(1);
  expect(rows[0].is_enabled).toBe(true);
  expect(rows[0].target_table).toBe('events');
  expect(rows[0].edge_function).toBe('source-rheinfetisch');
});

// --- the span rule -----------------------------------------------------------

test('no title from this source repeats on consecutive days', async ({ request }) => {
  // This is the span rule stated as an invariant rather than pinned to one
  // festival, because dedup legitimately merges some of them into rows patroc
  // and gaycities already hold — and a test pinned to a row that gets merged
  // away fails for the wrong reason.
  //
  // Daily expansion has one unmistakable signature: the same title on three or
  // more consecutive dates. Nothing in a correctly parsed feed looks like that.
  const rows = await rest<EventRow>(request, live('id,title,start_date', '&order=title.asc,start_date.asc'));
  expect(rows.length, 'no rows to check — the filter is wrong').toBeGreaterThan(0);

  const byTitle = new Map<string, string[]>();
  for (const r of rows) {
    const list = byTitle.get(r.title) ?? [];
    list.push(day(r.start_date));
    byTitle.set(r.title, list);
  }

  const exploded: string[] = [];
  for (const [title, dates] of byTitle) {
    const sorted = [...new Set(dates)].sort();
    let run = 1;
    for (let i = 1; i < sorted.length; i++) {
      const gap = (Date.parse(sorted[i]) - Date.parse(sorted[i - 1])) / 86_400_000;
      run = gap === 1 ? run + 1 : 1;
      if (run >= 3) {
        exploded.push(`${title} on ${sorted[i - 2]}..${sorted[i]}`);
        break;
      }
    }
  }
  expect(exploded, 'a FREQ=DAILY festival was expanded into one row per day').toEqual([]);
});

test('a span that survived dedup covers its whole run, inclusive of the last day', async ({ request }) => {
  // NLC Christkindlesmarkt 2026 is DTSTART 20261127 with FREQ=DAILY;UNTIL=20261129.
  // The spec's exclusive boundary would publish it as ending on the 30th.
  const rows = await rest<EventRow>(
    request,
    live('id,title,start_date,end_date', '&title=like.*Christkindlesmarkt*'),
  );
  expect(rows.length, 'the Christkindlesmarkt span is not live — pick another surviving span').toBe(1);
  expect(day(rows[0].start_date)).toBe('2026-11-27');
  expect(day(rows[0].end_date!), 'end_date is the exclusive DTEND, not the last day').toBe('2026-11-29');
});

test('no Rheinfetisch event ends before it starts', async ({ request }) => {
  const rows = await rest<EventRow>(request, live('id,title,start_date,end_date', '&end_date=not.is.null'));
  const reversed = rows.filter((r) => new Date(r.end_date!) < new Date(r.start_date));
  expect(
    reversed.map((r) => `${r.title} ${day(r.start_date)}..${day(r.end_date!)}`),
    'the inclusive-end conversion reversed a range',
  ).toEqual([]);
  expect(rows.length, 'no dated rows to check — the filter is wrong').toBeGreaterThan(0);
});

// --- the recurrence rule -----------------------------------------------------

test('a MONTHLY series DOES expand into separate nights', async ({ request }) => {
  // The mirror of the span rule: collapsing these would lose eleven socials.
  const rows = await rest<EventRow>(
    request,
    live('id,title,start_date', '&title=eq.Rheinfetisch Social&order=start_date.asc'),
  );
  expect(rows.length, 'the monthly Social series did not expand').toBeGreaterThan(3);
  const dates = rows.map((r) => day(r.start_date));
  expect(new Set(dates).size, 'expanded instances collapsed onto one date').toBe(dates.length);
});

// --- geography ---------------------------------------------------------------

test('a province is not published as the city', async ({ request }) => {
  // `…, 35100 Maspalomas, Las Palmas, Spanien` — taking the trailing segment
  // puts the event in Las Palmas, a real city 50 km away.
  const rows = await rest<EventRow>(
    request,
    live('id,title,city,country', '&title=like.*Maspalomas Fetish Pride*'),
  );
  for (const r of rows) {
    expect(r.city, `${r.title} was filed under the province`).not.toBe('Las Palmas');
  }
});

test('no event names its own city as its venue', async ({ request }) => {
  // `Bremen, 28 Bremen, Deutschland` would otherwise mint a venue called
  // "Bremen" — the collision link_event_venues measures at a 23% error rate on
  // its name-match branch.
  const rows = await rest<EventRow>(request, live('id,title,city,venue_name', '&venue_name=not.is.null'));
  const collisions = rows.filter(
    (r) => r.city && r.venue_name && r.venue_name.trim().toLowerCase() === r.city.trim().toLowerCase(),
  );
  expect(collisions.map((r) => `${r.title}: venue=${r.venue_name} city=${r.city}`)).toEqual([]);
  expect(rows.length, 'no rows carry a venue_name — the filter is wrong').toBeGreaterThan(0);
});

// --- content -----------------------------------------------------------------

test('the German prose from the calendar survives into the description', async ({ request }) => {
  const rows = await rest<EventRow>(
    request,
    live('id,title,description', '&title=eq.Rheinfetisch Social&description=not.is.null&limit=1'),
  );
  expect(rows.length, 'no Social carries a description').toBe(1);
  const d = rows[0].description!;
  // htmlToText output, so tags must be gone and the prose must remain.
  expect(d).not.toMatch(/<[^>]*>/);
  expect(d.length).toBeGreaterThan(40);
});

test('every imported event carries a city', async ({ request }) => {
  // The 18 rows the calendar gave no location were rejected at validate rather
  // than published placeless, so nothing live should be missing one.
  const rows = await rest<EventRow>(request, live('id,title,city'));
  const placeless = rows.filter((r) => !r.city);
  expect(placeless.map((r) => r.title), 'an event was published with no city').toEqual([]);
});
