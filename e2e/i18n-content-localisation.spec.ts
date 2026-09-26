import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

// Translated content must be REACHABLE and must RENDER.
//
// Two defects, measured on prod 2026-09-19, that every existing check passed
// straight through:
//
// 1. `translate-i18n-batch` carried the pipeline's FIRST locale allowlist
//    (de fr es it pt nl pl ru tr uk sv) while `run_i18n_translation_dispatch`
//    seeded the frontend's (de fr es it pt ru zh ja ko ar). zh/ja/ko/ar were
//    rejected with 400 on EVERY fire — 60 of 150 targets. Proven live before
//    the fix: `de` returned 200 `success:true`, and `ja` returned
//    `400 {"error":"locale must be one of: de, fr, es, it, pt, nl, pl, ru, tr,
//    uk, sv"}`. Nothing saw it, because the dispatcher fires net.http_post and
//    discarded the request id, so pg_cron recorded `succeeded` 5,562/5,562.
//
// 2. Nothing RENDERED a `*_i18n` column except news titles and the kink
//    taxonomy. `src/lib/localizeContent.ts` had been deleted and the eight
//    `*_localized_*` RPCs are called from nowhere, so ~35k translated rows
//    were dead data.
//
// Read through the ANON PostgREST role — the same role the browser uses — so
// this asserts what a reader is actually served.

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? 'https://xqeacpakadqfxjxjcewc.supabase.co';
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

/** Every locale the pipeline must accept. Mirrors SUPPORTED_LOCALES minus en. */
const TRANSLATION_LOCALES = ['es', 'fr', 'de', 'pt', 'it', 'ru', 'zh', 'ja', 'ko', 'ar'] as const;

test.skip(!ANON_KEY, 'VITE_SUPABASE_ANON_KEY not set');

async function rest<T>(request: APIRequestContext, path: string): Promise<T[]> {
  const res = await request.get(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: ANON_KEY!, Authorization: `Bearer ${ANON_KEY!}` },
  });
  expect(res.ok(), `${path} -> HTTP ${res.status()}`).toBeTruthy();
  return res.json();
}

test.describe('i18n content pipeline', () => {
  test('no supported locale is fully dead in the corpus', async ({ request }) => {
    // This asserts NON-ZERO per locale, not a coverage target, and the
    // distinction is deliberate. Coverage is a THROUGHPUT property — it climbs
    // for days after the allowlist fix and would ship this spec red in the
    // meantime. What is invariant is that no locale is entirely absent.
    //
    // Measured through anon on 2026-09-20, before the fix deployed:
    //   de 18,074 · ja 288 · zh 279 · ko 309 · ar 265
    // The four small ones are residue from before the allowlist drifted, which
    // is exactly why "some rows exist" is a weak signal on its own — it would
    // have passed throughout the outage. The ENGINE is gated properly in
    // check-pipeline-health.mjs §19, which hard-fails on a 4xx with no
    // threshold; this spec guards the reader, not the writer.
    // EXISTENCE, not a count. `Prefer: count=exact` over 62k rows with a jsonb
    // extraction filter exceeds the 8s statement timeout and returns HTTP 500
    // — measured, `pt` failed that way. Existence is the whole assertion and
    // costs one indexed row.
    const present: Record<string, boolean> = {};
    for (const locale of TRANSLATION_LOCALES) {
      const rows = await rest<{ id: string }>(
        request,
        `marketplace_listings?select=id&title_i18n->>${locale}=not.is.null&limit=1`,
      );
      present[locale] = rows.length > 0;
    }
    const dead = Object.entries(present)
      .filter(([, ok]) => !ok)
      .map(([l]) => l);
    expect(dead, `locales with zero translated listings (present: ${JSON.stringify(present)})`)
      .toHaveLength(0);
  });

  test('a translated venue description renders in its locale and falls back otherwise', async ({
    request,
    page,
  }) => {
    // Pick a real row rather than hardcoding a slug: the corpus moves, and a
    // spec pinned to one venue goes green the day that venue is merged away.
    const [venue] = await rest<{
      slug: string;
      description: string;
      description_i18n: Record<string, string> | null;
    }>(
      request,
      'venues?select=slug,description,description_i18n&description_i18n->>de=not.is.null' +
        '&description=not.is.null&safety_gated=is.false&duplicate_of_id=is.null&limit=1',
    );

    test.skip(!venue, 'no venue carries a translated description yet');

    // Intersect with the SERVED locale set. The corpus still holds 2,916
    // translations in nl/pl/tr/uk/sv — written while the edge function's
    // allowlist was the pipeline's first one, and unreachable ever since
    // because none of those has a UI route. A first draft of this spec picked
    // whichever key the row happened to carry, got `uk`, and navigated to
    // /uk/venues/... which is not a route at all.
    const locale = (TRANSLATION_LOCALES as readonly string[]).find(
      (k) => (venue.description_i18n?.[k] ?? '').trim().length > 20,
    );
    test.skip(!locale, 'the sampled venue has no substantial translation in a served locale');

    const translated = venue.description_i18n![locale!];

    await page.goto(`/${locale}/venues/${venue.slug}`, { waitUntil: 'domcontentloaded' });
    // The venue row is fetched AFTER mount, so `domcontentloaded` lands on the
    // shell. Wait for the heading the page renders from that row rather than a
    // fixed timeout — a sleep here makes the spec flaky on a slow CI runner and
    // passes vacuously on a fast one.
    await expect(page.locator('h1')).not.toBeEmpty({ timeout: 20_000 });
    const body = await page.locator('body').innerText();

    // The translated text must be present. Compare on a distinctive slice
    // rather than the whole string — the page wraps, truncates and
    // glossary-links prose, so a full-string match would be brittle for
    // reasons that have nothing to do with localization.
    const probe = translated.slice(0, 40).trim();
    expect(body, `expected the ${locale} description on /${locale}/venues/${venue.slug}`).toContain(
      probe,
    );
  });

  test('an untranslated locale falls back to English rather than rendering blank', async ({
    request,
    page,
  }) => {
    // The failure this guards is not "no translation" — it is a blank field.
    // `localizedField` treats a whitespace-only translation as absence, and a
    // regression there would empty the description instead of falling back.
    const [venue] = await rest<{ slug: string; description: string }>(
      request,
      'venues?select=slug,description&description_i18n=eq.{}&description=not.is.null' +
        '&safety_gated=is.false&duplicate_of_id=is.null&limit=1',
    );
    test.skip(!venue || !venue.description, 'no untranslated venue with a description');

    await page.goto(`/ko/venues/${venue.slug}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1')).not.toBeEmpty({ timeout: 20_000 });
    const body = await page.locator('body').innerText();
    expect(body, 'an untranslated row must still show its English description').toContain(
      venue.description.slice(0, 40).trim(),
    );
  });
});

test.describe('UI strings', () => {
  test('no locale ships a [XX] placeholder to a reader', async ({ page }: { page: Page }) => {
    // `sync-translations.ts --fill` writes untranslated keys as "[ES] Retry".
    // 9,699 of them exist, so this does NOT assert zero corpus-wide — it
    // asserts that none reaches a rendered page on the routes people land on.
    // A ratchet on the corpus count lives in check-i18n-placeholders.mjs.
    for (const locale of ['de', 'ja', 'ar']) {
      await page.goto(`/${locale}`, { waitUntil: 'domcontentloaded' });
      const body = await page.locator('body').innerText();
      const hits = body.match(/\[[A-Z]{2}\]\s\S/g) ?? [];
      expect(hits, `/${locale} renders placeholder strings: ${hits.slice(0, 5).join(' | ')}`)
        .toHaveLength(0);
    }
  });
});
