import { test, expect, type APIRequestContext } from '@playwright/test';
import { anonHeaders, SUPABASE_REST_URL } from './support/anonKey';

// 36 cities each existed twice (2026-10-22/23): a second row under an exonym
// (Genova/Genoa, Pilsen/Plzeň), a wrapper (Greater London/London), or a
// municipality beside its own seat town (Distrito Federal/Mexico City). Every
// pair was merged by hand with `merge_cities` (reversible; audited in
// `city_merge_audit` with contract `manual-duplicate-city:v1`).
//
// INVARIANTS, NOT COUNTS. Nothing here pins a venue total or a uuid: ingest
// keeps adding venues and a later unmerge-and-redo must not turn this red for
// the wrong reason. What must stay true is that each old URL leads to the one
// surviving page, that the survivor renders, and that no merged-away row is
// live again.
//
// Read through the ANON role and a crawler UA, because that is what a visitor
// and a search engine are served.

const CRAWLER = { 'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)' };

/** Old slug -> surviving slug. Rows that only ever had a `tmp-` slug are omitted: nothing linked to them. */
const REDIRECTS: Array<[string, string]> = [
  ['greater-london', 'london'],
  ['genova', 'genoa-it-hzfdh'],
  ['acapulco-de-juarez-mx-0zy0c', 'acapulco'],
  ['ciudad-apodaca', 'apodaca'],
  ['carmel', 'carmel-by-the-sea'],
  ['nicolas-romero', 'ciudad-nicolas-romero'],
  ['cuzco', 'cusco-pe-47637'],
  ['ecatepec-de-morelos', 'ecatepec'],
  ['frankfurt', 'frankfurt-germany'],
  ['leon-de-los-aldama-mx-jq2wp', 'leon'],
  ['san-cristobal', 'san-cristobal-de-las-casas'],
  ['san-luis-potos-city', 'san-luis-potosi-mx-li0dt'],
  ['tultitlan-de-mariano-escobedo', 'tultitlan'],
  ['waterford-city-metropolitan-district', 'waterford'],
  ['freiberg', 'freiberg-1'],
  ['distrito-federal', 'mexico-city'],
  ['municipio-de-tanti', 'tanti'],
  ['municipio-sucre', 'sucre'],
  ['municipio-de-lago-puelo', 'lago-puelo'],
  ['durango', 'victoria-de-durango-mx-uspq2'],
  ['municipio-oruro', 'oruro'],
  ['municipio-de-clorinda', 'clorinda'],
  ['cozumel', 'san-miguel-de-cozumel'],
];

async function anonGet(
  request: APIRequestContext,
  path: string,
): Promise<Array<Record<string, unknown>>> {
  const res = await request.get(`${SUPABASE_REST_URL}/rest/v1/${path}`, {
    headers: await anonHeaders(request),
  });
  expect(res.ok(), `anon read failed for ${path}: ${res.status()}`).toBeTruthy();
  return (await res.json()) as Array<Record<string, unknown>>;
}

test.describe('city duplicate merges', () => {
  test('the anon role can read cities at all', async ({ request }) => {
    // Positive control: without it every "not live" assertion below passes on a broken read.
    const rows = await anonGet(
      request,
      'cities?select=slug&slug=eq.london&duplicate_of_id=is.null',
    );
    expect(rows).toHaveLength(1);
  });

  for (const [from, to] of REDIRECTS) {
    test(`/city/${from} leads to /city/${to}`, async ({ request }) => {
      const res = await request.get(`/city/${from}`, { headers: CRAWLER, maxRedirects: 0 });
      expect(res.status(), `/city/${from}`).toBe(301);
      expect(new URL(res.headers()['location'] ?? '', 'https://queer.guide').pathname).toBe(
        `/city/${to}`,
      );

      const page = await request.get(`/city/${to}`, { headers: CRAWLER, maxRedirects: 0 });
      expect(page.status(), `/city/${to}`).toBe(200);
      // Positive fingerprint: the survivor serves a real city page, not a shell.
      expect(await page.text()).toMatch(/<title>[^<]*LGBTQ\+ guide to [^<]+<\/title>/);

      const dropped = await anonGet(
        request,
        `cities?select=id&slug=eq.${from}&duplicate_of_id=is.null`,
      );
      expect(dropped, `${from} is live again`).toHaveLength(0);
    });
  }

  test('misfiled venues sit on the city their coordinates belong to', async ({ request }) => {
    // Filtered to the Freiburg area: "Hirscheneck" is also a well-known Basel venue.
    // Both sat on a "Freiberg" row that carried Freiburg im Breisgau's coordinates.
    // (Founders Park, moved to Carmel, Indiana, is a cruising venue: anon cannot read
    // it by design, so it is not asserted here rather than read with a privileged key.)
    for (const [venue, citySlug] of [
      ['Hirscheneck', 'freiburg-de-rmir8'],
      ['Freiburger Lesbenfilmtage e.V.', 'freiburg-de-rmir8'],
    ]) {
      // venues.city_id has no FK to cities any more (Geo P2), so PostgREST cannot embed it.
      const [city] = await anonGet(request, `cities?select=id&slug=eq.${citySlug}`);
      expect(city, `${citySlug} not readable`).toBeTruthy();
      const rows = await anonGet(
        request,
        `venues?select=city_id&name=eq.${encodeURIComponent(venue)}&latitude=gte.47.9&latitude=lte.48.1&longitude=gte.7.7&longitude=lte.8.0`,
      );
      expect(rows.length, `${venue} not readable`).toBeGreaterThan(0);
      for (const r of rows) expect(r.city_id, venue).toBe(city.id);
    }
  });
});
