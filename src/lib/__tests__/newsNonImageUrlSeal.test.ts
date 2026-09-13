import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * news_articles.image_url held podcast AUDIO on 5,607 prod rows, because
 * `extractMediaUrl` in source-rss-news took the first `<enclosure url="...">`
 * with no type check — and on a podcast item the enclosure IS the audio.
 *
 * The parser fix is unit-tested next to the parser. What this file pins is the
 * DB half, which has no other guard:
 *
 *   1. `is_non_image_url` tests the URL PATH, not the whole URL. Matching the
 *      whole string false-positives on `…/photo.jpg?meta=x.json`, where the
 *      banned extension sits in the query string.
 *   2. It is a DENYLIST. Prod carries 92 `.svg`, 83 `.avif`, plus `.aspx`/
 *      `.axd`/`.php`/`.cms` dynamic image endpoints — an image-extension
 *      ALLOWLIST would have destroyed 34 working images.
 *   3. The trigger is BEFORE and `zz_`-prefixed. BEFORE triggers fire in NAME
 *      order and `news_articles_decode_entities` rewrites image_url, so a name
 *      sorting before it would test a value that is about to change.
 *   4. Cohort A is RECOVERED, not cleared. 2,865 rows predate podcast support
 *      and hold the episode's only surviving audio URL in image_url; a blanket
 *      NULL would have destroyed it. The recovery must run BEFORE the blanket
 *      clear, or the clear consumes those rows first and the audio is gone.
 *
 * Text checks against the repo, not the database, so this runs in CI without
 * credentials — same pattern as `citySafetyBackfill.test.ts`.
 */

const ROOT = process.cwd();
const SEAL = join(ROOT, 'supabase', 'migrations', '20361118143700_news_non_image_url_seal.sql');
const ARTWORK = join(
  ROOT,
  'supabase',
  'migrations',
  '20361118143800_news_podcast_channel_artwork.sql',
);

/**
 * These migrations carry long explanatory headers that repeat the very phrases
 * the assertions look for, so a guard could be deleted from the SQL and still
 * be "found" in prose. Every assertion below runs against comment-stripped
 * text. (Mutation testing caught exactly this on the Wikipedia-society pass.)
 */
function stripComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n');
}

const seal = stripComments(readFileSync(SEAL, 'utf8'));
const artwork = stripComments(readFileSync(ARTWORK, 'utf8'));

describe('is_non_image_url', () => {
  it('tests the URL path, not the whole URL', () => {
    // split_part twice: strip the fragment, then the query string.
    expect(seal).toMatch(
      /split_part\(\s*split_part\(\s*p_url\s*,\s*'#'\s*,\s*1\s*\)\s*,\s*'\?'\s*,\s*1\s*\)/,
    );
    // Anchored at end-of-path. Without the $ the query string is back in scope.
    expect(seal).toMatch(/\|docx\)\$'/);
  });

  it('bans audio, video and documents', () => {
    for (const ext of ['mp3', 'm4a', 'wav', 'mp4', 'mov', 'pdf', 'zip']) {
      expect(seal).toMatch(new RegExp(`\\|${ext}\\||\\(${ext}\\|`));
    }
  });

  it('never bans a real image format — the denylist must not become an allowlist', () => {
    // svg 92 rows, avif 83, jfif/heic/bmp/tif present. Banning any of these
    // deletes working images, which is the failure this shape exists to avoid.
    for (const ext of [
      'svg',
      'avif',
      'jfif',
      'heic',
      'bmp',
      'tiff',
      'ico',
      'webp',
      'jpg',
      'png',
      'gif',
    ]) {
      expect(seal).not.toMatch(new RegExp(`\\|${ext}\\||\\(${ext}\\|`));
    }
  });

  it('never bans a dynamic image endpoint', () => {
    // aspx 20, axd 7, php 4, cms 3 — all legitimate image handlers.
    for (const ext of ['aspx', 'axd', 'php', 'cms']) {
      expect(seal).not.toMatch(new RegExp(`\\|${ext}\\||\\(${ext}\\|`));
    }
  });
});

describe('the DB seal', () => {
  it('is a BEFORE trigger on news_articles', () => {
    expect(seal).toMatch(/BEFORE INSERT OR UPDATE OF image_url ON public\.news_articles/i);
  });

  it('is named so it fires AFTER news_articles_decode_entities rewrites image_url', () => {
    expect(seal).toMatch(/CREATE TRIGGER news_articles_zz_reject_non_image_url/i);
    // BEFORE triggers fire in name order; 'zz_r' must sort after 'decode_' and
    // after 'zz_content_hash' ('c' < 'r').
    expect('news_articles_zz_reject_non_image_url' > 'news_articles_decode_entities').toBe(true);
    expect('news_articles_zz_reject_non_image_url' > 'news_articles_zz_content_hash').toBe(true);
  });

  it('nulls the value rather than raising — ingest must not fail on a bad image', () => {
    expect(seal).toMatch(/NEW\.image_url\s*:=\s*NULL/i);
    expect(seal).not.toMatch(/RAISE EXCEPTION[^;]*image_url is not an image/i);
  });
});

describe('the repair', () => {
  it('recovers cohort A before the blanket clear can consume it', () => {
    const recover = seal.search(/SET audio_url\s*=\s*a\.image_url/i);
    const clear = seal.search(/UPDATE public\.news_articles a SET image_url = NULL/i);
    expect(recover).toBeGreaterThan(-1);
    expect(clear).toBeGreaterThan(-1);
    // Order is the whole safety property: reversed, the clear nulls those rows
    // first and the only copy of the episode audio is gone, silently.
    expect(recover).toBeLessThan(clear);
  });

  it('recovers audio_url AND media_type together', () => {
    // audio_url alone would store the URL somewhere nothing reads — the player
    // and every podcast-filtered surface key off media_type.
    expect(seal).toMatch(
      /SET audio_url\s*=\s*a\.image_url\s*,\s*media_type\s*=\s*'podcast'\s*,\s*image_url\s*=\s*NULL/i,
    );
  });

  it('only recovers on podcast feeds — an mp3 on a news feed is not an episode', () => {
    expect(seal).toMatch(/s\.feed_type\s*=\s*'podcast'/i);
  });

  it('is batched — an unbounded UPDATE risks a statement timeout, which is a full rollback', () => {
    expect(seal).toMatch(/LIMIT 300/);
  });

  it('is soft on preconditions and hard on postconditions', () => {
    // Counts are reported, never asserted: a concurrent session may legitimately
    // move these rows, and aborting would block every migration behind it.
    expect(seal).toMatch(/RAISE NOTICE/);
    expect(seal).toMatch(/RAISE EXCEPTION 'news_articles still hold/i);
    expect(seal).toMatch(
      /RAISE EXCEPTION 'news_articles_zz_reject_non_image_url is not attached'/i,
    );
  });

  it('carries positive controls, so a predicate matching nothing cannot pass', () => {
    expect(seal).toMatch(/IF NOT public\.is_non_image_url\('https:\/\/x\/ep\.mp3'\)/);
    expect(seal).toMatch(/IF public\.is_non_image_url\('https:\/\/x\/photo\.jpg\?meta=doc\.pdf'\)/);
    expect(seal).toMatch(/IF public\.is_non_image_url\('https:\/\/x\/getimage\.aspx\?id=1'\)/);
  });

  it('cleans the image registry, which renders independently of news_articles', () => {
    expect(seal).toMatch(/DELETE FROM public\.image_asset_links/i);
    expect(seal).toMatch(/RAISE EXCEPTION 'image_asset_links still reference/i);
  });
});

describe('the sentinel', () => {
  it('is standalone, not a new key on pipeline_hygiene_stats', () => {
    expect(seal).toMatch(/CREATE OR REPLACE FUNCTION public\.news_image_signals\(\)/i);
    // Restating that 150-line body is a merge-collision surface — the reason
    // event_dup_signals and venue_dup_signals are separate functions too.
    expect(seal).not.toMatch(/FUNCTION public\.pipeline_hygiene_stats/i);
  });

  it('reports whether the trigger is attached, because an absent seal and a clean corpus give the same zero', () => {
    expect(seal).toMatch(/'trigger_attached'/);
  });

  it('is service_role only', () => {
    expect(seal).toMatch(
      /REVOKE ALL ON FUNCTION public\.news_image_signals\(\) FROM PUBLIC, anon/i,
    );
  });
});

describe('the artwork backfill', () => {
  it('registers the cron in admin_automations and pg_cron in one migration', () => {
    expect(artwork).toMatch(/INSERT INTO public\.admin_automations/i);
    expect(artwork).toMatch(/cron\.schedule\(\s*'news_podcast_artwork_fill'/i);
    expect(artwork).toMatch(/RAISE EXCEPTION 'news_podcast_artwork_fill cron was not scheduled'/i);
  });

  it('refuses to re-introduce a non-image artwork_url — in the SELECTION, not just the count', () => {
    // The guard appears twice: once in the UPDATE's batch CTE (load-bearing)
    // and once in the `remaining` subquery (reporting only). A bare toMatch is
    // VACUOUS here — deleting the load-bearing copy still matches the reporting
    // one, which is exactly what mutation testing showed. Scope the assertion
    // to the CTE by requiring it before that CTE's LIMIT.
    const cte = artwork.slice(
      artwork.search(/WITH batch AS/i),
      artwork.search(/LIMIT greatest\(p_batch, 0\)/i),
    );
    expect(cte).toMatch(/NOT public\.is_non_image_url\(s\.artwork_url\)/i);
    // And the reporting side must agree, or `remaining` reports work the
    // selection will never do — a queue that never drains to zero.
    const occurrences = artwork.match(/NOT public\.is_non_image_url\(s\.artwork_url\)/gi) ?? [];
    expect(occurrences.length).toBe(2);
  });

  it('is batched, for the same search-trigger reason as the repair', () => {
    expect(artwork).toMatch(/LIMIT greatest\(p_batch, 0\)/i);
  });
});
