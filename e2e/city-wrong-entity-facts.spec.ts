import { test, expect } from '@playwright/test';

// A city page must never publish facts belonging to a DIFFERENT city of the
// same name.
//
// Measured 2026-09-18: 146 US city rows carried a `wikipedia_title` naming a
// city in a different US state, and 143 had already published from it —
// 139 postal codes, 114 area codes, 48 NAMED MAYORS. `Washington, D.C.` listed
// "Donald Sadler", the mayor of Washington, NORTH CAROLINA. Columbus, Ohio
// carried Columbus GEORGIA's mayor, universities and sister cities. Saint Paul,
// Minnesota carried the mayor of Saint-Paul, RÉUNION. Retracted in
// 99991789819768_city_wikidata_not_a_place.
//
// Publishing a named real person as the mayor of a city they have no connection
// to is the sharpest harm here, which is why it is the thing asserted.
//
// WHY THIS IS AN SPA SPEC AND NOT A CRAWLER-HTML ONE, unlike its tag siblings:
// verified against prod, the crawler HTML for /city/:slug renders venues,
// events and trip-planning only — it carries no factual block at all, so a
// crawler assertion here would be vacuously true. The fact rows are built in
// CityOverviewTab.tsx (`if (city.mayor) facts.push(...)`), i.e. client-side.
//
// EVERY NEGATIVE IS PAIRED WITH A POSITIVE, the discipline the tag specs use:
// "does not mention Donald Sadler" passes on a 404, on an empty render, and on
// a page that failed to load. So each repaired city must first prove it
// rendered, and BERLIN IS THE CONTROL — 994 cities still legitimately publish a
// mayor, and Berlin's ("Kai Wegner") must still be on the page. Without that
// control this whole file would also pass against a build that simply stopped
// rendering the mayor row for everyone.

const BASE = process.env.E2E_BASE_URL ?? 'https://queer.guide';

interface Case {
  slug: string;
  /** Proof the page actually rendered. */
  present: RegExp;
  /** Facts belonging to the wrong same-name city. */
  absent: { needle: RegExp; why: string }[];
}

const REPAIRED: Case[] = [
  {
    slug: 'washington-d-c',
    present: /Washington/i,
    absent: [
      { needle: /Donald\s+Sadler/i, why: 'mayor of Washington, North Carolina' },
      { needle: /\b27889\b/, why: 'Washington NC postal code' },
    ],
  },
  {
    slug: 'columbus',
    present: /Columbus/i,
    absent: [
      { needle: /Skip["\s]*Henderson/i, why: 'mayor of Columbus, Georgia' },
      { needle: /Columbus State University/i, why: 'a Columbus, Georgia university' },
      { needle: /\b31901\b/, why: 'Columbus GA postal code' },
    ],
  },
  {
    slug: 'saint-paul',
    present: /Saint\s*Paul/i,
    absent: [
      { needle: /Joseph\s+Sinimal/i, why: 'mayor of Saint-Paul, Réunion' },
      { needle: /\b97411\b/, why: 'a Réunion postal code' },
      // The description opened "the second-largest commune in the French
      // overseas department of Réunion" — on a Minnesota page. Retracted by
      // 20260919140930, guarded on the prose naming the wrong place.
      { needle: /R[ée]union/i, why: "Saint-Paul, Réunion's description" },
    ],
  },
  {
    // The non-US half of the same defect (20260919141647). León, Guanajuato
    // carried Q15699 — León, SPAIN — and published its mayor, postcodes, area
    // code, twinnings and university. Its Mexican description and population
    // came from elsewhere and are correct, which is why they are asserted to
    // SURVIVE in the test below rather than merely left alone.
    slug: 'leon',
    present: /Le[oó]n/i,
    absent: [
      { needle: /Jos[ée]\s+Antonio\s+Diez/i, why: 'mayor of León, SPAIN' },
      { needle: /24001/, why: 'a León, Spain postal code' },
      { needle: /University of Le[oó]n/i, why: "León Spain's university" },
    ],
  },
];

/** Give the SPA a chance to hydrate and paint the overview tab. */
async function cityText(page: import('@playwright/test').Page, slug: string) {
  const res = await page.goto(`${BASE}/city/${slug}`, {
    waitUntil: 'domcontentloaded',
    timeout: 45_000,
  });
  expect(res?.status(), `${slug} must not 404`).toBeLessThan(400);
  await page.waitForLoadState('networkidle', { timeout: 45_000 }).catch(() => {});
  return (await page.locator('body').innerText()).replace(/\s+/g, ' ');
}

test.describe('city pages do not publish another same-name city’s facts', () => {
  for (const c of REPAIRED) {
    test(`/city/${c.slug}`, async ({ page }) => {
      const text = await cityText(page, c.slug);

      // Positive first: without this every negative below is vacuous.
      expect(text, `${c.slug} did not render`).toMatch(c.present);
      expect(text.length, `${c.slug} rendered an empty body`).toBeGreaterThan(200);

      for (const { needle, why } of c.absent) {
        expect(text, `/city/${c.slug} still publishes ${needle} — ${why}`).not.toMatch(needle);
      }
    });
  }

  test('control: León keeps its own correct Mexican prose', async ({ page }) => {
    // The repair retracted every Wikidata-derived field on this row but NOT the
    // description or population, which came from another source and are right.
    // Without this the León case above would also pass against a pass that
    // simply blanked the page — the over-reach the migrations argue against.
    const text = await cityText(page, 'leon');
    expect(text, 'León lost its correct Mexican description').toMatch(/Guanajuato/i);
  });

  test('control: Berlin still publishes its own real mayor', async ({ page }) => {
    // 994 cities legitimately carry a mayor. If this fails, the repair (or a
    // later change) stopped rendering the mayor row for everyone and every
    // assertion above is passing for the wrong reason.
    const text = await cityText(page, 'berlin');
    expect(text).toMatch(/Berlin/i);
    expect(text, 'Berlin lost its mayor — the negatives above are now vacuous').toMatch(
      /Kai\s+Wegner/i,
    );
  });
});
