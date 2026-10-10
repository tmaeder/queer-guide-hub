import { expect, test, type APIRequestContext } from '@playwright/test';
import { anonHeaders, SUPABASE_REST_URL } from './support/anonKey';

/**
 * Prod guard for glossary photography (99991791616254 / 99991791616269 /
 * 99991791617122).
 *
 * WHAT THIS FEATURE IS, because it decides what can be asserted. Tag photos
 * were RETIRED on 2026-08-28: `20261003100000_tag_image_retirement.sql` cleared
 * 1,590 of them because they were the top-1 Pexels/Unsplash hit for a
 * keyword-mapped tag name, and 1,262 of the 1,590 had no recoverable licence.
 * Re-introducing them therefore ships the three retirement conditions as
 * STRUCTURE rather than as intentions: a write-time contract trigger, a partial
 * unique index, and a sentinel. This file is the live half of that.
 *
 * EVERYTHING HERE IS AN INVARIANT, NOT A TRANSIENT STATE, and that is a rule
 * this suite has gone red for breaking three times in one session.
 * `e2e/geo-namesake-city-links.spec.ts` pinned a detach (`venue_id === null`)
 * and a retraction (`latitude === null`) — states the system is DESIGNED to
 * fill back in — so both failed for the fixes having worked. There are zero tag
 * photos on prod today, so the tempting assertion ("a licensed image renders
 * with its credit") would be red on arrival and would then go red AGAIN, in the
 * other direction, the day acquisition runs. Nothing below asserts a count of
 * published images. Every assertion holds at zero photos and still holds at
 * fifteen hundred.
 *
 * WHY THE REST LAYER CARRIES THE CONTRACT ASSERTIONS AND THE CRAWLER DOES NOT.
 * Placement is a BODY BAND (`TagFigure`, `<section id="photo">`) and
 * `functions/_lib/detail.ts` is deliberately UNTOUCHED by this change — fork-
 * point diff over `functions/` is empty — so the band is SPA-only and a tag's
 * `og:image` stays the site card. A crawler fetch therefore CANNOT see the
 * band at all, which makes crawler HTML the wrong surface for "is this image
 * licensed" and the RIGHT surface for "no tag photo reaches a social card".
 * Both are asserted, each on the surface that can actually see it.
 *
 * WHY ANON RATHER THAN service_role. Anon is the role the client uses, so it is
 * what a reader is served. The corpus-wide forms that anon cannot see live in
 * the migrations' own postconditions and in
 * src/lib/__tests__/ (both read as service_role) — the split
 * `e2e/geo-namesake-city-links.spec.ts` already documents, where a sweep run
 * from a role that cannot read safety-gated rows checks a subset and reports it
 * as the whole.
 *
 * EXPECTED STATE BEFORE THE MIGRATIONS APPLY: 3 passed, 2 failed. Both
 * failures are `42703 column unified_tags.image_explicit does not exist` —
 * `99991791616269_tag_image_contract.sql` adds that column, so the two contract
 * assertions cannot pass until it lands. Measured rather than predicted, and
 * recorded here because the house rule is to run a prod guard BEFORE the merge
 * and check that every failure is one you can explain: a failure you cannot
 * explain is the one that matters, and it is invisible among failures you
 * expected but never wrote down. After the merge all 5 must pass, and the two
 * crawler assertions already do.
 *
 * DELIBERATELY NOT ASSERTED: "no asset is the cover of two tags". That is the
 * user's "never the same picture on two pages" rule, and it is enforced by the
 * partial unique index `tag_cover_one_tag_uniq` on
 * `image_asset_links (asset_id) WHERE entity_type='tag' AND role='cover'`. A
 * unique index cannot be violated, so a test asserting it would be theatre —
 * and worse, it would read as the guard, so a later migration dropping the
 * index would leave a green test standing over the hole. The index's existence
 * is asserted by the migration's own verify block, which pushes a second link
 * through it and expects 23505.
 */

const BOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

/**
 * The R2 key namespace tag photos are mirrored into
 * (`supabase/functions/upload-image-r2/index.ts` allows it by name). A tag
 * photo's URL contains this; the site card's does not, which is what makes the
 * og:image assertion below able to tell them apart.
 */
const TAG_IMAGE_PREFIX = 'tag-images';

/** How many indexable tags the crawler assertions sample. */
const CRAWLER_SAMPLE = 5;

/**
 * The slugs for the crawler assertions, DERIVED FROM `sitemap-tags.xml` rather
 * than written here — and the first draft of this file got that wrong in a way
 * worth recording, because it failed against perfectly healthy pages.
 *
 * It hardcoded `consent`, `bdsm`, `kinbaku`, `pinkwashing`, `drag`, taken from
 * slugs this repo's own notes cite as long-standing. All five return HTTP 200
 * with a correct `<title>`, and **none of them has a server-rendered body**:
 * measured, `/tags/consent` is 27 KB whose only `<h1>` reads "Crisis support",
 * i.e. the SPA shell with injected `<head>` meta and nothing else. Only an
 * INDEXABLE tag gets a body, and most glossary rows are deindexed by the
 * thin-page gate — 1,196 of 8,460 active tags are in the sitemap. So a
 * hardcoded list is one deindexing away from asserting nothing, and the
 * failure reads as "the crawler is broken" rather than "my list is stale".
 *
 * The sitemap IS the set of pages that have a body, so asking it is both
 * correct today and self-correcting later. Same discipline as
 * `substance_interaction_matrix`'s credit assertion, which derives its
 * expectation from the page's own response because a list written in the spec
 * goes green the day the real set changes under it.
 */
async function indexableTagSlugs(request: APIRequestContext): Promise<string[]> {
  const res = await request.get('https://queer.guide/sitemap-tags.xml');
  expect(res.ok(), `sitemap-tags.xml did not render (${res.status()})`).toBeTruthy();

  const slugs = [
    ...new Set(
      [...(await res.text()).matchAll(/<loc>[^<]*\/tags\/([^</]+)<\/loc>/g)].map((m) => m[1]),
    ),
  ];
  // POSITIVE CONTROL: an empty sitemap would make every crawler assertion below
  // iterate zero times and pass having checked nothing.
  expect(slugs.length, 'sitemap-tags.xml lists no tag pages').toBeGreaterThan(0);
  return slugs.slice(0, CRAWLER_SAMPLE);
}

/** The eight columns the contract governs. */
const IMAGE_COLUMNS =
  'slug,image_url,image_alt,image_source,image_license,image_attribution,image_explicit,is_adult';

/**
 * A counted anon read. Returns the total matching rows, which is what makes a
 * zero meaningful: `Prefer: count=exact` is answered in `content-range` even
 * for an empty page, so this never pages and never truncates at PostgREST's
 * 1000-row cap.
 */
async function countRows(request: APIRequestContext, query: string): Promise<number> {
  const res = await request.get(`${SUPABASE_REST_URL}/rest/v1/${query}`, {
    headers: {
      ...(await anonHeaders(request)),
      Prefer: 'count=exact',
      Range: '0-0',
    },
  });
  expect(
    res.ok(),
    `anon read failed for ${query} (${res.status()}): ${await res.text()} — a failed probe ` +
      'must never read as a clean corpus',
  ).toBeTruthy();
  const range = res.headers()['content-range'] ?? '';
  const total = Number(range.split('/')[1]);
  expect(
    Number.isFinite(total),
    `no exact count in content-range (${range}) for ${query}`,
  ).toBeTruthy();
  return total;
}

test.describe('glossary photography contract (prod, anon role)', () => {
  test('POSITIVE CONTROL: anon can read the image columns at all', async ({ request }) => {
    // Without this the three invariants below are vacuous. Column-level GRANTs
    // are per-role in this project (`public.profiles` has three separate
    // allowlists), so a column the anon role cannot select makes PostgREST
    // answer 400/42703 — and a spec that swallowed that would report every
    // count as zero and look healthy. It must fail loudly here instead.
    const res = await request.get(
      `${SUPABASE_REST_URL}/rest/v1/unified_tags?select=${IMAGE_COLUMNS}&status=eq.active&limit=5`,
      { headers: await anonHeaders(request) },
    );
    expect(
      res.ok(),
      `anon cannot select the image columns (${res.status()}): ${await res.text()}`,
    ).toBeTruthy();

    const rows = (await res.json()) as unknown[];
    // A non-empty corpus is the second half of the control: zero rows would
    // satisfy every invariant below while proving nothing.
    expect(rows.length, 'anon sees no active tags at all').toBeGreaterThan(0);
  });

  test('a published tag photo always carries its licence, attribution, source and alt', async ({
    request,
  }) => {
    // The retirement's central finding: 1,262 of 1,590 photos had no
    // recoverable licence. A CC BY-SA image without a visible credit is a
    // licence breach rather than a styling preference, so the contract trigger
    // refuses the write — this asserts the result on live data, through the
    // role a reader uses.
    //
    // Reported FIRST so the zero below is legible: with no photos published
    // this invariant is trivially satisfied, and a reader of CI output needs to
    // know which of the two situations they are in.
    const published = await countRows(
      request,
      'unified_tags?select=slug&status=eq.active&image_url=not.is.null',
    );
    const unlicensed = await countRows(
      request,
      'unified_tags?select=slug&status=eq.active&image_url=not.is.null' +
        '&or=(image_license.is.null,image_attribution.is.null,image_source.is.null,image_alt.is.null)',
    );

    expect(
      unlicensed,
      `${unlicensed} of ${published} published tag photos are missing licence, attribution, ` +
        'source or alt text — the contract trigger should have refused the write',
    ).toBe(0);
  });

  test('explicit imagery never publishes on a tag that is not behind the adult gate', async ({
    request,
  }) => {
    // The user's explicitness decision: explicit imagery is allowed, ONLY on
    // `is_adult` rows, and never on og:image, search thumbnails or the glossary
    // index. `is_adult` rows ARE anon-readable (measured: `play-collar` and
    // `tng` both are), so the REST layer can see this cohort — the affirmation
    // is a client gate on top, asserted by src/components/tags/__tests__/.
    //
    // What must never happen is an explicit photo on a row that carries no gate
    // at all, which is the half no client check can rescue.
    const explicit = await countRows(
      request,
      'unified_tags?select=slug&status=eq.active&image_explicit=is.true',
    );
    const ungated = await countRows(
      request,
      'unified_tags?select=slug&status=eq.active&image_explicit=is.true&is_adult=is.false',
    );

    expect(
      ungated,
      `${ungated} of ${explicit} explicit tag photos sit on a tag that is not is_adult`,
    ).toBe(0);
  });

  test('a tag page never serves a tag photo as its og:image', async ({ request }) => {
    // Placement is a body band, so `og:image` stays the site card. This is the
    // assertion that keeps that decision — explicit imagery must not reach a
    // social card, and `functions/_lib/detail.ts` is the only thing that could
    // put it there.
    const slugs = await indexableTagSlugs(request);
    let checked = 0;

    for (const slug of slugs) {
      const res = await request.get(`https://queer.guide/tags/${slug}`, {
        headers: { 'User-Agent': BOT_UA },
      });
      if (!res.ok()) continue;
      const html = await res.text();

      const og = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i.exec(html);
      // POSITIVE CONTROL: no og:image at all means the head did not render, and
      // "the og:image is not a tag photo" would then be vacuously true.
      if (!og) continue;
      checked += 1;

      expect(
        og[1],
        `/tags/${slug} serves ${og[1]} as og:image — a tag photo must not reach a social card`,
      ).not.toContain(TAG_IMAGE_PREFIX);
    }

    expect(
      checked,
      `none of the ${slugs.length} sampled tag pages produced an og:image, so this assertion ` +
        'checked nothing — the crawler head is broken',
    ).toBeGreaterThan(0);
  });

  test('the photo band is absent from crawler HTML, by design', async ({ request }) => {
    // Pins the placement decision rather than merely restating it in a comment.
    // If a later change teaches `functions/_lib/detail.ts` to render the band,
    // explicit imagery reaches crawlers and the og:image assertion above is no
    // longer sufficient on its own — this goes red first.
    const slugs = await indexableTagSlugs(request);
    let rendered = 0;

    for (const slug of slugs) {
      const res = await request.get(`https://queer.guide/tags/${slug}`, {
        headers: { 'User-Agent': BOT_UA },
      });
      if (!res.ok()) continue;
      const html = await res.text();

      // POSITIVE CONTROL: a tag with no server-rendered body emits no
      // `<article>`, and absence of the band in a page with no body is not
      // evidence about the band. This is what the hardcoded-slug draft tripped
      // over — see `indexableTagSlugs` above.
      if (!/<article[\s>]/i.test(html)) continue;
      rendered += 1;

      expect(
        html,
        `/tags/${slug} renders the photo band in crawler HTML — placement is SPA-only`,
      ).not.toContain('id="photo"');
    }

    expect(
      rendered,
      `none of the ${slugs.length} sampled tag pages emitted an <article>, so the ` +
        'band-absence assertion checked nothing',
    ).toBeGreaterThan(0);
  });
});
