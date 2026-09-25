import { test, expect } from '@playwright/test';

// City pages must not publish another PLACE's encyclopaedia article.
//
// The namesake chimera the glossary and the personalities already had, on places,
// where it makes a travel platform tell a reader that Frisco, Texas IS San
// Francisco. `city-factual-backfill` adopted a Wikidata id whose coordinates sit
// thousands of kilometres from the row's own, then wrote the description, the mayor
// and the cached `wikipedia_title` from that entity. Measured 2026-09-20 by
// sweeping all 2,959 QID-bearing cities against live Wikidata P625: 167 fail the
// platform's own CITY_COORD_MAX_KM = 100 bound, 123 of them indexable. Eleven were
// hand-confirmed as wrong IDENTIFIERS (rather than our own wrong coordinates) and
// repaired by 99991790358713; the DB regression is watched by
// `city_wikidata_signals()` in check-pipeline-health.
//
// Asserted over the CRAWLER HTML (`functions/_lib/detail.ts`), not the SPA, for the
// reasons the tag spec gives: it is what a non-JS crawler indexes, and one plain GET
// costs ~0.4s against ~11s for an SPA boot.
//
// Every case pairs a NEGATIVE with a POSITIVE fingerprint. "Does not mention San
// Francisco" also passes on a 404, on an empty body and on a page that failed to
// render — the positive half is what makes the negative half mean anything. Here the
// positive is the city's OWN NAME in the document title, because the repair
// deliberately leaves these rows with NO description: it retracts the wrong article
// rather than inventing a right one, so there is no prose fingerprint to assert.

const BOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const BASE = process.env.PROD_BASE_URL ?? 'https://queer.guide';

interface Case {
  slug: string;
  /** The row's own name, which must still be in the <title>. */
  present: RegExp;
  /** Fragments of the wrong place that must be gone from the document. */
  absent: RegExp[];
  /** What the row had been mistaken for, for the failure message. */
  was: string;
}

const CASES: Case[] = [
  {
    slug: 'frisco-us-xyxtu',
    was: 'San Francisco (Q62) — 2,366 km away',
    present: /Frisco/i,
    absent: [/City and County of San Francisco/i, /Daniel Lurie/i],
  },
  {
    slug: 'par-gb-n8jw1',
    was: 'Paris (Q90) — 535 km away',
    present: /\bPar\b/i,
    absent: [/capital and largest city of France/i, /Emmanuel Gr[eé]goire/i, /City of Light/i],
  },
  {
    slug: 'pittsburg-us-8m9nd',
    was: 'Pittsburgh, Pennsylvania (Q1342) — 3,584 km away',
    present: /Pittsburg/i,
    absent: [/Allegheny County/i, /Corey O'?Connor/i],
  },
  {
    slug: 'saint-peters-gb-y5sot',
    was: "Saint Petersburg, Russia (Q656) — and a Pennsylvania village's description",
    present: /Saint Peters/i,
    absent: [/Alexander Beglov/i, /Chester County, Pennsylvania/i, /French Creek/i],
  },
  {
    slug: 'kos-gr-9jvjc',
    was: 'Koszalin, Poland (Q62868) — 2,103 km away',
    present: /\bKos\b/i,
    absent: [/Koszalin/i, /Kashubian/i, /Tomasz Sobieraj/i],
  },
  {
    slug: 'city-of-troy',
    was: 'Troy, the ancient Homeric city (Q22647) — 7,805 km away',
    present: /Troy/i,
    absent: [/Ilion/i, /[ÇC]anakkale/i, /Homer/i],
  },
  {
    slug: 'arabkir',
    was: 'Arapgir, Malatya, Turkey (Q626165) — 531 km away',
    present: /Arabkir/i,
    absent: [/Arapgir/i, /Malatya/i, /Erebgir/i],
  },
  {
    slug: 'ganda',
    was: 'Gandapura, Aceh, Indonesia (Q3958155) — 9,303 km away',
    present: /Ganda/i,
    absent: [/Gandapura/i, /Bireu[ëe]n/i, /kecamatan/i],
  },
  {
    slug: 'guara',
    was: 'Guaratinguetá, São Paulo (Q905157) — 831 km away',
    present: /Guar[aá]/i,
    absent: [/Guaratinguet[aá]/i],
  },
  {
    slug: 'n-yf',
    was: 'Nayfeld, Jewish Autonomous Oblast, Russia (Q2813294) — 7,060 km away',
    present: /N[āa]yf/i,
    absent: [/Nayfeld/i, /Birobidzhansky/i, /Найфельд/],
  },
  {
    slug: 'oetz',
    was: 'Oetzen, Lower Saxony (Q680480) — 217 km away',
    present: /Oetz/i,
    absent: [/Oetzen/i, /Uelzen/i],
  },
];

test.describe('city pages do not publish another place’s article', () => {
  for (const c of CASES) {
    test(`/city/${c.slug} is not ${c.was}`, async ({ request }) => {
      const res = await request.get(`${BASE}/city/${c.slug}`, {
        headers: { 'User-Agent': BOT_UA },
      });
      expect(res.status(), `/city/${c.slug} should render for a crawler`).toBe(200);
      const html = await res.text();

      // POSITIVE half. Without this every `absent` assertion below is satisfied by a
      // 404, an empty body, or a page that failed to render.
      expect(html, `/city/${c.slug} did not render its own name`).toMatch(c.present);

      for (const bad of c.absent) {
        expect(
          html,
          `/city/${c.slug} still publishes ${c.was}: matched ${bad}`,
        ).not.toMatch(bad);
      }
    });
  }

  // CONTROL. Burj Hammoud was in the same 167-row candidate set and was deliberately
  // NOT repaired: its longitude is exactly 0.000000, so the 3,264 km measures OUR
  // coordinate defect, and its identifier Q895235 and its article are both correct.
  // If a later pass "cleans" it, this fails — the sweep is a candidate generator, not
  // the decision.
  test('/city/burj-hammoud keeps its CORRECT article (excluded by hand)', async ({ request }) => {
    const res = await request.get(`${BASE}/city/burj-hammoud`, {
      headers: { 'User-Agent': BOT_UA },
    });
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toMatch(/Bourj Hammoud|Burj Hammoud/i);
    expect(html, 'Burj Hammoud lost its correct Lebanon article').toMatch(/Lebanon|Beirut/i);
  });
});
