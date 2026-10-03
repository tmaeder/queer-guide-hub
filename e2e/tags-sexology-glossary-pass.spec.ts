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
  ['grey-asexual', 'greysexual'],
  ['endosex', 'dyadic'],
  ['chest-surgery', 'top-surgery'],
  ['bilateral-mastectomy', 'top-surgery'],
  ['forced-feminization', 'feminization'],
  ['smear-test', 'pap-smear'],
  ['cervical-screening-tests', 'pap-smear'],
  ['crabs', 'pubic-lice'],
  ['hepatitis-b-virus', 'hepatitis-b'],
  ['msm', 'men-who-have-sex-with-men'],
  ['wlw', 'women-who-have-sex-with-women'],
  ['erotic-sexual-denial', 'orgasm-control'],
];

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
    expect(
      (sitemap.match(/<loc>/g) ?? []).length,
      'a near-empty tag sitemap would make the noindex assertions vacuous',
    ).toBeGreaterThan(500);
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
      expect(sitemap, `/tags/${slug} must not be in the sitemap`).not.toContain(
        `/tags/${slug}<`,
      );
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
    const meta = metaDescription(html);

    // NEGATIVE: the defect was `description` reading, in full, "The term Here's
    // a breakdown of the term and some key points:" — a sentence that names no
    // subject and breaks mid-clause.
    expect(meta, 'the generation artifact must be gone').not.toMatch(
      /breakdown of the term/i,
    );
    // PAIRED POSITIVE: and the replacement must be there. Without this, the
    // negative passes on a blanked column, which is a worse outcome.
    expect(meta.toLowerCase()).toContain('behaviour rather than identity');
  });

  test('an indexable tag renders a body (control for the crawler path)', async ({
    request,
  }) => {
    // WHY THIS CONTROL IS SHAPED THIS WAY, measured on prod rather than assumed.
    //
    // The first draft of this test asserted `data-glossary-link` was present,
    // on the strength of e2e/support/glossaryProse.ts — whose own header
    // records three specs going red because the glossary auto-linker had
    // rewritten words inside asserted phrases. That control FAILED on correct
    // code: the attribute appears in ZERO crawler responses today (checked
    // across bondage, cum, harness, pride, and the three slugs that helper
    // names — stealthing, k-hole, doxy-pep). The auto-linker is client-side
    // only, so it cannot touch anything this file asserts, because every
    // phrase assertion here reads the <head> meta description rather than
    // article prose. `unlinkGlossary` is therefore deliberately NOT used.
    //
    // The second thing that measurement settled: a DEINDEXED tag emits no
    // <article> at all (/tags/consent is noindex and has none), so an
    // article-based control has to run against an INDEXABLE row.
    const res = await request.get('/tags/bondage', { headers: { 'User-Agent': BOT_UA } });
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
    const slugs = CREATED.map(([s]) => s).join(',');
    const rows = await rest<{
      slug: string;
      status: string;
      seo_indexable: boolean;
      human_reviewed: boolean;
      category: string | null;
      category_id: string | null;
    }>(
      request,
      `unified_tags?select=slug,status,seo_indexable,human_reviewed,category,category_id&slug=in.(${slugs})`,
    );

    expect(rows.length, 'all twelve created rows should exist').toBe(CREATED.length);

    const categories = await rest<{ id: string; slug: string; name: string }>(
      request,
      'tag_categories?select=id,slug,name',
    );
    const bySlug = new Map(categories.map((c) => [c.slug, c]));

    for (const [slug, categorySlug] of CREATED) {
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
        `tag_category_assignments?select=category_id,is_primary&tag_id=eq.${
          // resolve the id through the same anon read rather than trusting a literal
          (
            await rest<{ id: string }>(request, `unified_tags?select=id&slug=eq.${slug}`)
          )[0].id
        }&is_primary=is.true`,
      );
      expect(junction.length, `${slug} should have a primary junction row`).toBe(1);
      expect(junction[0].category_id, `${slug} junction category`).toBe(expected?.id);
    }
  });

  test('the twelve aliases are approved and point at ACTIVE rows', async ({ request }) => {
    // Display, auto-tagging and the search bridge have all been approved-only
    // since 20261012090000, so an `auto` alias would be stored and route
    // nothing — which is indistinguishable from the alias not existing.
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
      expect(row.review_status, `${alias} must be approved to route anything`).toBe(
        'approved',
      );

      const target = await rest<{ slug: string; status: string }>(
        request,
        `unified_tags?select=slug,status&id=eq.${row.canonical_tag_id}`,
      );
      expect(target.length, `${alias} canonical should resolve`).toBe(1);
      expect(target[0].slug, `${alias} canonical slug`).toBe(canonical);
      expect(target[0].status, `${alias} canonical must be active`).toBe('active');
    }
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
    const control = await rest<{ alias_slug: string }>(
      request,
      'tag_aliases?select=alias_slug&alias_slug=in.(msm,crabs)',
    );
    expect(control.length, 'control: the alias query shape works').toBe(2);
  });

  test('pulling-out exists as its own row rather than an alias of withdrawal', async ({
    request,
  }) => {
    const [row] = await rest<{ slug: string; status: string; category: string | null }>(
      request,
      'unified_tags?select=slug,status,category&slug=eq.pulling-out',
    );
    expect(row, 'pulling-out should be its own row').toBeTruthy();
    expect(row.status).toBe('active');

    // And `withdrawal` must still be the SUBSTANCE sense — the thing that made
    // the alias wrong. If this ever flips, the refusal above stops making sense.
    const [withdrawal] = await rest<{ category: string | null }>(
      request,
      'unified_tags?select=category&slug=eq.withdrawal',
    );
    expect(withdrawal?.category, 'withdrawal is the substance sense').toBe(
      'Substances & Recovery',
    );
  });

  test('the two misfiled rows moved, in all three representations', async ({ request }) => {
    for (const [slug, categoryName] of [
      ['pap-smear', 'Sexual Health'],
      ['jizz', 'Body & Reproductive Health'],
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
    const control = await rest<{ slug: string }>(
      request,
      'unified_tags?select=slug&slug=in.(consent,endosexism)&status=eq.active',
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
