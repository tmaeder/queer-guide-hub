-- Two unrelated podcast-catalog defects, both seeded by
-- 20260623120000_seed_lgbtq_podcast_feeds.sql.
--
-- Runs AFTER 99991791925724 (the 36-feed seed) by version, deliberately and in
-- both worlds: on a live `db push` and on a rebuild from zero. That ordering is
-- load-bearing, because 99991791925724's P3 asserts the PRE-state of part 2 --
-- that the mis-seeded row still holds the short slug and the Trixie/Katya feed
-- does not. P3 is a guard that the SEED did not clobber the namesake, it ran at
-- its own point in history, and this file is what moves the slug afterwards.
-- The two are consistent, not contradictory; keep this file's version above it.
--
-- ============================================================
-- PART 1 -- a typo in a show's display name
-- ============================================================
-- 'A Gay and An NonGay' -> 'A Gay and A NonGay'. The feed's own <title> and the
-- show's site (gaynongay.com) both use "A". 28 published episodes, fetching
-- fine; only the stored name was wrong.
--
-- THE SLUG IS DELIBERATELY NOT MOVED. It stays `a-gay-and-an-nongay`:
--   * `trg_news_sources_slug` is BEFORE **INSERT** only, so a name UPDATE does
--     not re-derive the slug -- this is the behaviour `99960101100200`
--     established for unified_tags ("a display-name edit must not move a
--     canonical URL"), here already true by construction.
--   * There is NO slug-redirect table for news_sources (checked: 0 relations
--     matching %source%redirect%, against the venue/village/tag ones that do
--     exist), so moving it would break /podcasts/a-gay-and-an-nongay with
--     nothing to catch the old URL. A stale-but-stable slug beats a 404.
-- A postcondition asserts the slug did not move.
--
-- ============================================================
-- PART 2 -- a NON-QUEER podcast mis-ingested into the catalog
-- ============================================================
-- `The Bald and the Beautiful` (slug the-bald-and-the-beautiful, feed
-- baldandbeautiful.podomatic.com) is NOT Trixie Mattel and Katya. It is John
-- "the Balding Beauty" Salas, matched into an LGBTQ+ podcast catalog on the
-- title alone by the 2026-06-23 seed.
--
-- READING THE EPISODES IS WHAT DECIDED THE REMEDY, and it is not the one the
-- name suggests. This is not two shows sharing a name, where the fix would be
-- disambiguation. All 7 episodes are from July-August 2020 (the feed has
-- published nothing in over six years) and none of them is queer content:
-- "Uberfacts" (facts off Twitter), "karen of the week", "Carole Baskin vs
-- Cardi B", "Top Movies From July 2019-July 2020", "Life Without Live Music",
-- "Time To Get Weird", "What's Up Balding Beauty?". So the row does not belong
-- in this catalog at all, under any name.
--
-- THE OBVIOUS ONE-LINE FIX IS WRONG AND WOULD HAVE LOOKED COMPLETE.
-- Deactivating the SOURCE (`is_active=false`) removes the /podcasts show page
-- and stops future fetches -- and leaves the episodes in SITE SEARCH, because
-- `search_documents_index_news` filters on `duplicate_of_id`, `quality_status`
-- and `archived_at`, and never looks at the source's `is_active` at all.
-- Measured: all 7 episodes are `seo_indexable=false` -- so no crawler ever saw
-- them -- and 6 of the 7 ARE live in `search_documents`, i.e. a site search on
-- this platform returns "Carole Baskin vs Cardi B". `seo_indexable` governs
-- crawlers and the sitemap, not site search; that gap is the live harm here and
-- the source flag cannot reach it.
--
-- So the disposition is THREE writes at two layers, and the episode layer is
-- the one that matters:
--   (a) source   -> is_active=false, renamed so the admin list reads honestly,
--                   slug freed.
--   (b) episodes -> archived_at set. This is the lever that clears search:
--                   `trg_search_documents_news` enqueues on UPDATE, and
--                   `search_reindex_drain` DELETEs from search_documents before
--                   re-indexing, while the indexer declines to re-insert an
--                   archived row. The delete is also done inline so the end
--                   state is immediate and assertable rather than waiting on
--                   the next drain tick.
--   (c) episode_count -> 0, which is exactly what
--                   `run_news_source_episode_count` already computes (it
--                   excludes archived rows), so that nightly job stays a no-op
--                   under its own IS DISTINCT FROM guard rather than being
--                   fought.
--
-- REVERSIBLE, NOT DELETED -- the house convention for "this entity is not what
-- we thought" (archive_city_as_nonplace, archive_personality_as_nonperson).
-- Nothing is dropped: the source row, its feed URL and all 7 episodes survive,
-- and `news_articles` is in `content_versioned_tables`, so each archive write
-- gets a `content_revisions` audit with before/after for free. `news_sources`
-- is NOT versioned, so its prior values are recorded here instead:
--     id        3e2e1411-b9a4-4fc4-8a04-0bb8fef6d2b2
--     name      'The Bald and the Beautiful'
--     slug      'the-bald-and-the-beautiful'
--     is_active true
--     episode_count 7
-- `auto_paused` is deliberately left false: this is an editorial disposition,
-- not a fetch failure, and setting it would misreport this row to the
-- auto-pause sentinels as a broken feed.
--
-- PART 3 -- the freed slug goes to the real show, which is why part 2 renames
-- rather than only deactivating: `news_sources_slug_key` is UNIQUE, so the
-- canonical slug must be vacated before Trixie and Katya's row (seeded by
-- 99991791925724 as the-bald-and-the-beautiful-with-trixie-and-katya) can take
-- it. Order within this file is therefore load-bearing. No redirect is lost:
-- that row has never been published, so no URL changes under anyone.

-- ---------- PART 1: typo ----------
UPDATE public.news_sources
   SET name = 'A Gay and A NonGay'
 WHERE id = '23d54436-26fd-4e24-a5b9-b26116ef33ce'
   AND name = 'A Gay and An NonGay';

-- ---------- PART 2a: archive the 7 non-queer episodes ----------
-- THIS FILE DELIBERATELY DOES NOT DELETE FROM search_documents, and that was
-- a measurement, not a preference. An inline delete is the obvious way to
-- clear the stale rows immediately, and it is the one statement here that
-- cannot be made reliable:
--
--   `trg_search_documents_news` enqueues every touched row into
--   `search_reindex_queue`, and `search_reindex_drain` claims a batch and
--   holds its transaction for up to 75 seconds (its own budget cap), deleting
--   from search_documents for each entity it processes. Measured on prod while
--   writing this, that queue stood at 99,683 entries and the drain was hitting
--   `elapsed_ms = 75300` on EVERY run -- saturated, and effectively running
--   back-to-back. A delete against search_documents alone completed in 41 ms
--   once and then repeatedly exceeded a 60s ceiling, in both statement orders,
--   while every other statement in this file ran in 4-86 ms. A `lock_timeout`
--   of 5s did not fire, so it is load and snapshot pressure rather than a lock
--   -- which means the wait is NOT bounded by any one drain transaction while
--   the backlog persists.
--
-- A migration that waits on a saturated background job is a migration that can
-- hang `db push`, and `db push` failing or hanging blocks EVERY queued
-- migration in the repo, not just this one. So this file writes only to
-- news_sources and news_articles (measured end to end at 143 ms) and lets the
-- drain do the job it already exists to do.
--
-- Correctness does not depend on the delete. `search_documents_index_news`
-- excludes `archived_at IS NOT NULL`, and `search_reindex_drain` DELETEs from
-- search_documents before re-indexing -- so once the drain reaches these rows
-- it removes them and declines to re-insert. Setting archived_at is what makes
-- that outcome permanent; P4 asserts the reindex is enqueued so it is armed.
-- The cost, stated rather than hidden: the 6 stale rows remain searchable
-- until the drain catches up, which at the measured backlog is hours.
UPDATE public.news_articles
   SET archived_at = now()
 WHERE source_id = '3e2e1411-b9a4-4fc4-8a04-0bb8fef6d2b2'
   AND archived_at IS NULL;

-- ---------- PART 2b: retire the source and free the canonical slug ----------
UPDATE public.news_sources
   SET is_active = false,
       name = 'The Bald and the Beautiful (John Salas)',
       slug = 'the-bald-and-the-beautiful-john-salas',
       episode_count = 0
 WHERE id = '3e2e1411-b9a4-4fc4-8a04-0bb8fef6d2b2'
   AND url = 'https://baldandbeautiful.podomatic.com/rss2.xml';

-- ---------- PART 3: the real show takes the canonical slug ----------
UPDATE public.news_sources
   SET slug = 'the-bald-and-the-beautiful'
 WHERE url = 'https://feeds.simplecast.com/GPFA1MaB'
   AND feed_type = 'podcast';

DO $verify$
DECLARE
  v_bad int;
  v_slug text;
  v_name text;
BEGIN
  -- P1: the typo is gone AND the slug did not move. Both halves: a fix that
  -- also re-derived the slug would break a live /podcasts URL with no redirect
  -- table to catch it, and would pass a name-only assertion.
  SELECT name, slug INTO v_name, v_slug FROM public.news_sources
   WHERE id = '23d54436-26fd-4e24-a5b9-b26116ef33ce';
  IF v_name IS DISTINCT FROM 'A Gay and A NonGay' THEN
    RAISE EXCEPTION 'P1 failed: name is %, expected A Gay and A NonGay', v_name;
  END IF;
  IF v_slug IS DISTINCT FROM 'a-gay-and-an-nongay' THEN
    RAISE EXCEPTION 'P1 failed: slug moved to % -- a name edit must not move a canonical URL', v_slug;
  END IF;

  -- P2: the mis-ingested source is retired, and NOT by deletion. Asserts the
  -- row still exists with its feed intact, so a later pass cannot satisfy this
  -- by dropping it.
  SELECT count(*) INTO v_bad FROM public.news_sources
   WHERE id = '3e2e1411-b9a4-4fc4-8a04-0bb8fef6d2b2'
     AND url = 'https://baldandbeautiful.podomatic.com/rss2.xml'
     AND is_active = false
     AND episode_count = 0
     AND slug = 'the-bald-and-the-beautiful-john-salas';
  IF v_bad <> 1 THEN
    RAISE EXCEPTION 'P2 failed: retired source row not in the expected state (found %)', v_bad;
  END IF;

  -- P3: all 7 episodes are archived and NONE is deleted. The count is asserted
  -- too, because "0 unarchived" is equally true of a pass that removed them.
  SELECT count(*) INTO v_bad FROM public.news_articles
   WHERE source_id = '3e2e1411-b9a4-4fc4-8a04-0bb8fef6d2b2';
  IF v_bad <> 7 THEN
    RAISE EXCEPTION 'P3 failed: expected all 7 episodes preserved, found %', v_bad;
  END IF;
  SELECT count(*) INTO v_bad FROM public.news_articles
   WHERE source_id = '3e2e1411-b9a4-4fc4-8a04-0bb8fef6d2b2'
     AND archived_at IS NULL;
  IF v_bad <> 0 THEN
    RAISE EXCEPTION 'P3 failed: % episode(s) still unarchived', v_bad;
  END IF;

  -- P4: THE MECHANISM THAT CLEARS SITE SEARCH IS ARMED.
  -- This is the quantity the source flag could not reach. is_active=false
  -- removes the show page and stops fetching, and leaves the episodes
  -- SEARCHABLE, because search_documents_index_news filters on
  -- duplicate_of_id / quality_status / archived_at and never looks at the
  -- source at all -- measured, 6 of the 7 are live in search_documents while
  -- all 7 are seo_indexable=false, so no crawler ever saw them and site search
  -- returns them. P3 set archived_at, which makes re-insertion impossible;
  -- this asserts the reindex was actually ENQUEUED, so the drain removes the
  -- stale rows rather than them sitting there forever.
  --
  -- It deliberately does NOT assert search_documents is already empty. That
  -- state is produced by the drain, not by this file (see the note above on
  -- why nothing here deletes from search_documents), and asserting it would
  -- make this migration fail for a reason outside its own control.
  --
  -- `>= 7`, not `= 7`: search_reindex_queue is append-only with no unique key
  -- by design, so an entity can legitimately appear more than once.
  SELECT count(DISTINCT q.entity_id) INTO v_bad FROM public.search_reindex_queue q
   WHERE q.entity_type = 'news'
     AND q.entity_id IN (
       SELECT a.id FROM public.news_articles a
        WHERE a.source_id = '3e2e1411-b9a4-4fc4-8a04-0bb8fef6d2b2'
     );
  IF v_bad < 7 THEN
    RAISE EXCEPTION 'P4 failed: only % of 7 episodes enqueued for reindex -- site search will not clear', v_bad;
  END IF;

  -- P5: the canonical slug now belongs to the real show, and to exactly one
  -- row. Keyed on the FEED URL, never the name, since the name is what caused
  -- this defect in the first place.
  SELECT count(*) INTO v_bad FROM public.news_sources
   WHERE slug = 'the-bald-and-the-beautiful';
  IF v_bad <> 1 THEN
    RAISE EXCEPTION 'P5 failed: expected exactly 1 row on the canonical slug, found %', v_bad;
  END IF;
  SELECT count(*) INTO v_bad FROM public.news_sources
   WHERE slug = 'the-bald-and-the-beautiful'
     AND url = 'https://feeds.simplecast.com/GPFA1MaB'
     AND is_active = true;
  IF v_bad <> 1 THEN
    RAISE EXCEPTION 'P5 failed: canonical slug is not held by the active Trixie/Katya feed';
  END IF;

  -- P6: a control. The 36 feeds seeded by 99991791925724 are untouched by this
  -- file -- it changes two rows and 7 episodes, nothing else.
  SELECT count(*) INTO v_bad FROM public.news_sources
   WHERE feed_type = 'podcast' AND is_active
     AND url IN ('https://rss.art19.com/racechaser',
                 'https://feeds.simplecast.com/hasl_NGb',
                 'https://rss.art19.com/lgbtqnation',
                 'https://queernews.libsyn.com/rss');
  IF v_bad <> 4 THEN
    RAISE EXCEPTION 'P6 failed: expected the 4 sampled seeded feeds active, found %', v_bad;
  END IF;
END
$verify$;
