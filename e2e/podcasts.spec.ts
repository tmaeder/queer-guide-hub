import { test, expect } from '@playwright/test';

// The podcast surface: /podcasts, /podcasts/:slug, and what a crawler is told
// about an episode.
//
// WHY THIS EXISTS. Podcasts had ZERO test coverage of any kind — no unit test,
// no e2e — while two faults quietly destroyed episodes for months:
//
//  * 5,729 episodes committed as plain ARTICLES with the audio discarded,
//    because a redefinition of news_commit_staging_batch dropped three columns
//    for three weeks in 2026-06. The RPC was fixed; the rows were not.
//  * The RSS parser wrote a bare <guid> into news_articles.url, so
//    pipeline-validate rejected the episode E_INVALID_URL — 323 of 680 podcast
//    rejections in 30 days, every episode of several ACTIVE shows.
//
// THESE RUN AGAINST PRODUCTION (playwright.config.ts defaults baseURL to
// https://queer.guide).
//
// EVERY EXPECTATION IS DERIVED FROM THE PAGE'S OWN DATA, never hardcoded. A
// spec that pins a specific episode slug or a specific show name goes red the
// week that show stops publishing, and a spec that pins a count goes red on
// ordinary growth. The floors below are collapse detectors: they are far under
// the measured values and only fire if something DELETES.

const RENDER = { timeout: 20_000 };
const BOT = {
  'user-agent':
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
};

test.describe('@smoke podcasts', () => {
  test('the hub lists shows and links each one to its own page', async ({ page }) => {
    await page.goto('/podcasts');

    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      /podcast/i,
      RENDER,
    );

    const showLinks = page.locator('a[href*="/podcasts/"]');
    await expect(showLinks.first()).toBeVisible(RENDER);
    // ~255 shows carry at least one episode. 20 is a collapse floor: the hub
    // rendering a handful of cards would mean the episode_count gate, the
    // column grant or the query broke.
    expect(await showLinks.count(), 'show cards on the hub').toBeGreaterThanOrEqual(20);
  });

  test('a show page lists episodes, and every episode links to its /news/ page', async ({
    page,
  }) => {
    await page.goto('/podcasts');
    const firstShow = page.locator('a[href*="/podcasts/"]').first();
    await expect(firstShow).toBeVisible(RENDER);
    const href = await firstShow.getAttribute('href');
    expect(href, 'the hub produced a show URL').toBeTruthy();

    await page.goto(href!);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible(RENDER);

    // Episodes keep their existing /news/:slug URLs. There is deliberately no
    // /podcasts/:show/:episode space — 8,000+ episode URLs are already indexed
    // under /news and a second one would fight them for the canonical.
    const episodeLinks = page.locator('a[href*="/news/"]');
    await expect(episodeLinks.first()).toBeVisible(RENDER);
    expect(await episodeLinks.count(), 'episodes listed').toBeGreaterThanOrEqual(1);

    // At least one episode is playable. This is the assertion that would have
    // caught the 5,729 stranded rows: they had media_type='article' and no
    // audio_url, so no play control was ever rendered for them.
    const playButtons = page.getByRole('button', { name: /^play /i });
    expect(await playButtons.count(), 'playable episodes').toBeGreaterThanOrEqual(1);
  });

  test('an episode is described to crawlers as a PodcastEpisode carrying its audio', async ({
    page,
    request,
  }) => {
    // Find a real episode through the site rather than naming one: the specific
    // episode that is newest changes every day.
    await page.goto('/podcasts');
    const showHref = await page.locator('a[href*="/podcasts/"]').first().getAttribute('href');
    await page.goto(showHref!);
    // Walk a few episodes to find one the middleware PRERENDERS.
    //
    // The bot body is injected only when the route is indexable
    // (functions/_middleware.ts: `isBot = indexable && isBotUserAgent(...)`),
    // and news_articles.seo_indexable is false on a large share of the corpus.
    // Taking the first episode blindly is a coin flip: measured on prod, the
    // newest episode of the newest show had seo_indexable=false, so the body
    // was absent and the JSON-LD was still correct — which is exactly the
    // shape that makes this look like a regression when it is not.
    const hrefs = (await page.locator('a[href*="/news/"]').evaluateAll((els) =>
      els.map((e) => (e as HTMLAnchorElement).getAttribute('href')),
    )).filter((h): h is string => Boolean(h));
    expect(hrefs.length, 'a show page produced episode URLs').toBeGreaterThan(0);

    let html = '';
    let episodeHref = '';
    for (const href of hrefs.slice(0, 12)) {
      const r = await request.get(href, { headers: BOT });
      if (r.status() !== 200) continue;
      const body = await r.text();
      if (body.includes('data-prerendered="bot-ua"')) {
        html = body;
        episodeHref = href;
        break;
      }
    }
    // Not a silent skip: if no episode on this show is indexable the assertion
    // below would pass against an empty string, which is the vacuous-pass
    // shape this whole file is written to avoid.
    expect(episodeHref, 'no prerendered episode found among the first 12').toBeTruthy();
    const res = await request.get(episodeHref, { headers: BOT });
    expect(res.status()).toBe(200);

    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      .map((m) => {
        try {
          return JSON.parse(m[1]);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .flatMap((b) => (Array.isArray(b) ? b : [b]));

    const episodeLd = blocks.find((b) => b?.['@type'] === 'PodcastEpisode');
    expect(episodeLd, 'the crawler HTML carries PodcastEpisode JSON-LD').toBeTruthy();

    // The property that makes the page findable as audio at all. Before this,
    // every episode was published as a NewsArticle with no audio anywhere in
    // the document.
    const media = episodeLd.associatedMedia;
    expect(media?.['@type']).toBe('AudioObject');
    expect(media?.contentUrl, 'the audio URL is in the document').toMatch(/^https?:\/\//);

    // PAIRED NEGATIVE. Asserting only the presence of PodcastEpisode would
    // still pass if the NewsArticle block were emitted alongside it, which is
    // two contradictory claims about one page.
    expect(
      blocks.some((b) => b?.['@type'] === 'NewsArticle'),
      'an episode must not ALSO be published as a NewsArticle',
    ).toBe(false);

    // The crawler body must offer the audio and the show, not "read the full
    // article at <publisher>".
    expect(html).toMatch(/Listen to this episode/i);
  });

  test('a show page is described to crawlers as a PodcastSeries', async ({ page, request }) => {
    await page.goto('/podcasts');
    const showHref = await page.locator('a[href*="/podcasts/"]').first().getAttribute('href');

    const res = await request.get(showHref!, { headers: BOT });
    expect(res.status()).toBe(200);
    const html = await res.text();

    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      .map((m) => {
        try {
          return JSON.parse(m[1]);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .flatMap((b) => (Array.isArray(b) ? b : [b]));

    expect(
      blocks.some((b) => b?.['@type'] === 'PodcastSeries'),
      'the show page carries PodcastSeries JSON-LD',
    ).toBe(true);

    // The hub → detail → episode crawl path. Without these links a
    // JavaScript-free crawler cannot reach a single episode from the hub.
    expect(html).toMatch(/href="\/news\//);
  });

  test('the sitemap advertises the shows', async ({ request }) => {
    const res = await request.get('/sitemap-podcasts.xml');
    expect(res.status()).toBe(200);
    const xml = await res.text();
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    // hubLinks caps at 80 links, so without this sitemap a quarter of the shows
    // would have no crawl path at all.
    //
    // This floor is also the only thing that catches a missing column GRANT:
    // fetchRows falls back to the anon key, a denied column returns 42501, and
    // the generator then emits a well-formed urlset with nothing in it. Status
    // and content-type both look perfect.
    expect(locs.length, 'show URLs in the sitemap').toBeGreaterThanOrEqual(100);
    expect(locs.every((l) => l.includes('/podcasts/'))).toBe(true);

    // The sitemap index must know about it, or nothing fetches it.
    const index = await (await request.get('/sitemap.xml')).text();
    expect(index).toContain('sitemap-podcasts.xml');
  });

  test('news_sources no longer leaks its operational columns to anonymous readers', async ({
    request,
  }) => {
    // RLS on news_sources filters ROWS (is_active = true), not COLUMNS, and
    // anon held a table-wide SELECT grant — so `select=*` returned last_error,
    // reliability_score, auto_paused_reason and consecutive_failures to every
    // logged-out visitor. Asserted through the ANON role, which is what a user
    // is actually served.
    const base = process.env.VITE_SUPABASE_URL;
    const key = process.env.VITE_SUPABASE_ANON_KEY;
    test.skip(!base || !key, 'needs VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY');

    const res = await request.get(
      `${base}/rest/v1/news_sources?select=last_error&limit=1`,
      { headers: { apikey: key!, Authorization: `Bearer ${key}` } },
    );
    // POSITIVE CONTROL: an allowed column must still work, or this test would
    // pass just as well against a table that is entirely unreachable.
    const ok = await request.get(`${base}/rest/v1/news_sources?select=name&limit=1`, {
      headers: { apikey: key!, Authorization: `Bearer ${key}` },
    });
    expect(ok.status(), 'anon can still read the public columns').toBe(200);
    // Measured on prod: PostgREST answers a missing COLUMN privilege with 401
    // here, not the 403 the profiles allowlist produces. Accept either — the
    // assertion is "denied", and pinning the exact code makes this spec a
    // guard against PostgREST's error mapping rather than against the grant.
    expect([401, 403], 'anon cannot read last_error').toContain(res.status());
  });

  test('every column the public surfaces select is actually granted to anon', async ({
    request,
  }) => {
    // THE FAILURE THIS EXISTS FOR. Narrowing the grant broke
    // sitemap-podcasts.xml, which selects `slug,updated_at`:
    // functions/_lib/sitemap.ts prefers the service-role key and FALLS BACK to
    // anon, so in production it drew `42501 permission denied for table
    // news_sources` and emitted a well-formed, completely empty urlset. HTTP
    // 200, valid XML, zero <loc> — nothing about the symptom points at a grant.
    //
    // Asserting the SELECTS rather than the grant list is what makes this
    // survive: a future column added to any of these queries fails here.
    const base = process.env.VITE_SUPABASE_URL;
    const key = process.env.VITE_SUPABASE_ANON_KEY;
    test.skip(!base || !key, 'needs VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY');

    const selects = [
      // functions/sitemap-podcasts.xml.ts
      'slug,updated_at',
      // functions/_lib/detail.ts — podcastShowDetail
      'id,name,slug,description,url,website_url,artwork_url,episode_count',
      // src/hooks/usePodcasts.ts
      'id,name,slug,description,website_url,url,artwork_url,episode_count',
      // src/hooks/useNews.tsx — fetchSources
      'id,name,slug,description,url,website_url,category,feed_type,artwork_url,is_active,is_aggregator,organization_id,episode_count',
      // src/hooks/usePageFetchers.ts — fetchNewsSourceById
      'name,url',
    ];
    for (const sel of selects) {
      const r = await request.get(
        `${base}/rest/v1/news_sources?select=${encodeURIComponent(sel)}&limit=1`,
        { headers: { apikey: key!, Authorization: `Bearer ${key}` } },
      );
      expect(r.status(), `anon cannot read: ${sel}`).toBe(200);
    }
  });
});
