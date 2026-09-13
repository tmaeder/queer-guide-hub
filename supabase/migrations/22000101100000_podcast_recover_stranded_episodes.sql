-- Recover the podcast episodes that committed as plain articles, and the
-- durations that went with them.
--
-- WHAT HAPPENED. Podcast support shipped 2026-06-23 (20260623063103). A later
-- redefinition of news_commit_staging_batch dropped media_type / audio_url /
-- duration_seconds from its INSERT list, so for three weeks every episode
-- committed as an ARTICLE: media_type defaulted to 'article' and the audio URL
-- was discarded. 20260714190059 fixed the RPC and its own header records the
-- outage ("no podcast row committed for ~3 weeks"). Nothing ever repaired the
-- rows the outage produced, and they have been serving ever since.
--
-- Measured on prod 2026-09-12: 5,729 rows, ALL of them from feed_type='podcast'
-- sources, ALL created between 2026-06-23 and 2026-07-14 and none since.
-- 3,330 are seo_indexable and 3,570 are live in search — published as articles,
-- with no player, under a "Read the full article at …" call to action.
--
-- WHY THE AUDIO IS NOT LOST. The parser always emitted the three fields; only
-- the commit RPC dropped them. They are still sitting in the staging row, which
-- links to the article it produced via ingestion_staging.target_record_id.
-- Measured: 5,729 of 5,729 match a staging row, and 5,729 of 5,729 carry
-- metadata.audio_url. 5,723 carry duration_seconds too. No re-fetch is needed,
-- which matters because most of these episodes have long since fallen out of
-- their feed's window and could never have been re-fetched.
--
-- WHAT THIS DOES NOT DO. It does not touch image_url. 4,796 podcast rows have
-- no artwork and every one of them has a staged metadata.image_url — but 0 of
-- those pass is_non_image_url(), because they ARE the audio URL (the defect
-- 20361118143700 exists to seal). Copying them back would re-create exactly the
-- 5,607-row MP3-as-og:image fault. Show artwork is filled by the nightly
-- news_podcast_artwork_fill; that is the only correct source.
--
-- BATCHING. trg_search_documents_news fires per row. Measured on prod in a
-- rolled-back transaction: 300 rows / 743 ms / 2.48 ms per row, so the whole
-- repair is ~14 s in 300-row statements. A single 5,729-row UPDATE is one
-- statement against the statement timeout, and a timeout is a full rollback.
--
-- IDEMPOTENT. Every batch is gated on audio_url IS NULL, so a re-run selects
-- nothing, and a row that later acquires a real audio URL by any other path is
-- never overwritten.

BEGIN;

-- ── Part 1: the stranded episodes ────────────────────────────────────────────
DO $$
DECLARE
  v_batch   CONSTANT int := 300;
  v_max_it  CONSTANT int := 200;   -- 60k rows of headroom over the measured 5,729
  v_n       int;
  v_total   int := 0;
  v_it      int := 0;
BEGIN
  LOOP
    v_it := v_it + 1;
    EXIT WHEN v_it > v_max_it;

    WITH cand AS (
      SELECT a.id,
             st.normalized_data->'metadata'->>'audio_url'                    AS audio,
             nullif(st.normalized_data->'metadata'->>'duration_seconds','')::int AS dur
        FROM public.news_articles a
        JOIN public.news_sources  s  ON s.id = a.source_id
        JOIN public.ingestion_staging st
             ON st.target_record_id = a.id
            AND st.target_table = 'news_articles'
       WHERE s.feed_type = 'podcast'
         AND a.media_type IS DISTINCT FROM 'podcast'
         AND a.audio_url IS NULL
         -- The staging row must itself say this was a podcast. A podcast SOURCE
         -- can legitimately carry a non-episode item, and the corroboration is
         -- free here, so require it rather than infer episode-ness from the feed.
         AND st.normalized_data->'metadata'->>'media_type' = 'podcast'
         AND st.normalized_data->'metadata'->>'audio_url' IS NOT NULL
       LIMIT v_batch
    )
    UPDATE public.news_articles a
       SET media_type       = 'podcast',
           audio_url        = c.audio,
           -- coalesce, not assignment: if a row somehow already knows its
           -- duration, the staged value does not get to overrule it.
           duration_seconds = coalesce(a.duration_seconds, c.dur)
      FROM cand c
     WHERE c.id = a.id;

    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_total := v_total + v_n;
    EXIT WHEN v_n = 0;
  END LOOP;

  RAISE NOTICE 'podcast recovery: restored % episodes in % batches', v_total, v_it;
END $$;

-- ── Part 2: durations missing on rows that were ALREADY typed as podcasts ────
-- A separate cohort and a separate cause: these committed correctly but their
-- feed's <itunes:duration> arrived after the row did, or the row predates the
-- field. 2,940 of 3,046 are recoverable from the same staging join.
DO $$
DECLARE
  v_batch  CONSTANT int := 300;
  v_max_it CONSTANT int := 200;
  v_n      int;
  v_total  int := 0;
  v_it     int := 0;
BEGIN
  LOOP
    v_it := v_it + 1;
    EXIT WHEN v_it > v_max_it;

    WITH cand AS (
      SELECT a.id,
             nullif(st.normalized_data->'metadata'->>'duration_seconds','')::int AS dur
        FROM public.news_articles a
        JOIN public.ingestion_staging st
             ON st.target_record_id = a.id
            AND st.target_table = 'news_articles'
       WHERE a.media_type = 'podcast'
         AND a.duration_seconds IS NULL
         AND nullif(st.normalized_data->'metadata'->>'duration_seconds','') IS NOT NULL
       LIMIT v_batch
    )
    UPDATE public.news_articles a
       SET duration_seconds = c.dur
      FROM cand c
     WHERE c.id = a.id
       AND c.dur IS NOT NULL
       AND c.dur > 0;

    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_total := v_total + v_n;
    EXIT WHEN v_n = 0;
  END LOOP;

  RAISE NOTICE 'podcast recovery: filled % durations in % batches', v_total, v_it;
END $$;

-- ── Postcondition ────────────────────────────────────────────────────────────
-- Soft on preconditions (a concurrent session may legitimately have moved rows,
-- and asserting a dated snapshot of prod is how a correct migration blocks the
-- whole repo), HARD on the state this file exists to reach.
DO $$
DECLARE v_left int;
BEGIN
  SELECT count(*) INTO v_left
    FROM public.news_articles a
    JOIN public.news_sources  s  ON s.id = a.source_id
    JOIN public.ingestion_staging st
         ON st.target_record_id = a.id AND st.target_table = 'news_articles'
   WHERE s.feed_type = 'podcast'
     AND a.media_type IS DISTINCT FROM 'podcast'
     AND a.audio_url IS NULL
     AND st.normalized_data->'metadata'->>'media_type' = 'podcast'
     AND st.normalized_data->'metadata'->>'audio_url' IS NOT NULL;

  IF v_left <> 0 THEN
    RAISE EXCEPTION 'podcast recovery incomplete: % recoverable episodes still typed as articles', v_left;
  END IF;
END $$;

COMMIT;
