import { test, expect, type APIRequestContext } from '@playwright/test';
import { anonHeaders, SUPABASE_REST_URL } from './support/anonKey';

// City and village cleanup of 2026-11-20 (PRs #5426, #5438): one place stored
// twice under two spellings (Gent/Ghent, Kolmar/Colmar, typos, postal
// districts), parishes and districts filed as cities, official municipal
// forms (Township of, X kommun). Every merge went through merge_cities /
// _queer_village_merge_core and is reversible.
//
// INVARIANTS, NOT COUNTS: each old URL leads to the surviving page, the
// survivor renders under its English name, and no merged or archived row is
// live again. Read through the anon role and a crawler UA, which is what a
// visitor and a search engine are served.

const CRAWLER = { 'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)' };

/** Old city slug -> surviving slug. */
const CITY_REDIRECTS: Array<[string, string]> = [
  ['ghent', 'gent'],
  ['menen', 'menin'],
  ['weiden-i-d-opf', 'weiden-in-der-oberpfalz'],
  ['immenstadt-i-allgaeu', 'immenstadt-im-allgaeu'],
  ['bautzen-budy-in', 'bautzen'],
  ['caldas-novas-go', 'caldas-novas'],
  ['singen-hohentwiel', 'singen'],
  ['sankt-ingbert', 'st-ingbert'],
  ['lake-worth', 'lake-worth-beach'],
  ['township-of-minden-hills', 'minden-hills'],
  ['borough-of-rossendale', 'rossendale'],
  ['vaexjoe-kommun', 'vaexjoe'],
  ['alfenas-mg', 'alfenas'],
  ['ananideua', 'ananindeua'],
  ['anapolis-go', 'anapolis'],
  ['ciuitadella', 'ciutadella'],
  ['el-carmen-de-vibora', 'el-carmen-de-viboral'],
  ['esbjerg-v', 'esbjerg'],
  ['odense-c', 'odense'],
  ['san-pedero-de-atacama', 'san-pedro-de-atacama'],
  ['sundsvalls-stad', 'sundsvall'],
  ['tlalnepantla-de-baz', 'tlalnepantla'],
  ['xabia-javea', 'xabia'],
  ['tanums-kommun', 'tanumshede'],
];

/** Surviving slug -> English display name it must render under. */
const RENAMED: Array<[string, string]> = [
  ['gent', 'Ghent'],
  ['luzern', 'Lucerne'],
  ['ystads-kommun', 'Ystad'],
];

/** Old village slug -> surviving village slug. */
const VILLAGE_REDIRECTS: Array<[string, string]> = [
  ['eureka-valley', 'castro-district'],
  ['west-village-nyc', 'greenwich-village'],
  ['kings-cross-sydney', 'darlinghurst'],
  ['taylor-square', 'darlinghurst'],
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

test.describe('city exonym / district cleanup', () => {
  test('the anon role can read cities at all', async ({ request }) => {
    // Positive control: without it every "not live" assertion below passes on a broken read.
    const rows = await anonGet(request, 'cities?select=slug&slug=eq.gent&duplicate_of_id=is.null');
    expect(rows).toHaveLength(1);
  });

  for (const [from, to] of CITY_REDIRECTS) {
    test(`/city/${from} leads to /city/${to}`, async ({ request }) => {
      const res = await request.get(`/city/${from}`, { headers: CRAWLER, maxRedirects: 0 });
      expect(res.status(), `/city/${from}`).toBe(301);
      expect(new URL(res.headers()['location'] ?? '', 'https://queer.guide').pathname).toBe(
        `/city/${to}`,
      );
      // The survivor is the live row. Thin or freshly-merged ghost survivors are
      // deliberately deindexed (the crawler gets 404) until the nightly trust
      // recompute promotes them, so a 200 is only required where indexable.
      const [survivor] = await anonGet(
        request,
        `cities?select=seo_indexable&slug=eq.${to}&duplicate_of_id=is.null`,
      );
      expect(survivor, `${to} is not a live city`).toBeTruthy();
      if (survivor.seo_indexable) {
        const page = await request.get(`/city/${to}`, { headers: CRAWLER, maxRedirects: 0 });
        expect(page.status(), `/city/${to}`).toBe(200);
      }

      const dropped = await anonGet(request, `cities?select=id&slug=eq.${from}&duplicate_of_id=is.null`);
      expect(dropped, `${from} is live again`).toHaveLength(0);
    });
  }

  for (const [slug, name] of RENAMED) {
    test(`/city/${slug} renders as ${name}`, async ({ request }) => {
      const page = await request.get(`/city/${slug}`, { headers: CRAWLER, maxRedirects: 0 });
      expect(page.status()).toBe(200);
      expect(await page.text()).toContain(`<title>LGBTQ+ guide to ${name} `);
    });
  }

  for (const [from, to] of VILLAGE_REDIRECTS) {
    test(`/villages/${from} leads to /villages/${to}`, async ({ request }) => {
      const res = await request.get(`/villages/${from}`, { headers: CRAWLER, maxRedirects: 0 });
      expect(res.status(), `/villages/${from}`).toBe(301);
      expect(new URL(res.headers()['location'] ?? '', 'https://queer.guide').pathname).toBe(
        `/villages/${to}`,
      );
    });
  }

  test('no parish or district row is a live city', async ({ request }) => {
    const parishes = await anonGet(
      request,
      'cities?select=slug&name=ilike.parroquia*&duplicate_of_id=is.null&shell_status=neq.ghost',
    );
    expect(parishes).toHaveLength(0);
    for (const name of ['Distrito Industrial', 'Cherwell District', 'Lake Tahoe', 'Leicestershire']) {
      const rows = await anonGet(
        request,
        `cities?select=slug&name=eq.${encodeURIComponent(name)}&duplicate_of_id=is.null&shell_status=neq.ghost`,
      );
      expect(rows, `${name} is a live city`).toHaveLength(0);
    }
  });

  test('Valencia, Venezuela exists as a live city', async ({ request }) => {
    // Created to replace the parish rows that stood in for it. Its venues are
    // cruising/restroom listings, which anon cannot read by design, so the
    // venue move is asserted by the migration rather than here.
    const [ve] = await anonGet(request, 'countries?select=id&code=eq.VE');
    const rows = await anonGet(
      request,
      `cities?select=id&name=eq.Valencia&country_id=eq.${ve.id}&duplicate_of_id=is.null`,
    );
    expect(rows, 'Valencia VE missing').toHaveLength(1);
  });
});
