-- News articles were storing podcast AUDIO in image_url — 5,607 rows on prod.
--
-- Producer: extractMediaUrl() in supabase/functions/source-rss-news/rss-parse.ts.
-- Its fallback took the first <enclosure url="..."> with NO type check, and on a
-- podcast item the enclosure IS the audio. Sealed in the same change; this
-- migration adds the DB-side seal (there are several writers of image_url) and
-- repairs the rows.
--
-- Measured on prod 2026-09-08, by URL path (query string stripped):
--   mp3 5,548 · m4a 52 · wav 1 · mp4 6  = 5,607
--   no .pdf and no .zip — the widened check came back clean on those.
-- Also present and DELIBERATELY NOT touched: aspx 20, axd 7, php 4, cms 3.
-- Those are dynamic image endpoints and are legitimate, which is why the
-- predicate below is a DENYLIST of known non-image extensions. An image-
-- extension ALLOWLIST would have destroyed 34 working images.
--
-- Harm was wider than the torn-page glyph: 2,405 of the 5,607 are
-- seo_indexable, and functions/_lib/detail.ts feeds news image_url into the
-- crawler <head>, so those rows publish an MP3 as og:image.
--
-- THE REPAIR IS NOT ONE BLANKET NULL, and that is the whole point of measuring
-- before writing it. The rows split three ways:
--
--   A. 2,865 rows  media_type='article', audio_url IS NULL, created
--      2026-03-06 → 2026-07-29, 2,857 of them on feed_type='podcast' sources.
--      These straddle 20260623063103 (podcast support, 2026-06-23) — they were
--      ingested through the NEWS branch before audio_url/media_type existed, so
--      image_url is the ONLY surviving copy of the episode's audio. Nulling
--      them would have destroyed the audio URL of 2,865 podcast episodes. They
--      are MIGRATED, not cleared.
--   B. 2,742 rows  media_type='podcast', audio_url already set and equal to
--      image_url (2,741 exactly equal; 1 differs). Plain NULL, zero loss.
--   C. 6 rows      .mp4 on NEWS sites (epgn, outsports, worthynews), 0 on
--      podcast feeds. news_articles has no video column and a video URL in an
--      image column is not data worth a new one. Plain NULL.

-- ── 1. One predicate, three consumers ─────────────────────────────────────
--
-- Tests the URL PATH ONLY. Matching the whole URL false-positives on a
-- legitimate `…/photo.jpg?meta=x.json`, where the banned extension sits in the
-- query string and the real one does not end the string.
CREATE OR REPLACE FUNCTION public.is_non_image_url(p_url text)
RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $$
  SELECT p_url IS NOT NULL
     AND split_part(split_part(p_url, '#', 1), '?', 1) ~*
         '\.(mp3|m4a|m4b|wav|ogg|oga|opus|aac|flac|wma|mp4|m4v|mov|avi|webm|mkv|wmv|flv|ogv|pdf|zip|gz|rar|7z|doc|docx)$';
$$;

COMMENT ON FUNCTION public.is_non_image_url(text) IS
  'True when a URL path ends in a known non-image extension. Denylist, not an allowlist: aspx/axd/php/cms image endpoints are legitimate and svg/avif/jfif/heic/bmp/tif are images. Shared by the news_articles trigger, the repair and news_image_signals() so they cannot drift.';

-- ── 2. DB seal ────────────────────────────────────────────────────────────
--
-- The parser fix closes the proven writer, but image_url has several: the
-- source-* → staging → news_commit_staging_batch path, pipeline-normalize
-- (which accepts any http URL), and the quality backfill's snapshot. Same
-- reasoning as trg_staging_human_approval_clears_validation — patching one
-- writer of four leaves three.
CREATE OR REPLACE FUNCTION public.news_articles_reject_non_image_url()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF public.is_non_image_url(NEW.image_url) THEN
    NEW.image_url := NULL;
  END IF;
  RETURN NEW;
END $$;

-- The zz_ prefix is load-bearing: BEFORE triggers fire in NAME order and
-- news_articles_decode_entities rewrites image_url, so this must run after it
-- to test the value that will actually be stored. Sorts after
-- news_articles_zz_content_hash ('c' < 'r') and before ..._zzz_code_residue.
DROP TRIGGER IF EXISTS news_articles_zz_reject_non_image_url ON public.news_articles;
CREATE TRIGGER news_articles_zz_reject_non_image_url
  BEFORE INSERT OR UPDATE OF image_url ON public.news_articles
  FOR EACH ROW EXECUTE FUNCTION public.news_articles_reject_non_image_url();

-- ── 3. Measure, then repair ───────────────────────────────────────────────
--
-- SOFT ON PRECONDITIONS: the counts are reported, never asserted. A concurrent
-- session can legitimately move these rows between authoring and CI, and an
-- abort here would block every migration queued behind it on main.
DO $$
DECLARE
  v_a int; v_b int; v_c int; v_ext jsonb;
BEGIN
  SELECT jsonb_object_agg(ext, n) INTO v_ext FROM (
    SELECT lower(substring(split_part(split_part(image_url,'#',1),'?',1) from '\.([A-Za-z0-9]{1,5})$')) AS ext,
           count(*) AS n
    FROM public.news_articles
    WHERE public.is_non_image_url(image_url)
    GROUP BY 1
  ) s;

  SELECT count(*) INTO v_a
  FROM public.news_articles a JOIN public.news_sources s ON s.id = a.source_id
  WHERE public.is_non_image_url(a.image_url)
    AND a.audio_url IS NULL AND s.feed_type = 'podcast';

  SELECT count(*) INTO v_b FROM public.news_articles
  WHERE public.is_non_image_url(image_url) AND audio_url IS NOT NULL;

  SELECT count(*) INTO v_c FROM public.news_articles
  WHERE public.is_non_image_url(image_url);

  RAISE NOTICE 'non-image image_url by extension: %', coalesce(v_ext, '{}'::jsonb);
  RAISE NOTICE 'cohort A (recoverable audio, podcast feed): %', v_a;
  RAISE NOTICE 'cohort B (audio_url already set): %', v_b;
  RAISE NOTICE 'total to repair: %', v_c;
END $$;

-- Cohort A — RECOVER. `audio_url = image_url, image_url = NULL` in one UPDATE
-- is correct: SET expressions read the row's pre-update values, so audio_url
-- receives the old image_url rather than the null assigned beside it.
--
-- Gated on feed_type='podcast'. 8 of the 2,865 sit on non-podcast sources and
-- are deliberately excluded here — an .mp3 on a news feed is not evidence of a
-- podcast episode, and those fall through to the blanket clear below.
--
-- media_type is flipped too. Recovering audio_url alone would store the URL
-- somewhere nothing reads: the player and every podcast-filtered surface key
-- off media_type, so the row would keep rendering as an article with an
-- unreachable audio column. duration_seconds stays null — it was never parsed
-- for these rows and inventing one is not available.
DO $$
DECLARE v_n int; v_total int := 0;
BEGIN
  LOOP
    WITH batch AS (
      SELECT a.id FROM public.news_articles a
      JOIN public.news_sources s ON s.id = a.source_id
      WHERE public.is_non_image_url(a.image_url)
        AND a.audio_url IS NULL
        AND s.feed_type = 'podcast'
      LIMIT 300
    )
    UPDATE public.news_articles a
       SET audio_url  = a.image_url,
           media_type = 'podcast',
           image_url  = NULL
      FROM batch b WHERE a.id = b.id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_total := v_total + v_n;
    EXIT WHEN v_n = 0;
  END LOOP;
  RAISE NOTICE 'cohort A recovered (audio_url + media_type): %', v_total;
END $$;

-- Cohorts B and C — clear. Batched at 300: news_articles carries a search sync
-- trigger, and a statement timeout inside it is a full rollback of the
-- migration, not a partial write.
DO $$
DECLARE v_n int; v_total int := 0;
BEGIN
  LOOP
    WITH batch AS (
      SELECT id FROM public.news_articles
      WHERE public.is_non_image_url(image_url) LIMIT 300
    )
    UPDATE public.news_articles a SET image_url = NULL
      FROM batch b WHERE a.id = b.id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_total := v_total + v_n;
    EXIT WHEN v_n = 0;
  END LOOP;
  RAISE NOTICE 'cohorts B+C cleared: %', v_total;
END $$;

-- ── 4. The image registry is a SECOND surface ─────────────────────────────
--
-- tg_news_articles_sync_image_assets fires on every image_url write, so the
-- same defect populated image_assets: 5,708 asset rows whose url is audio or
-- video, with 5,715 links, every one entity_type='news_article'. That count
-- EXCEEDS the article count because an article whose image later changed left
-- its old asset behind. This surface renders independently of
-- news_articles.image_url, so repairing only the column would have left a
-- known-bad registry serving the same broken references.
--
-- Links are deleted (they are what makes an asset reachable); the assets
-- themselves are FLAGGED rather than dropped, keeping the audit trail and the
-- change reversible.
DO $$
DECLARE v_links int; v_assets int;
BEGIN
  WITH bad AS (SELECT id FROM public.image_assets WHERE public.is_non_image_url(url))
  DELETE FROM public.image_asset_links l USING bad WHERE l.asset_id = bad.id;
  GET DIAGNOSTICS v_links = ROW_COUNT;

  UPDATE public.image_assets
     SET is_flagged = true,
         flagged_reason = coalesce(flagged_reason, 'non_image_url: audio/video stored as an image')
   WHERE public.is_non_image_url(url) AND is_flagged IS DISTINCT FROM true;
  GET DIAGNOSTICS v_assets = ROW_COUNT;

  RAISE NOTICE 'image registry: % links deleted, % assets flagged', v_links, v_assets;
END $$;

-- ── 5. Sentinel ───────────────────────────────────────────────────────────
--
-- Standalone, not a key on pipeline_hygiene_stats(): adding one there means
-- restating that function's whole body, which is a merge-collision surface —
-- the reason event_dup_signals() and venue_dup_signals() are separate too.
--
-- `articles` is zero-tolerance with no baseline and no floor. It cannot rise
-- through an INSERT or UPDATE while the trigger exists, so any non-zero value
-- is a writer that got around it — exactly the signal worth waking someone.
CREATE OR REPLACE FUNCTION public.news_image_signals()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'articles', (SELECT count(*) FROM public.news_articles WHERE public.is_non_image_url(image_url)),
    'registry_links', (
      SELECT count(*) FROM public.image_asset_links l
      JOIN public.image_assets ia ON ia.id = l.asset_id
      WHERE public.is_non_image_url(ia.url)
    ),
    -- Proof the seal is attached. An absent trigger and a clean corpus look
    -- identical from the counts alone, and only one of them is safe.
    'trigger_attached', EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgrelid = 'public.news_articles'::regclass
        AND tgname = 'news_articles_zz_reject_non_image_url'
        AND NOT tgisinternal
    ),
    -- Advisory: podcast episodes still carrying no artwork at all. Drains as
    -- news_sources.artwork_url fills (see 20361118143800); never zero while a
    -- show publishes no <itunes:image> of its own.
    'podcast_without_image', (
      SELECT count(*) FROM public.news_articles
      WHERE media_type = 'podcast' AND (image_url IS NULL OR btrim(image_url) = '')
    ),
    -- THE SURFACE USERS ACTUALLY SEE IN SEARCH. search_documents keeps its own
    -- copy of image_url — 3,252 of them were audio when this was written — and
    -- renders it on every result card. It is deliberately NOT repaired here:
    -- clearing news_articles.image_url enqueues the row and search_reindex_drain
    -- rewrites it. Verified on prod in a rolled-back txn: 20 sampled rows went
    -- 20 → 0 through one drain, all 20 ending null.
    --
    -- It is REPORTED because that self-heal has a dependency. A stalled drain
    -- leaves search serving audio URLs while `articles` above reads a clean
    -- zero — the exact shape where one surface being fixed hides another that
    -- is not. These two counts plus the queue depth are what separate ordinary
    -- lag (expected for a few minutes after the repair enqueues ~5,600 rows)
    -- from a real desync; check-pipeline-health.mjs fails only when the queue
    -- is empty AND articles is zero AND search still disagrees.
    'search_documents', (
      SELECT count(*) FROM public.search_documents
      WHERE public.is_non_image_url(image_url)
    ),
    'reindex_queue_depth', (SELECT count(*) FROM public.search_reindex_queue)
  );
$$;

REVOKE ALL ON FUNCTION public.news_image_signals() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.news_image_signals() TO service_role;

COMMENT ON FUNCTION public.news_image_signals() IS
  'Zero-tolerance sentinel for audio/video stored in news_articles.image_url. Read by scripts/check-pipeline-health.mjs.';

-- ── 6. HARD ON POSTCONDITIONS ─────────────────────────────────────────────
DO $$
DECLARE v jsonb := public.news_image_signals();
BEGIN
  IF (v->>'articles')::int <> 0 THEN
    RAISE EXCEPTION 'news_articles still hold % non-image image_url rows', v->>'articles';
  END IF;
  IF (v->>'registry_links')::int <> 0 THEN
    RAISE EXCEPTION 'image_asset_links still reference % non-image assets', v->>'registry_links';
  END IF;
  IF NOT (v->>'trigger_attached')::boolean THEN
    RAISE EXCEPTION 'news_articles_zz_reject_non_image_url is not attached';
  END IF;
  -- Positive control: a predicate that matches nothing would satisfy every
  -- assertion above while repairing nothing at all.
  IF NOT public.is_non_image_url('https://x/ep.mp3') THEN
    RAISE EXCEPTION 'is_non_image_url fails to match a plain .mp3';
  END IF;
  IF public.is_non_image_url('https://x/photo.jpg?meta=doc.pdf') THEN
    RAISE EXCEPTION 'is_non_image_url matches the query string, not the path';
  END IF;
  IF public.is_non_image_url('https://x/getimage.aspx?id=1') THEN
    RAISE EXCEPTION 'is_non_image_url rejects a dynamic image endpoint';
  END IF;
END $$;
