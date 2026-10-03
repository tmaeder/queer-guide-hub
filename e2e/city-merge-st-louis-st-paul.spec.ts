import { test, expect, type APIRequestContext } from '@playwright/test';
import { anonHeaders, SUPABASE_REST_URL } from './support/anonKey';

// St. Louis and St. Paul each existed twice, and in BOTH pairs the row holding
// the content held the WORSE identity data. 99991790881362 merged them.
//
// THESE ARE INVARIANTS, NOT THE REPAIR'S TRANSIENT STATE. Nothing here is pinned
// to a uuid surviving or to a particular population, because the follow-ups this
// pair invites -- `city_qid_gap_link` resolving an identifier for St. Paul, the
// factual backfill replacing the 2010 census figure with 2020 -- must not turn
// this spec red. What is asserted is the shape the merge exists to produce:
//
//   one canonical row per city, the identifier still reachable, and the
//   Minnesota row serving Minnesota rather than Saint-Paul, Réunion.
//
// Read through the ANON PostgREST role, because that is the role a visitor's
// browser uses -- a privileged query can see rows a reader never will. The pages
// are fetched with a crawler UA as well, because `functions/_lib/detail.ts`
// builds the bot <head> and body from its own query and has shipped holes the
// SPA did not have.
//
// EVERY NEGATIVE IS PAIRED WITH A POSITIVE FINGERPRINT. "Réunion's population is
// absent" is equally true of a row that was deleted, a query that is broken and
// a page that renders nothing, and this suite exists because a subset-sized
// check once read as the whole.

/** Saint-Paul, Réunion's population, which sat on the Minnesota row. */
const REUNION_POPULATION = 108088;

// THE RÉUNION-ALIAS INVARIANT IS DELIBERATELY NOT ASSERTED HERE, and it is worth
// saying why rather than leaving a gap that reads like an oversight.
//
// The merge removed 11 Saint-Paul/Réunion alias keys from the Minnesota row --
// consistently the FRENCH reading, which is what made the attribution certain
// (`サン=ポール` San-Pōru not `セントポール`, `생폴` Saeng-pol not `세인트폴`,
// `Сен-Поль` not `Сент-Пол`). An alias is a STANDING rule, so leaving them would
// route every future Réunion and São Paulo event to Minnesota.
//
// That claim CANNOT be made from the anon role, measured rather than assumed:
// `city_aliases` has no anon SELECT grant (the read returns 401), and
// `city_by_alias` is not anon-EXECUTABLE either -- and being SECURITY INVOKER it
// would still need the table grant even if it were. Two independent gates, both
// by design: alias routing is internal machinery, not something a visitor reads.
//
// A first version of this spec asserted it anyway and failed with a 401 on prod.
// The temptation then is to re-run the read as service_role, which would make the
// spec green while no longer testing what a visitor can be served -- the exact
// inversion this file's header warns about. So the corpus-wide form stays where it
// can actually run: postcondition P5 of 99991790881362, executed as postgres over
// every row at apply time, plus the frozen-11-key assertions in
// src/lib/__tests__/cityMergeStLouisStPaul.test.ts.
//
// Same reasoning e2e/geo-namesake-city-links.spec.ts gives for keeping its own
// corpus-wide sweep in the migration: a check run from a role that cannot see the
// rows inspects a subset and reports it as the whole.

const CRAWLER = { 'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)' };

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

test.describe('city merge: St. Louis and St. Paul', () => {
  test('the anon role can read cities at all', async ({ request }) => {
    // POSITIVE CONTROL for every read below. Without it, a revoked grant or a
    // rotated key makes each "exactly one row" assertion fail for the wrong
    // reason, and each "no Réunion data" assertion pass for the wrong one.
    const rows = await anonGet(
      request,
      'cities?select=id,name&duplicate_of_id=is.null&limit=5',
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  test('exactly one canonical St. Louis in Missouri, and it keeps its identifier', async ({
    request,
  }) => {
    const rows = await anonGet(
      request,
      'cities?select=id,slug,name,region_name,wikidata_qid,description' +
        '&region_name=eq.Missouri&duplicate_of_id=is.null' +
        '&or=(name.eq.Saint Louis,name.eq.St. Louis)',
    );

    expect(
      rows,
      'Missouri must hold exactly one canonical St. Louis; two is the split this merge repaired',
    ).toHaveLength(1);

    // The identifier is the whole reason the direction was not a free choice:
    // `merge_cities` carries no scalar, so keeping the other row would have
    // stranded Q38022 on a `duplicate_of_id` row that no rebuild ever reads.
    // Asserted as PRESENT rather than as a literal, so a later correction to a
    // better identifier does not read as a regression.
    expect(
      rows[0].wikidata_qid,
      'the surviving St. Louis carries no wikidata_qid — the identifier did not survive the merge',
    ).toBeTruthy();

    // Positive fingerprint: the row is a real content-bearing city, not a shell
    // that happens to be unique because the other was deleted.
    expect(String(rows[0].description ?? '')).toMatch(/Missouri/i);
  });

  test('exactly one canonical St. Paul in Minnesota, serving Minnesota', async ({ request }) => {
    const rows = await anonGet(
      request,
      'cities?select=id,slug,name,region_name,population,description' +
        '&region_name=eq.Minnesota&duplicate_of_id=is.null' +
        '&or=(name.eq.Saint Paul,name.eq.St. Paul)',
    );

    expect(rows, 'Minnesota must hold exactly one canonical St. Paul').toHaveLength(1);
    const stPaul = rows[0];

    // NEGATIVE: Saint-Paul, Réunion's population must not sit on a US state capital.
    expect(
      stPaul.population,
      `St. Paul, Minnesota still publishes ${REUNION_POPULATION}, which is Saint-Paul, Réunion's population`,
    ).not.toBe(REUNION_POPULATION);

    // POSITIVE, paired with it: the row describes Minnesota. Without this the
    // negative above is satisfied by a row with no population and no prose.
    const description = String(stPaul.description ?? '');
    expect(
      description.length,
      'St. Paul has no description, so the Réunion check above proves nothing',
    ).toBeGreaterThan(0);
    expect(description).toMatch(/Minnesota/i);
    expect(description).not.toMatch(/Réunion|Reunion/i);
  });

  test('city_aliases stays unreadable to anon, which is why the alias check is not here', async ({
    request,
  }) => {
    // Pinned as a CONTROL on the reason, not as an aspiration. If `city_aliases`
    // ever becomes anon-readable this fails and tells the next reader to restore
    // the Réunion-alias assertion the header describes — otherwise the gap looks
    // like something nobody got round to.
    const res = await request.get(`${SUPABASE_REST_URL}/rest/v1/city_aliases?select=alias&limit=1`, {
      headers: await anonHeaders(request),
    });
    expect(
      res.status(),
      'city_aliases is now readable by anon — restore the Réunion-alias test described above',
    ).toBe(401);
  });

  test('the dropped St. Louis slug 301s to the survivor rather than 404ing', async ({
    request,
  }) => {
    // 202 live events were on the dropped row, so its URL has to keep resolving.
    // The redirect is minted by `trg_cities_zz_merge_redirect` and honoured at the
    // edge by `resolveSlugRedirect` — neither of which is `merge_cities`, so this
    // is asserted rather than assumed.
    const res = await request.get('/city/st-louis', {
      headers: CRAWLER,
      maxRedirects: 0,
    });
    expect(
      [301, 308],
      `/city/st-louis returned ${res.status()}; a dropped slug must redirect, not 404`,
    ).toContain(res.status());
    expect(res.headers()['location'] ?? '').toContain('/city/saint-louis');
  });

  test('the surviving St. Louis page renders its own content to a crawler', async ({
    request,
  }) => {
    const res = await request.get('/city/saint-louis', { headers: CRAWLER });
    expect(res.status()).toBe(200);
    const html = await res.text();

    // POSITIVE CONTROL FIRST. A page that prints nothing satisfies every absence
    // check below, and this route is exactly where a merge could leave a shell.
    expect(html).toMatch(/<title>[^<]+<\/title>/);
    expect(html).toMatch(/Missouri/i);

    // And it is self-canonical — the survivor, not a redirect target that still
    // points elsewhere.
    expect(html).toMatch(/rel="canonical"[^>]*\/city\/saint-louis/);
  });

  test('the St. Paul page serves Minnesota, not Réunion, to a crawler', async ({ request }) => {
    const res = await request.get('/city/saint-paul', { headers: CRAWLER });
    expect(res.status()).toBe(200);
    const html = await res.text();

    // Paired: the page must print something AND that something must be Minnesota.
    expect(html).toMatch(/<title>[^<]+<\/title>/);
    expect(html).toMatch(/Minnesota/i);
    expect(
      html,
      'the St. Paul page names Réunion — the chimera row is still being served',
    ).not.toMatch(/Réunion|Saint-Paul de la/i);
  });
});
