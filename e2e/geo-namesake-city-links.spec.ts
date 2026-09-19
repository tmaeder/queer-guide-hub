import { test, expect, type APIRequestContext } from '@playwright/test';

// A place may never be presented as its namesake.
//
// `event-city-match` minted city rows from an event's free-text city and resolved
// them BY NAME ALONE. `cities` holds at most one row per (name, country) -- three
// unique indexes plus a BEFORE trigger that strips a comma qualifier before the
// index sees it -- so a second Derby or College Park in the same country is not
// merely absent, it is unrepresentable. Name-only resolution therefore did not
// fail to find the right row, it silently attached content to the wrong one:
// 99970901120000 found an Atlanta WNBA game on College Park, MARYLAND and a Derby,
// ENGLAND IDAHOBIT event on Derby, CONNECTICUT.
//
// These tests assert the INVARIANT, not the repair's transient state, so they hold
// both before and after 99991789843667 creates Derby, England and links its event:
// each repaired event is EITHER unlinked OR on a city that its own coordinates and
// region corroborate. A spec pinned to "city_id is null" would go red the moment the
// follow-up it is guarding actually lands.
//
// Read through the ANON PostgREST role -- the role the browser uses -- so this
// asserts what a visitor can be served, not what a privileged query can see. The
// rendered pages are fetched with a crawler UA as well, because `functions/_lib/
// detail.ts` builds the bot <head> from its own query and has shipped a hole the
// SPA did not have before (`villageDetail` never selected `seo_indexable`).

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? 'https://xqeacpakadqfxjxjcewc.supabase.co';
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

/** How far a city may sit from an event it is said to host. */
const MAX_KM = 25;

/** The two namesake collisions 99970901120000 repaired, by their own postal codes. */
const REPAIRED = [
  {
    postal: '30337',
    label: 'Atlanta Dream v Washington Mystics (Pride Night)',
    lat: 33.6534,
    lon: -84.4494,
    // the row it was wrongly attached to
    wrongCity: { name: 'College Park', region: 'Maryland' },
  },
  {
    postal: 'DE1 1LH',
    label: 'International Day Against Homophobia, Biphobia and Transphobia',
    lat: 52.9247,
    lon: -1.478,
    wrongCity: { name: 'Derby', region: 'Connecticut' },
  },
] as const;

test.skip(!ANON_KEY, 'VITE_SUPABASE_ANON_KEY not set');

async function rest<T>(request: APIRequestContext, path: string): Promise<T[]> {
  const res = await request.get(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: ANON_KEY!, Authorization: `Bearer ${ANON_KEY!}` },
  });
  expect(res.ok(), `${path} -> HTTP ${res.status()}`).toBeTruthy();
  return res.json();
}

function km(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371;
  const p = Math.PI / 180;
  const h =
    Math.sin(((bLat - aLat) * p) / 2) ** 2 +
    Math.cos(aLat * p) * Math.cos(bLat * p) * Math.sin(((bLon - aLon) * p) / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// --- positive control --------------------------------------------------------
// "The wrong city does not host it" also passes when the event has been deleted,
// when the query is broken, and when anon can read nothing at all. This test is
// what stops every assertion below from being vacuous.

test('both repaired events are still live and readable by anon', async ({ request }) => {
  for (const ev of REPAIRED) {
    const rows = await rest<{ id: string; title: string }>(
      request,
      `events?select=id,title&postal_code=eq.${encodeURIComponent(ev.postal)}`,
    );
    expect(rows.length, `no anon-readable event at postal_code ${ev.postal}`).toBeGreaterThan(0);
    expect(rows.some((r) => r.title === ev.label)).toBeTruthy();
  }
});

// --- the invariant -----------------------------------------------------------

test('a repaired event is unlinked, or on a city its own coordinates corroborate', async ({
  request,
}) => {
  for (const ev of REPAIRED) {
    const rows = await rest<{
      title: string;
      city_id: string | null;
    }>(request, `events?select=title,city_id&postal_code=eq.${encodeURIComponent(ev.postal)}`);

    for (const row of rows) {
      if (row.city_id === null) continue; // blocked rather than guessed -- recoverable

      const [city] = await rest<{
        name: string;
        region_name: string | null;
        latitude: string | null;
        longitude: string | null;
      }>(request, `cities?select=name,region_name,latitude,longitude&id=eq.${row.city_id}`);

      expect(city, `${row.title} points at a city anon cannot read`).toBeTruthy();
      expect(
        city.latitude !== null && city.longitude !== null,
        `${row.title} is linked to a city with no coordinates, so nothing corroborates it`,
      ).toBeTruthy();

      const d = km(ev.lat, ev.lon, Number(city.latitude), Number(city.longitude));
      expect(
        d,
        `${row.title} is attributed to ${city.name}, ${city.region_name} — ${d.toFixed(1)} km away`,
      ).toBeLessThan(MAX_KM);

      // the specific namesake it was taken off must never be the answer again
      expect(`${city.name}/${city.region_name}`).not.toBe(
        `${ev.wrongCity.name}/${ev.wrongCity.region}`,
      );
    }
  }
});

test('no same-name city hosts an event it is nowhere near', async ({ request }) => {
  // Keyed on the event's own `city` text rather than on a region or a slug: the
  // row this was taken off is a placeholder whose region_name is NULL, and a
  // tmp- slug moves the day the row is promoted. Every live city sharing the
  // name is checked, so the assertion names no row and cannot go stale.
  for (const ev of REPAIRED) {
    const [event] = await rest<{ id: string; city: string | null }>(
      request,
      `events?select=id,city&postal_code=eq.${encodeURIComponent(ev.postal)}`,
    );
    expect(event?.city, `the event at ${ev.postal} has no city text to match on`).toBeTruthy();

    const namesakes = await rest<{
      id: string;
      name: string;
      region_name: string | null;
      latitude: string | null;
      longitude: string | null;
    }>(
      request,
      `cities?select=id,name,region_name,latitude,longitude` +
        `&name=eq.${encodeURIComponent(event.city!)}&duplicate_of_id=is.null`,
    );
    // positive control: if no row carries the name, "none of them hosts it" is empty
    expect(
      namesakes.length,
      `no live city is named ${event.city}, so this assertion checks nothing`,
    ).toBeGreaterThan(0);

    for (const city of namesakes) {
      const held = await rest<{ title: string }>(
        request,
        `events?select=title&city_id=eq.${city.id}&postal_code=eq.${encodeURIComponent(ev.postal)}`,
      );
      if (held.length === 0) continue;
      const d =
        city.latitude === null || city.longitude === null
          ? Infinity
          : km(ev.lat, ev.lon, Number(city.latitude), Number(city.longitude));
      expect(
        d,
        `${ev.label} is hosted by ${city.name}, ${city.region_name ?? 'no region'} — ${
          d === Infinity ? 'which has no coordinates at all' : `${d.toFixed(1)} km away`
        }`,
      ).toBeLessThan(MAX_KM);
    }
  }
});

test('Derby, Connecticut keeps its own venues while losing the English event', async ({
  request,
}) => {
  const [city] = await rest<{ id: string; slug: string; wikidata_qid: string }>(
    request,
    'cities?select=id,slug,wikidata_qid&slug=eq.derby',
  );
  expect(city, 'the Derby, Connecticut row is gone').toBeTruthy();
  expect(city.wikidata_qid, 'the Derby row no longer carries its own identifier').toBe('Q755197');

  // positive control: unlinking the event must not have emptied the row
  const venues = await rest<{ id: string }>(
    request,
    `venues?select=id&city_id=eq.${city.id}&duplicate_of_id=is.null`,
  );
  expect(venues.length, 'Derby, Connecticut lost its venues').toBeGreaterThan(0);
});

test('the rendered Derby page does not name the English event', async ({ request }) => {
  // Fetched with a crawler UA: `functions/_lib/detail.ts` builds the bot <head>
  // and body from its own query, which is all a non-JS crawler ever sees.
  const res = await request.get('https://queer.guide/city/derby', {
    headers: { 'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)' },
  });
  expect(res.status()).toBe(200);
  const html = await res.text();
  expect(html).toMatch(/<title>[^<]*Derby[^<]*<\/title>/i);

  // Positive control, and the load-bearing one: "the event is not named" is also
  // true of a page that names nothing. Assert the page DOES print the entities it
  // holds, by looking for its own venues, before trusting the absence below.
  const [city] = await rest<{ id: string }>(request, 'cities?select=id&slug=eq.derby');
  const venues = await rest<{ name: string }>(
    request,
    `venues?select=name&city_id=eq.${city.id}&duplicate_of_id=is.null`,
  );
  expect(venues.length).toBeGreaterThan(0);
  expect(
    venues.some((v) => html.includes(v.name)),
    'the crawler page names none of the city’s own venues, so it prints no entities ' +
      'and the assertion below would pass on any page at all',
  ).toBeTruthy();

  expect(html).not.toMatch(/Homophobia, Biphobia and Transphobia/i);
});
