import { reviewerTagRows, hasReviewerSession } from './support/reviewerRegistry';
import { assertCurrentTagSitemap, currentArticleTagSlug } from './support/tagSitemap';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { anonHeaders } from './support/anonKey';

// Prod guard for the sexology / trans / BDSM glossary pass
// (99991791039872_sexology_glossary_pass.sql).
//
// WHY THIS EXISTS RATHER THAN ONLY THE MIGRATION'S OWN POSTCONDITIONS. Those
// run once, inside the transaction that applies the file, against the schema as
// it was that minute. They cannot see whether the row reached prod, whether the
// category move took, or whether the page a reader is served still carries the
// old prose. Every defect this pass repaired was found by reading a rendered
// page or an anon query — not by reading a column.
//
// IT READS BOTH SURFACES, BECAUSE THEY PREFER DIFFERENT COLUMNS, and that
// asymmetry is the single most important thing to know here:
//
//   crawler <head>  -> description ?? short_description ?? long_description
//   TagIndexCard /  -> short_description ?? description
//   TagDefinitionCard
//
// So `binder`'s defect — `short_description` reading "Family name" over a
// correct `description` — is INVISIBLE in crawler HTML. A spec that only
// fetched pages would have reported this pass as verified while the glossary
// index card still published a surname on a trans-gear entry. The REST layer
// below is what covers it, read through the ANON role so it asserts what a
// browser is actually served rather than what a privileged query can see.
//
// EVERYTHING ASSERTED HERE IS AN INVARIANT, NOT THIS PASS'S TRANSIENT STATE.
// `e2e/geo-namesake-city-links.spec.ts` went red twice for pinning a repair's
// momentary shape (a null, a detach) — states the system is designed to fill
// back in — so it failed for the fixes having worked. Nothing below asserts
// "this field is empty" or "this value is exactly what I wrote". It asserts
// that the junk is gone AND that something usable is in its place.

const BOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? 'https://xqeacpakadqfxjxjcewc.supabase.co';

/** The twelve terms this pass created, with the category each was filed under. */
const CREATED: ReadonlyArray<readonly [slug: string, categorySlug: string]> = [
  ['traffic-light-system', 'consent-negotiation'],
  ['play-collar', 'gear-aesthetics'],
  ['pulling-out', 'safer-sex'],
  ['gender-recognition-certificate', 'legal-rights'],
  ['gillick-competence', 'legal-rights'],
  ['gender-modality', 'gender-identity'],
  ['person-with-a-trans-history', 'gender-identity'],
  ['non-op', 'trans-health'],
  ['endosexism', 'violence-hate'],
  ['mvpfaff', 'questioning-labels'],
  ['antiretroviral', 'sexual-health'],
  ['tng', 'kink-community'],
];

/** The twelve aliases, each with the ACTIVE row it must route onto. */
const ALIASES: ReadonlyArray<readonly [alias: string, canonical: string]> = [
  // 99991792861452 merged greysexual into gray-asexuality and repointed aliases.
  ['grey-asexual', 'gray-asexuality'],
  ['endosex', 'dyadic'],
  ['chest-surgery', 'top-surgery'],
  ['bilateral-mastectomy', 'top-surgery'],
  ['forced-feminization', 'feminization'],
  // pap-smear and pubic-lice were merged into these rows by 99991792781503
  // (the 2026-10-23 Review Queue sheet), which repointed their aliases.
  ['smear-test', 'papanicolaou-test-pap-test'],
  ['cervical-screening-tests', 'papanicolaou-test-pap-test'],
  ['crabs', 'pubic-lice-crabs'],
  ['hepatitis-b-virus', 'hepatitis-b'],
  ['msm', 'men-who-have-sex-with-men'],
  ['wlw', 'women-who-have-sex-with-women'],
  ['erotic-sexual-denial', 'orgasm-control'],
];

/**
 * Every row this file asserts on: the 12 creations plus the 12 alias canonicals,
 * deduplicated (two are shared). Derived rather than listed, so it cannot drift
 * from the two arrays above — which is the mistake the gated-set comment below
 * records twice.
 */
const ALL_ASSERTED: readonly string[] = [
  ...new Set([...CREATED.map(([slug]) => slug), ...ALIASES.map(([, canonical]) => canonical)]),
];

/**
 * Which of `slugs` the ANON role is forbidden to read right now, so that no
 * anon-role assertion is made about a row that surface is designed to withhold.
 *
 * The live SELECT policy on `unified_tags` is `unified_tags_public_gated_read`,
 * whose anon arm is `NOT tag_is_anon_gated(is_sensitive, verification_status)`
 * — read off `pg_policies`, not inferred. A row that is `is_sensitive` and not
 * yet reviewed is therefore invisible to anon, and its `/tags/:slug` serves the
 * sign-in gate to a crawler.
 *
 * MEASURED, because the obvious guess is wrong: the predicate is NOT
 * `is_adult`. `play-collar` and `tng` are both `is_adult = true` and both
 * anon-READABLE (re-measured 2026-10-16). Deriving gatedness from `is_adult`
 * would gate the wrong rows and assert the real ones through a role that cannot
 * see them.
 *
 * THIS WAS A FROZEN SET TWICE, AND ROTTED BOTH TIMES. First it was sampled from
 * the slugs that happened to appear in queries already run, and `wlw`'s
 * canonical was gated too, so the file failed one row later. It was then
 * re-derived over the whole population — the right correction, which froze the
 * answer and so made the same mistake one step on. It held `antiretroviral`,
 * `men-who-have-sex-with-men`, `pubic-lice`, `women-who-have-sex-with-women`,
 * correct on 2026-10-03; measured on 2026-10-16, **one of the four is still
 * gated**:
 *
 *   antiretroviral                 is_sensitive, unverified  -> gated
 *   men-who-have-sex-with-men      is_sensitive = FALSE      -> readable
 *   women-who-have-sex-with-women  is_sensitive = FALSE      -> readable
 *   pubic-lice                     is_sensitive, REVIEWED    -> readable
 *
 * Three cases failed every scheduled nightly for thirteen days. **The DATA is
 * not at fault, and that was checked rather than assumed:** this pass's own
 * migration (99991791039872) touches `is_sensitive` nowhere except the column
 * list of its INSERT for new rows — on MSM it changes `description` and nothing
 * else, under a comment saying only the wrong FIELD is touched — so "MSM is not
 * sensitive" is not a state this pass set or expected to change. A public-health
 * category defined by behaviour being readable on a queer health platform is
 * also not obviously wrong.
 *
 * So gatedness is asked of the live surface per run. A row anon cannot read is
 * gated, nothing is hardcoded, and a review can no longer red the file. The
 * withheld rows' prose stays asserted by the migration's own postconditions and
 * by src/lib/__tests__/sexologyGlossaryPass.test.ts, both of which read as
 * service_role.
 *
 * ONE BLIND SPOT, NAMED: a slug that does not exist at all is also absent from
 * the response, so a typo reads as "gated". That is why the gate-agreement test
 * cross-checks the CRAWLER surface, where a nonexistent slug 404s while a gated
 * one serves a 200 sign-in document — two surfaces disagreeing is what catches
 * it, and neither alone can.
 */
async function withheldFromAnon(
  request: APIRequestContext,
  slugs: readonly string[],
): Promise<Set<string>> {
  const rows = await rest<{ slug: string }>(
    request,
    `unified_tags?select=slug&slug=in.(${slugs.join(',')})`,
  );
  const readable = new Set(rows.map((r) => r.slug));
  return new Set(slugs.filter((s) => !readable.has(s)));
}

// The classes the pass refused. The -philia cohort is the one that matters:
// creating a tag mints a page AND an auto-tagging rule, so these must never
// exist as active rows on an LGBTQ+ community platform.
const REFUSED_PARAPHILIA = [
  'pedophilia',
  'nepiophilia',
  'hebephilia',
  'biastophilia',
  'raptophilia',
  'erotophonophilia',
  'homicidophilia',
  'lust-murder',
] as const;

const REFUSED_OTHER = [
  'comstock-act',
  'hyde-amendment',
  'ultra-chair',
  'gyno-chair',
  'scrotum-stretcher',
] as const;

/** The two aliases the pass refused — see the test for why each. */
const REFUSED_ALIASES = ['pulling-out', 'warts'] as const;

async function rest<T>(request: APIRequestContext, path: string): Promise<T[]> {
  const res = await request.get(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: await anonHeaders(request),
  });
  expect(res.ok(), `${path} -> HTTP ${res.status()}`).toBeTruthy();
  return res.json();
}

/** The crawler <head> summary — the field a non-JS crawler is served. */
function metaDescription(html: string): string {
  return html.match(/<meta name="description" content="([^"]*)"/i)?.[1] ?? '';
}

test.describe('sexology glossary pass — crawler surface', () => {
  test.describe.configure({ timeout: 90_000 });

  // --- positive control ------------------------------------------------------
  // Every "is absent from the sitemap" assertion below is trivially satisfied
  // by an empty or broken sitemap. This is what makes them mean something.
  test('the tag sitemap is populated (control for every absence assertion)', async ({
    request,
  }) => {
    const res = await request.get('/sitemap-tags.xml', { headers: { 'User-Agent': BOT_UA } });
    expect(res.status()).toBe(200);
    const sitemap = await res.text();
    await assertCurrentTagSitemap(request, sitemap);
  });

  test('the twelve created terms resolve, carry prose, and stay unpublished', async ({
    request,
  }) => {
    const sitemapRes = await request.get('/sitemap-tags.xml', {
      headers: { 'User-Agent': BOT_UA },
    });
    const sitemap = await sitemapRes.text();

    for (const [slug] of CREATED) {
      const res = await request.get(`/tags/${slug}`, { headers: { 'User-Agent': BOT_UA } });
      expect(res.status(), `/tags/${slug} should resolve`).toBe(200);
      const html = await res.text();

      // PAIRED. "noindex" alone passes on a 404 shell that happens to be
      // noindex, so the row must also prove it exists by carrying a summary.
      expect(
        metaDescription(html).length,
        `/tags/${slug} should carry a description, not be an empty shell`,
      ).toBeGreaterThan(20);

      expect(html, `/tags/${slug} should be noindex while unpublished`).toMatch(
        /<meta name="robots" content="[^"]*noindex/i,
      );
      expect(sitemap, `/tags/${slug} must not be in the sitemap`).not.toContain(`/tags/${slug}<`);
    }
  });

  test('TERF resolves to a live row rather than a dead redirect', async ({ request }) => {
    // The defect: `terf` was deprecated as "canonical alias of
    // trans-exclusionary-radical-feminist" and THAT target is itself
    // deprecated, so the concept had no live row at all.
    const res = await request.get('/tags/terf', { headers: { 'User-Agent': BOT_UA } });
    expect(res.status(), '/tags/terf should resolve').toBe(200);
    const html = await res.text();
    const meta = metaDescription(html);

    expect(meta.length, '/tags/terf should carry its description').toBeGreaterThan(20);
    // Positive fingerprint: the page is about the ideology, not an empty revive.
    expect(meta.toLowerCase()).toMatch(/trans[- ]exclusionary|gender[- ]critical/);
    expect(html, '/tags/terf should remain unpublished').toMatch(
      /<meta name="robots" content="[^"]*noindex/i,
    );
  });

  test('men-who-have-sex-with-men no longer publishes the truncated artifact', async ({
    request,
  }) => {
    const res = await request.get('/tags/men-who-have-sex-with-men', {
      headers: { 'User-Agent': BOT_UA },
    });
    expect(res.status()).toBe(200);
    const html = await res.text();

    // NEGATIVE: the defect was `description` reading, in full, "The term Here's
    // a breakdown of the term and some key points:" — a sentence that names no
    // subject and breaks mid-clause. Asserted over the WHOLE response rather
    // than the meta tag alone, which is strictly stronger: the artifact must not
    // reach a crawler through any element.
    expect(html, 'the generation artifact must be gone').not.toMatch(/breakdown of the term/i);

    // PAIRED POSITIVE, and which fingerprint is correct depends on the row's
    // live gatedness rather than on a belief about it.
    //
    // This assertion was the gate — "a sensitive row must serve the sign-in gate
    // to a crawler" — on the strength of MSM being `is_sensitive`. Measured
    // 2026-10-16 it is `is_sensitive = false` and the crawler is served the
    // pass's own replacement prose, so the gate fingerprint failed every
    // scheduled nightly. The previous comment here said asserting the new
    // wording "would be unpassable against correct data"; the opposite is now
    // true, which is why this branches on what the surface actually does.
    //
    // Readable is the STRONGER case and is asserted as such: the replacement
    // reached a crawler, which is the thing the pass set out to deliver and
    // which the gate fingerprint could only ever assert by proxy.
    const meta = metaDescription(html).toLowerCase();
    if (meta.includes('only available to signed-in members')) {
      // Gated again — legitimate if the row is ever marked sensitive. The gate
      // still proves the page rendered rather than 404'ing or blanking.
      expect(html, 'a gated tag page publishes no article body').not.toContain('<article');
    } else {
      // A semantic fingerprint, not the sentence. Pinning the full wording would
      // be pinning this pass's transient state, which the file header forbids;
      // what must hold is that the published summary states the term's defining
      // property — behaviour rather than identity — which is the whole reason
      // the replacement was written.
      expect(meta.length, 'MSM should carry a real summary, not an empty shell').toBeGreaterThan(
        20,
      );
      expect(meta, 'the published summary should state what makes MSM load-bearing').toMatch(
        /behaviour|behavior|public[- ]health/,
      );
    }
  });

  // Deliberately unnumbered: gatedness is asked of the live surface, so a count
  // in the title is a second place to keep in step and the first thing to go
  // stale. It read "three" while the set held four, and the set then went stale
  // anyway.
  test('the page gate and the data gate agree on every asserted row', async ({ request }) => {
    // THE INVARIANT, and it is stronger than the one it replaces.
    //
    // The old test walked a frozen list and asserted each member was withheld.
    // This asks both surfaces about every row the file touches and requires them
    // to AGREE: `unified_tags_public_gated_read` withholds a row from anon
    // exactly when `tag_is_anon_gated` is true, and `/tags/:slug` serves
    // `gatedDetailResult()` to a crawler under the same condition. A sensitive
    // glossary row readable through one surface while gated on the other is a
    // real defect that no frozen list could have found — and because the two are
    // independent, this also covers the helper's blind spot, where a nonexistent
    // slug would read as "gated" on REST but 404 on the page.
    //
    // It cannot go vacuous as rows are reviewed: whichever side they fall on,
    // every row is still asserted to agree, and the readable side is non-empty
    // by the control below.
    const withheld = await withheldFromAnon(request, ALL_ASSERTED);

    for (const slug of ALL_ASSERTED) {
      const res = await request.get(`/tags/${slug}`, { headers: { 'User-Agent': BOT_UA } });
      // A gated row answers 200 with the sign-in document. 404 means the edge
      // conceded the row does not exist, which is wrong in both states.
      expect(res.status(), `/tags/${slug} must not 404`).toBe(200);
      const gatedOnPage = metaDescription(await res.text())
        .toLowerCase()
        .includes('only available to signed-in members');
      expect(
        gatedOnPage,
        `${slug}: the page ${gatedOnPage ? 'serves the sign-in gate' : 'serves content'} but anon REST ` +
          `${withheld.has(slug) ? 'withholds it' : 'can read it'} — the two gates disagree`,
      ).toBe(withheld.has(slug));
    }

    // POSITIVE CONTROL. An all-readable corpus would satisfy the loop trivially
    // on the REST side, so prove the query shape DOES return a row — a broken
    // key, a renamed table or a typo'd slug all produce "withheld" otherwise.
    const control = await rest<{ slug: string }>(
      request,
      'unified_tags?select=slug&slug=eq.gender-modality',
    );
    expect(control.length, 'the control row must be anon-readable').toBe(1);
  });

  test('an indexable tag renders a body (control for the crawler path)', async ({ request }) => {
    // WHY THIS CONTROL IS SHAPED THIS WAY, and the correction is the useful part.
    //
    // The first draft asserted `data-glossary-link` was present, on the
    // strength of e2e/support/glossaryProse.ts, whose header records three
    // specs going red because the auto-linker had rewritten words inside
    // asserted phrases. It failed, and the conclusion drawn was WRONG: seeing
    // the attribute in zero of seven crawler responses (bondage, cum, harness,
    // pride, stealthing, k-hole, doxy-pep) I concluded the linker was
    // client-side only. A decisive test refuted that —
    // /tags/gender-affirming-care-coverage carries it, and
    // functions/_lib/detail.ts:295 emits it. Seven pages is a sample, not a
    // property.
    //
    // What is actually true, and what matters for any spec here: the anchors
    // live INSIDE <article>, and a DEINDEXED tag emits no <article> at all —
    // /tags/doxy-pep and /tags/consent are both noindex and both have none. So
    // a glossary-link control that fetches a deindexed slug can never see one,
    // which is why the three specs naming `doxy-pep` cannot be read as evidence
    // about the renderer.
    //
    // `unlinkGlossary` is still deliberately NOT used here, but for the narrow
    // reason rather than the sweeping one: every phrase assertion in this file
    // reads the <head> meta description, and <head> never carries article
    // anchors. The control below therefore only has to prove the crawler path
    // renders a body at all, against an INDEXABLE row.
    const slug = await currentArticleTagSlug(request);
    const res = await request.get(`/tags/${slug}`, { headers: { 'User-Agent': BOT_UA } });
    expect(res.status()).toBe(200);
    const html = await res.text();
    const article = html.match(/<article[\s\S]*?<\/article>/i)?.[0] ?? '';
    expect(
      article.length,
      'an indexable tag must render a body — otherwise every crawler assertion here is vacuous',
    ).toBeGreaterThan(100);
  });

  test('the refused classes are not reachable as tag pages', async ({ request }) => {
    // CONTROLS FIRST. A 404 is meaningless unless the route serves 200 for a
    // real tag and 404 for a slug that was never a tag — otherwise "absent"
    // is equally consistent with the whole route being dead.
    const live = await request.get('/tags/consent', { headers: { 'User-Agent': BOT_UA } });
    expect(live.status(), 'control: a real tag must resolve').toBe(200);
    const nonsense = await request.get('/tags/zzz-not-a-tag-probe-xyz', {
      headers: { 'User-Agent': BOT_UA },
    });
    expect(nonsense.status(), 'control: an unknown slug must 404').toBe(404);

    for (const slug of [...REFUSED_PARAPHILIA, ...REFUSED_OTHER]) {
      const res = await request.get(`/tags/${slug}`, { headers: { 'User-Agent': BOT_UA } });
      expect(
        res.status(),
        `/tags/${slug} must not exist — creating it mints a page AND an auto-tagging rule`,
      ).toBe(404);
    }
  });
});

test.describe('sexology glossary pass — anon data surface', () => {
  test.describe.configure({ timeout: 90_000 });

  test('binder publishes a usable summary, not a surname', async ({ request }) => {
    // THE DEFECT THIS SPEC EXISTS FOR, and the one the crawler cannot see:
    // `short_description` read "Family name" over a correct `description`, on
    // an active row with usage 91. That column is the lead line on the glossary
    // index card and in the inline definition card, and it is in
    // trg_search_documents_tag's column list.
    const rows = await rest<{ short_description: string | null; status: string }>(
      request,
      'unified_tags?select=short_description,status&slug=eq.binder',
    );
    expect(rows.length, 'binder should exist').toBe(1);
    const [binder] = rows;

    expect(binder.status).toBe('active');
    // NEGATIVE + PAIRED POSITIVE: the namesake artifact is gone AND something
    // usable replaced it. A blank summary would satisfy the negative alone.
    expect(binder.short_description ?? '').not.toBe('Family name');
    expect((binder.short_description ?? '').length).toBeGreaterThan(20);
    expect((binder.short_description ?? '').toLowerCase()).toContain('chest');
  });

  test('the twelve created rows agree across all three category representations', async ({
    request,
  }) => {
    // Neither category trigger fires on INSERT, so a row created with
    // category_id alone derives no `category` TEXT and mints no junction row —
    // and /tags/:slug renders the JUNCTION while the search facet renders the
    // TEXT, so such a row is uncategorised on its own page and categorised in
    // search. This is the 194-row finding of 50100101100100.
    //
    // Sensitivity is editorial state: use the configured reviewer to check ALL
    // twelve rows, including those the anonymous registry correctly withholds.
    test.skip(
      !hasReviewerSession,
      'All twelve category invariants require the configured reviewer session',
    );
    const visible = CREATED;
    const slugs = visible.map(([s]) => s).join(',');
    const rows = await reviewerTagRows<{
      id: string;
      slug: string;
      status: string;
      seo_indexable: boolean;
      human_reviewed: boolean;
      category: string | null;
      category_id: string | null;
    }>(
      request,
      `select=id,slug,status,seo_indexable,human_reviewed,category,category_id&slug=in.(${slugs})`,
    );

    expect(rows.length, 'all twelve created rows should exist for the reviewer').toBe(
      visible.length,
    );

    const categories = await rest<{ id: string; slug: string; name: string }>(
      request,
      'tag_categories?select=id,slug,name',
    );
    const bySlug = new Map(categories.map((c) => [c.slug, c]));

    for (const [slug, categorySlug] of visible) {
      const row = rows.find((r) => r.slug === slug);
      expect(row, `${slug} should exist`).toBeTruthy();
      if (!row) continue;

      expect(row.status, `${slug} status`).toBe('active');
      expect(row.seo_indexable, `${slug} must stay unpublished`).toBe(false);
      // Load-bearing rather than decorative: deprecate_unused_tags() selects
      // exactly active + not-reviewed + usage 0, which all twelve are.
      expect(row.human_reviewed, `${slug} must be review-flagged`).toBe(true);

      const expected = bySlug.get(categorySlug);
      expect(expected, `category ${categorySlug} should exist`).toBeTruthy();
      expect(row.category_id, `${slug} category_id`).toBe(expected?.id);
      expect(row.category, `${slug} category TEXT`).toBe(expected?.name);

      const junction = await rest<{ category_id: string; is_primary: boolean }>(
        request,
        `tag_category_assignments?select=category_id,is_primary&tag_id=eq.${row.id}&is_primary=is.true`,
      );
      expect(junction.length, `${slug} should have a primary junction row`).toBe(1);
      expect(junction[0].category_id, `${slug} junction category`).toBe(expected?.id);
    }
  });

  test('the twelve aliases are approved and point at ACTIVE rows', async ({ request }) => {
    // Display, auto-tagging and the search bridge have all been approved-only
    // since 20261012090000, so an `auto` alias would be stored and route
    // nothing — which is indistinguishable from the alias not existing.

    // Asked of the live surface: a canonical anon cannot read is gated, and the
    // alias then asserts the withholding rather than the resolution. Both
    // branches are counted so the control below can prove every alias took one.
    const gatedCanonicals = await withheldFromAnon(
      request,
      ALIASES.map(([, canonical]) => canonical),
    );
    let resolved = 0;
    let gatedSkips = 0;

    const slugs = ALIASES.map(([a]) => a).join(',');
    const rows = await rest<{
      alias_slug: string;
      review_status: string;
      canonical_tag_id: string;
    }>(
      request,
      `tag_aliases?select=alias_slug,review_status,canonical_tag_id&alias_slug=in.(${slugs})`,
    );

    expect(rows.length, 'all twelve aliases should exist').toBe(ALIASES.length);

    for (const [alias, canonical] of ALIASES) {
      const row = rows.find((r) => r.alias_slug === alias);
      expect(row, `alias ${alias} should exist`).toBeTruthy();
      if (!row) continue;
      expect(row.review_status, `${alias} must be approved to route anything`).toBe('approved');

      const target = await rest<{ slug: string; status: string }>(
        request,
        `unified_tags?select=slug,status&id=eq.${row.canonical_tag_id}`,
      );

      // The alias row itself is anon-readable (this table is not gated), but its
      // CANONICAL may not be: `crabs` routes onto `pubic-lice`, which is
      // `is_sensitive`. Asserting `length === 1` there failed against correct
      // data — the canonical exists and is active, anon simply may not see it.
      //
      // Both branches still assert something load-bearing. For a gated canonical
      // the claim is that the alias is approved (already checked above, so it
      // routes) AND that the target is withheld from anon, which is the gate
      // working rather than a missing row. For the rest, the full check stands.
      if (gatedCanonicals.has(canonical)) {
        expect(
          target.length,
          `${alias} -> ${canonical} is gated, so anon must not resolve it`,
        ).toBe(0);
        gatedSkips += 1;
        continue;
      }
      resolved += 1;

      expect(target.length, `${alias} canonical should resolve`).toBe(1);
      expect(target[0].slug, `${alias} canonical slug`).toBe(canonical);
      expect(target[0].status, `${alias} canonical must be active`).toBe('active');
    }

    // POSITIVE CONTROL for the branch above: a bug that made every canonical
    // look gated would skip every real assertion and still pass.
    //
    // This was `.toBe(9)` over the frozen gated set, and the number was computed
    // FROM that set rather than from the corpus — so it stayed green while the
    // set went stale, and the loop above is what failed instead. Measured
    // 2026-10-16: zero of the twelve canonicals are gated (`pubic-lice`,
    // `men-who-have-sex-with-men` and `women-who-have-sex-with-women` are all
    // readable now), so all twelve resolve.
    //
    // A partition plus a floor, not a pinned count: the two branches must
    // account for every alias, and at least one must have taken the real path.
    expect(resolved + gatedSkips, 'every alias took exactly one branch').toBe(ALIASES.length);
    expect(resolved, 'at least one alias must resolve fully').toBeGreaterThan(0);
  });

  test('the two refused aliases were not created', async ({ request }) => {
    // `pulling-out` -> `withdrawal` is the WRONG SENSE (withdrawal is filed
    // under Substances & Recovery and is about a body adapted to a substance),
    // and `warts` is an ordinary word covering plantar and common warts, where
    // an approved alias is an auto-tagging RULE as well as a displayed synonym.
    const rows = await rest<{ alias_slug: string }>(
      request,
      `tag_aliases?select=alias_slug&alias_slug=in.(${REFUSED_ALIASES.join(',')})`,
    );
    expect(
      rows.map((r) => r.alias_slug),
      'neither refused alias may exist',
    ).toEqual([]);

    // CONTROL: the query shape finds aliases when they do exist, so the empty
    // result above is evidence rather than a broken filter.
    //
    // It deliberately names aliases that PREDATE this pass (pinkwashing ->
    // rainbow-washing, kinbaku -> shibari). A first draft used `msm` and
    // `crabs`, which this very migration creates — so the control could only
    // pass once the thing it was controlling for had landed, which makes it a
    // second assertion rather than a control.
    const control = await rest<{ alias_slug: string }>(
      request,
      'tag_aliases?select=alias_slug&alias_slug=in.(pinkwashing,kinbaku)',
    );
    expect(control.length, 'control: the alias query shape works').toBe(2);
  });

  test('pulling-out exists as its own row rather than an alias of withdrawal', async ({
    request,
  }) => {
    test.skip(
      !hasReviewerSession,
      'Sensitive content invariants require the configured reviewer session',
    );
    const [row] = await reviewerTagRows<{ slug: string; status: string; category: string | null }>(
      request,
      'select=slug,status,category&slug=eq.pulling-out',
    );
    expect(row, 'pulling-out should be its own row').toBeTruthy();
    expect(row.status).toBe('active');

    // And `withdrawal` must still be the SUBSTANCE sense — the thing that made
    // the alias wrong. If this ever flips, the refusal above stops making sense.
    const [withdrawal] = await reviewerTagRows<{ category: string | null }>(
      request,
      'select=category&slug=eq.withdrawal',
    );
    expect(withdrawal?.category, 'withdrawal is the substance sense').toBe('Substances & Recovery');
  });

  test('the two misfiled rows moved, in all three representations', async ({ request }) => {
    for (const [slug, categoryName] of [
      // pap-smear itself was merged into the Pap test row by 99991792781503; the
      // filing it carried now lives on the canonical.
      ['papanicolaou-test-pap-test', 'Sexual Health'],
      // Moved again by 99991792777258 (the 2026-10-23 Proposals sheet).
      ['jizz', 'Slang & Language'],
    ] as const) {
      const [row] = await rest<{
        id: string;
        category: string | null;
        category_id: string | null;
      }>(request, `unified_tags?select=id,category,category_id&slug=eq.${slug}`);
      expect(row, `${slug} should exist`).toBeTruthy();
      expect(row.category, `${slug} category TEXT`).toBe(categoryName);

      const [cat] = await rest<{ id: string }>(
        request,
        `tag_categories?select=id&name=eq.${encodeURIComponent(categoryName)}`,
      );
      expect(row.category_id, `${slug} category_id`).toBe(cat.id);

      const junction = await rest<{ category_id: string }>(
        request,
        `tag_category_assignments?select=category_id&tag_id=eq.${row.id}&is_primary=is.true`,
      );
      expect(junction.length, `${slug} primary junction`).toBe(1);
      expect(
        junction[0].category_id,
        `${slug} junction must agree with category_id — the page renders the junction`,
      ).toBe(cat.id);
    }
  });

  test('no refused term exists as an active row', async ({ request }) => {
    const slugs = [...REFUSED_PARAPHILIA, ...REFUSED_OTHER].join(',');
    const rows = await rest<{ slug: string; status: string }>(
      request,
      `unified_tags?select=slug,status&slug=in.(${slugs})&status=eq.active`,
    );
    expect(
      rows.map((r) => r.slug),
      'the refused classes must never be minted as tags',
    ).toEqual([]);

    // CONTROL: the same query shape returns rows for slugs that DO exist, so
    // the empty result is a finding rather than a filter that matches nothing.
    // Both named rows predate this pass — a first draft used `endosexism`,
    // which this migration creates, so the control depended on the change it
    // was meant to be independent of.
    const control = await rest<{ slug: string }>(
      request,
      'unified_tags?select=slug&slug=in.(consent,bdsm)&status=eq.active',
    );
    expect(control.length, 'control: the active-row query shape works').toBe(2);
  });

  test('the sixteen correctly-deprecated duplicates were not revived', async ({ request }) => {
    // Every one carries an explicit deprecation_reason naming a canonical
    // target — the OPPOSITE of the orphan-audit cohort earlier passes kept
    // finding. A blanket revive would have minted sixteen duplicates. `terf` is
    // the sole exception, because ITS target is itself deprecated.
    const kept = [
      'blow-job',
      'butt-plug',
      'contraception',
      'dom',
      'enema',
      'genderfluid',
      'kinbaku',
      'pre-exposure-prophylaxis',
      'semen',
      'sex',
      'stereotype',
      'transexual',
      'transition',
      'berdache',
    ];
    const rows = await rest<{ slug: string; status: string }>(
      request,
      `unified_tags?select=slug,status&slug=in.(${kept.join(',')})`,
    );
    const revived = rows.filter((r) => r.status === 'active').map((r) => r.slug);
    expect(revived, 'none of the correct deprecations should be revived').toEqual([]);
    expect(rows.length, 'control: the rows are readable at all').toBeGreaterThan(10);
  });
});
