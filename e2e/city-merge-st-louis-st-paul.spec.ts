import { test, expect, type APIRequestContext } from '@playwright/test';
import { anonHeaders, SUPABASE_REST_URL } from './support/anonKey';

// St. Louis and St. Paul each existed twice, and in BOTH pairs the row holding
// the content held the WORSE identity data. 99991790827898 merged them.
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

// The 11 Réunion/São Paulo alias keys the merge removed from the Minnesota row
// are NOT listed here. They were, as a const this spec checked against a
// `city_aliases` read — and anon cannot read that table (see the long note on the
// events case below), so the list was dead weight behind an assertion that could
// never run. The frozen list lives in migration 99991790881362's P5, which is the
// only place it can be checked. Worth recording what made the attribution certain:
// every one is the FRENCH reading — `サン=ポール` (San-Pōru) not `セントポール`,
// `생폴` (Saeng-pol) not `세인트폴`, `Сен-Поль` not `Сент-Пол`.

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

  // The ALIAS RULE ITSELF IS NOT ASSERTABLE FROM ANON, AND THAT IS WHY THIS CASE
  // ASSERTS ITS CONSEQUENCE INSTEAD.
  //
  // The first draft read `city_aliases` through `anonGet` and checked the 11
  // REUNION_ALIAS_KEYS were gone from the Minnesota row. It had never passed:
  // measured on prod, `city_aliases` answers anon `401 {"code":"42501"}`. The
  // table's baseline grant is Supabase's stock default-privileges row —
  // INSERT/UPDATE/DELETE/TRUNCATE to `anon` and *no SELECT* — so its
  // `city_aliases read` policy (`FOR SELECT TO anon USING (true)`) is dead: RLS
  // is never reached because the table-level privilege is missing. Nothing in
  // `src/`, `functions/` or `workers/` reads the table as anon (only service-role
  // edge functions do), so the grant is not widened to make a test pass.
  // `city_by_alias` is 42501 to anon too, so the resolver is no way in either.
  //
  // So the rule-table form stays where it can actually be checked: migration
  // 99991790881362's own postconditions, P5 (every Réunion alias_key is gone from
  // the Minnesota row, by the same frozen list) and P6 (both `st louis`/`st paul`
  // aliases exist AND `city_by_alias` resolves them — the behavioural half). That
  // is the same split `geo-namesake-city-links.spec.ts` already documents for
  // safety-gated events: a sweep from a role that cannot see the corpus checks a
  // subset and reports it as the whole.
  //
  // What anon CAN see is what the alias would DO. An alias is a standing rule, so
  // a Réunion key left on the Minnesota row routes Réunion and São Paulo events
  // onto it. This asserts no such event is there, against a positive control that
  // the row serves events at all.
  test("Saint-Paul, Réunion's events are not presented on Minnesota", async ({ request }) => {
    const minnesota = await anonGet(
      request,
      'cities?select=id&region_name=eq.Minnesota&duplicate_of_id=is.null' +
        '&or=(name.eq.Saint Paul,name.eq.St. Paul)',
    );
    expect(minnesota).toHaveLength(1);
    const cityId = minnesota[0].id as string;

    const events = await anonGet(
      request,
      `events?select=id,title,city,country&city_id=eq.${cityId}&limit=500`,
    );

    // POSITIVE CONTROL: "no Réunion event here" is equally true of a city with no
    // events, a broken filter and a revoked grant. 3 events on prod when written.
    expect(
      events.length,
      'the Minnesota row serves no events at all, so the Réunion check below is vacuous',
    ).toBeGreaterThan(0);

    // RE is Réunion, BR is Brazil (São Paulo) — the two the removed aliases named.
    const foreign = events.filter((e) => ['RE', 'BR'].includes(String(e.country)));
    expect(
      foreign.map((e) => `${e.title} (${e.country})`),
      'a Réunion/Brazil event is presented on St. Paul, Minnesota — an alias is routing it',
    ).toHaveLength(0);

    // And by the city TEXT, which is what the alias arm of `run_event_city_link`
    // matches on, so it catches a row whose country was never filled.
    const misnamed = events.filter((e) => /r[eé]union|s[aã]o paulo/i.test(String(e.city ?? '')));
    expect(
      misnamed.map((e) => `${e.title} (${e.city})`),
      'an event naming Réunion/São Paulo is presented on St. Paul, Minnesota',
    ).toHaveLength(0);
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
