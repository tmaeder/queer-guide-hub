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

// --- the twelve 99991789886174 swept up -------------------------------------
//
// Found mechanically rather than one row at a time -- every live event over 250 km
// from the city it is linked to -- which is why this is not two more entries on
// REPAIRED above. Three remedies, because the evidence differs per row and the
// distance does not decide:
//
//   block   the city is unrepresentable (same country, and `cities` holds at most one
//           row per (name, country)), so the link is removed rather than guessed at
//   relink  the collision crosses a border and the correct row already exists
//   geo     the LINK is correct and the COORDINATES were wrong, so the coordinates
//           were retracted -- these rows are asserted to have KEPT their city, which
//           is the opposite of what their distance argued for
//
// Keyed by id: three of them (the Lakewood trio) share a postal code and two carry
// none at all. The corpus-wide form of this claim -- that NO event anywhere sits over
// 250 km from its city -- is postcondition P4 of the migration, which runs as postgres
// over every row. It deliberately does not live here: anon cannot read safety-gated
// events, so a sweep from this role would check a subset and report it as the whole.
const SWEPT = [
  {
    id: '39fe5af6-7d44-401d-8c0b-41020fb5eeed',
    remedy: 'block',
    lat: 43.656551,
    lon: -70.258943,
    was: 'Portland, Oregon',
  },
  {
    id: 'e223aa71-3edf-4ead-b46a-afc12c040344',
    remedy: 'block',
    lat: 41.477055,
    lon: -81.773585,
    was: 'Lakewood, Colorado',
  },
  {
    id: 'f21efc92-11d5-4774-846b-e769b95abb3a',
    remedy: 'block',
    lat: 41.477055,
    lon: -81.773585,
    was: 'Lakewood, Colorado',
  },
  {
    id: '15560889-b4bf-49f9-a584-13709c565f4d',
    remedy: 'block',
    lat: 41.477055,
    lon: -81.773585,
    was: 'Lakewood, Colorado',
  },
  {
    id: '77bcbdab-b20d-4f7d-a87e-de14f05bd18a',
    remedy: 'block',
    lat: 32.68074,
    lon: -97.107349,
    was: 'Arlington, Virginia',
  },
  {
    id: '0d3a2d4c-d470-458b-9f04-641f4721ce6f',
    remedy: 'block',
    lat: 42.843561,
    lon: -70.816296,
    was: 'Salisbury, North Carolina',
  },
  {
    id: '7bee9d1f-f908-47c6-9220-e5796f1d6cd5',
    remedy: 'block',
    lat: 28.810713,
    lon: -81.265142,
    was: 'Sanford, North Carolina',
  },
  {
    id: 'f4acf601-07f8-4790-b498-0b2a6b36d89e',
    remedy: 'block',
    lat: 38.7673,
    lon: -75.285797,
    was: 'Milton, Pennsylvania',
  },
  {
    id: '40aefb71-e3b8-40d9-a206-4cbd33827e65',
    remedy: 'relink',
    lat: 33.50539,
    lon: -86.79049,
    was: 'Birmingham, England',
  },
  {
    id: 'aac86082-299f-4e2e-8944-5c4049581807',
    remedy: 'relink',
    lat: 42.3709,
    lon: -71.11449,
    was: 'Cambridge, England',
  },
  {
    id: '0aa93667-3d85-4714-8d2f-ec4adbc582c3',
    remedy: 'geo',
    lat: null,
    lon: null,
    was: 'coordinates in Saint Petersburg, Russia',
  },
  {
    id: '03ec22b3-38cc-4bda-b20e-da1534e22898',
    remedy: 'geo',
    lat: null,
    lon: null,
    was: 'the centroid of a merged-away Łódź row in Ukraine',
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

// --- the sweep ---------------------------------------------------------------

test('all twelve swept events are still live and readable by anon', async ({ request }) => {
  // Positive control, and the load-bearing one for everything below: "the event is
  // not on the wrong city" is equally true of an event that was deleted, of a broken
  // query, and of a role that can read nothing at all.
  const rows = await rest<{ id: string }>(
    request,
    `events?select=id&id=in.(${SWEPT.map((s) => s.id).join(',')})`,
  );
  const seen = new Set(rows.map((r) => r.id));
  for (const s of SWEPT) {
    expect(seen.has(s.id), `${s.id} (taken off ${s.was}) is not anon-readable`).toBeTruthy();
  }
  expect(rows.length).toBe(SWEPT.length);
});

test('each swept event got the remedy its own evidence supports', async ({ request }) => {
  for (const s of SWEPT) {
    const [ev] = await rest<{
      id: string;
      title: string;
      city_id: string | null;
      latitude: string | null;
      longitude: string | null;
    }>(request, `events?select=id,title,city_id,latitude,longitude&id=eq.${s.id}`);
    expect(ev, `${s.id} is gone`).toBeTruthy();

    if (s.remedy === 'block') {
      // Unrepresentable city: blocked rather than guessed. A null city_id is
      // recoverable, a wrong one is not.
      expect(
        ev.city_id,
        `${ev.title} is still presented on ${s.was}, which cannot be corrected because ` +
          `that city row is not creatable — cities is unique on (name, country)`,
      ).toBeNull();
      continue;
    }

    // relink and geo both KEEP a city, and asserting that is what stops a future
    // sweep from "fixing" these two groups by unlinking them like group A.
    expect(ev.city_id, `${ev.title} lost the city link that was correct`).not.toBeNull();

    if (s.remedy === 'geo') {
      // The coordinates were the defect, not the link. Retracted, never replaced
      // with a centroid — prefer NULL to a guess.
      expect(
        ev.latitude,
        `${ev.title} still carries ${s.was}; the link was right and the coordinates were not`,
      ).toBeNull();
      continue;
    }

    const [city] = await rest<{
      name: string;
      region_name: string | null;
      latitude: string | null;
      longitude: string | null;
    }>(request, `cities?select=name,region_name,latitude,longitude&id=eq.${ev.city_id}`);
    expect(city, `${ev.title} points at a city anon cannot read`).toBeTruthy();
    expect(
      city.latitude !== null,
      `${ev.title} was relinked to a city with no coordinates, so nothing corroborates it`,
    ).toBeTruthy();

    const d = km(s.lat!, s.lon!, Number(city.latitude), Number(city.longitude));
    expect(
      d,
      `${ev.title} was moved off ${s.was} onto ${city.name}, ${city.region_name} — ` +
        `${d.toFixed(1)} km from its own coordinates, so the new row is no better`,
    ).toBeLessThan(MAX_KM);
  }
});

test('blocking an event never emptied the city it was taken off', async ({ request }) => {
  // Mirror. Every assertion above is satisfied by a pass that deleted the city rows
  // outright; these are the rows that must survive being unlinked FROM. Salisbury,
  // North Carolina is the sharpest case — it is the wrong city for a Massachusetts
  // event and the RIGHT one for Wakefield Poole, who was born there. That personality
  // is `draft`, so anon cannot count it and this test deliberately does not try; the
  // migration's P6 compares the count against a pre-write snapshot as postgres.
  const slugs = [
    'portland',
    'lakewood',
    'arlington-us-imfac',
    'tmp-4f3d2206-b747-4617-9a0d-37be27aee945',
    'sanford-us-5ibkl',
    'milton',
    'birmingham',
    'cambridge-gb-2wpbj',
    'st-petersburg',
    'od-1',
  ];
  for (const slug of slugs) {
    const [city] = await rest<{ id: string; name: string }>(
      request,
      `cities?select=id,name&slug=eq.${encodeURIComponent(slug)}&duplicate_of_id=is.null`,
    );
    expect(
      city,
      `the ${slug} row is gone or merged — unlinking must not remove a city`,
    ).toBeTruthy();
  }
});
