import { test, expect } from '@playwright/test';

// The Positions stop must stay GATED, and the three disambiguated names must
// not have hijacked the tags they collide with.
//
// Why this spec exists: inserting a tag with `category_id` alone does NOT file
// it. Measured on prod in a rolled-back transaction before the import shipped —
// `trg_sync_tag_category` is BEFORE **UPDATE** and `trg_sync_tag_category_after`
// is AFTER **UPDATE OF category_id**, so neither fires on INSERT and a bare
// insert yields `category` NULL, ZERO `tag_category_assignments` rows, and
// therefore `is_adult=false` + `seo_indexable=true`. `is_adult` is recomputed by
// a trigger ON THE JUNCTION TABLE, so with no junction row it simply never runs.
// The failure mode is silent and the wrong way round: 153 adult tags published
// as publicly indexable pages that look correctly filed by `category_id`.
//
// The migrations assert that server-side. This asserts the reader-visible half,
// on the crawler surface, which is where the damage would be lasting.
//
// Discipline copied from tags-wrong-sense.spec.ts: crawler HTML (~0.4s a GET),
// and every negative is paired with a POSITIVE CONTROL — "does not say
// index,follow" is vacuously true of a 404 or an empty body.

const BOT_UA =
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

/** `<meta name="robots" content="...">`, lower-cased, or '' when absent. */
function robotsOf(html: string): string {
  const m = html.match(
    /<meta[^>]+name=["']robots["'][^>]*content=["']([^"']*)["']/i,
  );
  return m ? m[1].toLowerCase() : '';
}

/**
 * A spread of the import: base, renamed, disambiguated, oral, group, archive.
 *
 * `69` and `doggy-style` are deliberately NOT here even though the import
 * re-files them into this stop. The crawler surface keys on ONE column —
 * `functions/_lib/detail.ts` returns `indexable: row.seo_indexable !== false`
 * for the tag branch, and `is_adult` does not enter into it. Both of those
 * tags are `human_reviewed`, so `enforce_tag_seo_sensitivity_gate()` never
 * forces their `seo_indexable` to false (a human-reviewed adult tag staying
 * indexable is the doxy-pep precedent), and asserting noindex on them would
 * fail against correct data. Every row the import INSERTS is
 * `human_reviewed=false`, so the gate governs all of those.
 */
const GATED = [
  'missionary', // plain base position
  'spit-roast', // group
  'squatting-cowboy', // renamed away from the source's "Asian Cowboy"
  'butterfly-position', // disambiguated from the Slang tag
  'standing-blowjob', // oral
  'over-the-rainbow', // the Lovehoney/archive migration
  'double-penetration', // re-filed, and not human_reviewed-indexable
];

test.describe('@smoke Positions tags are age-gated and deindexed', () => {
  // POSITIVE CONTROL FIRST. If robotsOf() stopped finding the tag, or every
  // /tags/* URL started 404ing, the noindex assertions below would all pass
  // for the wrong reason. This proves the probe can observe an INDEXABLE tag.
  test('control: an indexable tag is not noindex', async ({ request }) => {
    const res = await request.get('/tags/chosen-family', {
      headers: { 'User-Agent': BOT_UA },
    });
    expect(res.status(), '/tags/chosen-family should resolve').toBe(200);
    const html = await res.text();
    expect(html.length, 'crawler HTML should not be empty').toBeGreaterThan(500);
    expect(
      robotsOf(html),
      'chosen-family is a normal indexable tag — if THIS reads noindex the ' +
        'probe is measuring something other than the seo gate',
    ).not.toMatch(/noindex/);
  });

  for (const slug of GATED) {
    test(`/tags/${slug} is noindex`, async ({ request }) => {
      const res = await request.get(`/tags/${slug}`, {
        headers: { 'User-Agent': BOT_UA },
      });
      // A position tag that 404s is a different bug (missing row) but still a
      // bug — assert the row exists before asserting how it is gated.
      expect(res.status(), `/tags/${slug} should exist`).toBe(200);
      expect(
        robotsOf(await res.text()),
        `/tags/${slug} is adult and must be deindexed — an indexable one means ` +
          'its junction row is missing, so is_adult never recomputed',
      ).toMatch(/noindex/);
    });
  }
});

test.describe('Positions did not hijack the tags it collides with', () => {
  // unified_tags has no unique index on `name`, and run_tag_assignment_reconcile
  // builds its lookup from lower(name) with tag_id only as a TIEBREAKER — two
  // active tags sharing a name is the defect that already broke 21 keys there.
  // Butterfly is the readable case: it is a Slang tag (a flirty gay man), it is
  // NOT adult, and it stays indexable, so its prose is visible to this surface.
  // If the import had reused the bare name, this page would have moved.
  test('/tags/butterfly is still the Slang sense, not the position', async ({
    request,
  }) => {
    const res = await request.get('/tags/butterfly', {
      headers: { 'User-Agent': BOT_UA },
    });
    expect(res.status()).toBe(200);
    const html = await res.text();

    // Positive fingerprint: the surviving Slang definition.
    expect(
      html,
      '/tags/butterfly lost its own prose — it may have been overwritten',
    ).toMatch(/flirt/i);

    // Negative: none of the position's vocabulary leaked onto it.
    for (const bad of [/kneels upright between/i, /legs wrapped around/i]) {
      expect(
        html,
        `/tags/butterfly is publishing the POSITION sense (matched ${bad})`,
      ).not.toMatch(bad);
    }
  });
});
