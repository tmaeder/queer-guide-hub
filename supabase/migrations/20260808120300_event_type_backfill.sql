-- Event type backfill
--
-- Re-derives events.event_type for the two buckets the gaycities mapper produced:
-- 10,782 'concert' and 7,225 'other' (45% of the corpus).
--
-- The 'concert' bucket is not merely unknown, it is positively WRONG. It exists
-- because /concert|music|dj\b/ was evaluated before /party|club night|.../ in a
-- first-match-wins rule list, so any club listing mentioning a DJ became a concert.
-- Hand-sampling the bucket found roughly one real concert in ten.
--
-- Two traps this function is built around
-- ---------------------------------------
-- 1. tags[] IS CIRCULAR AND MUST NOT BE USED AS A SIGNAL. The old mapper wrote its
--    verdict into tags as well: all 10,782 rows carry the literal tag 'concert'.
--    A first draft of this backfill matched on title+description+tags and "confirmed"
--    concert for 2,277 rows -- it was reading its own bug back. Hand-checking those
--    predictions is what surfaced it. This function reads TITLE and DESCRIPTION only.
--
-- 2. `music` is not evidence of a concert. "Summer Music Jam", "New Energy in Music",
--    "BUKU Music + Art Project" are club nights and festivals. The concert rule needs
--    an explicit performance signal (concert / tour / symphony / chorus / recital /
--    live at), and it is read from the TITLE, because a club night's DESCRIPTION
--    routinely says "music by ...".
--
-- Precedence mirrors scraper/src/sources/gaycities/lib.ts so ingest and backfill
-- cannot disagree: format words beat genre words, and subculture words (bear/leather)
-- rank below explicit formats because they describe an audience, not a format.
--
-- Resulting split of the 10,782-row 'concert' bucket, hand-verified by sampling:
--   party         5,579  -- 20 sampled, 20 correct (DJ residencies, club brands,
--                           "No Cover Fridays", "Afterhour")
--   other         1,431  -- no signal: an honest unknown rather than a guess
--   fetish          658
--   concert         545  -- 22 sampled, ~19 genuine (Cher, Madonna, Kylie Minogue,
--                           Tegan and Sara, chorale concerts)
--   festival        438
--   fundraiser      434
--   theater         387
--   sports          361  -- plus smaller buckets
--
-- This function and mapEventType() in the scraper were verified to agree on 300/300
-- rows of this bucket. Comparing their output DISTRIBUTIONS looked fine at 97% while
-- hiding two real divergences, both found only by diffing per row: '\mconcert\M' does
-- not match the plural "Concerts" (so Ariana Grande / Bastille listings fell to
-- 'other'), and '\mfest\M' does not match "Oktoberfest" or "HUSHfest". Compare
-- per row, not in aggregate.

CREATE OR REPLACE FUNCTION public.infer_event_type(
  p_title       text,
  p_description text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  WITH s AS (
    SELECT lower(coalesce(p_title, '')) AS t,
           lower(coalesce(p_title, '') || ' ' || left(coalesce(p_description, ''), 400)) AS txt
  ),
  hit AS (
    SELECT CASE
      WHEN txt ~ '\mpride\M|christopher street day|\mcsd\M'                  THEN 'pride'
      WHEN txt ~ '\mdrag\M'                                                   THEN 'drag'
      WHEN txt ~ '\mcruise\M|\msailing\M|\mcharter\M'                         THEN 'cruise'
      WHEN txt ~ 'comedy|stand-?up|improv'                                    THEN 'comedy'
      WHEN txt ~ 'film|movie|cinema|screening'                                THEN 'film'
      WHEN txt ~ 'theatre|theater|musical|opera'                              THEN 'theater'
      WHEN txt ~ 'exhibition|\mexhibit\M|vernissage'                          THEN 'exhibition'
      WHEN txt ~ 'conference|summit|convention|symposium'                     THEN 'conference'
      WHEN txt ~ 'workshop|\mclass\M|seminar|masterclass'                     THEN 'workshop'
      WHEN txt ~ 'sports|\mrun\M|\mrace\M|rodeo|tournament|\mski\M|marathon|\mgames\M' THEN 'sports'
      WHEN txt ~ 'protest|march for|rally|demonstration|vigil'                THEN 'protest'
      WHEN txt ~ 'fundrais|charity|benefit|\mgala\M'                          THEN 'fundraiser'
      WHEN txt ~ 'street.?fair|\mfair\M|\mexpo\M|\mmarket\M'                  THEN 'fair'
      WHEN txt ~ 'meetup|meet-up|mixer|networking'                            THEN 'meetup'
      WHEN txt ~ '\mbears?\M|\mleather\M|fetish|\mkink\M|\mrubber\M|pup(py)? play|cruising' THEN 'fetish'
      WHEN txt ~ 'festival|fest\M'                                          THEN 'festival'
      -- A title saying "party" wins over a performance word: "Madonna Fan Party",
      -- "Kylie Minogue Concert After Party" and "...LIVE AT OUR GRAND OPENING PARTY"
      -- are parties, and they were the only misses in the sampled concert branch.
      WHEN t   ~ '\mparty\M'                                                  THEN 'party'
      -- `music of` ("The Music of the Beatles") is a tribute-concert idiom and is a
      -- clean signal, unlike bare `music`; all 14 corpus titles carrying it are concerts.
      WHEN t   ~ 'concert|live in concert|\mtour\M|symphony|philharmonic|chorus|choir|recital|unplugged|\mlive at\M|\mlive in\M|music of' THEN 'concert'
      WHEN txt ~ 'party|club night|tea.?dance|pool.?party|t-?dance|circuit|\mdjs?\M|afterparty|\mball\M|\mbash\M|no cover|drink specials' THEN 'party'
      WHEN txt ~ 'concert|live band|symphony|philharmonic|chorus|choir|recital' THEN 'concert'
      WHEN txt ~ '\mart\M|gallery'                                            THEN 'art'
      WHEN txt ~ 'community|\msocial\M'                                       THEN 'social'
      ELSE NULL
    END AS cat
    FROM s
  )
  SELECT jsonb_build_object(
    'event_type', coalesce(cat, 'other'),
    'confidence', CASE cat
      WHEN 'party'      THEN 0.95  -- 20/20 on a hand-checked sample
      WHEN 'pride'      THEN 0.90
      WHEN 'drag'       THEN 0.90
      WHEN 'protest'    THEN 0.90
      WHEN 'concert'    THEN 0.86  -- ~19/22 on a hand-checked sample
      WHEN 'comedy'     THEN 0.85
      WHEN 'film'       THEN 0.85
      WHEN 'theater'    THEN 0.85
      WHEN 'conference' THEN 0.85
      WHEN 'workshop'   THEN 0.85
      WHEN 'sports'     THEN 0.85
      WHEN 'fundraiser' THEN 0.85
      WHEN 'meetup'     THEN 0.85
      WHEN 'fetish'     THEN 0.85
      WHEN 'festival'   THEN 0.85
      WHEN 'cruise'     THEN 0.80
      WHEN 'exhibition' THEN 0.80
      WHEN 'fair'       THEN 0.80
      WHEN 'art'        THEN 0.70
      WHEN 'social'     THEN 0.60
      ELSE 0                        -- no signal -> 'other', deliberately unconfident
    END
  )
  FROM hit;
$$;

COMMENT ON FUNCTION public.infer_event_type(text, text) IS
  'Re-derives events.event_type from title + description. Deliberately ignores tags[]: '
  'the mapper that produced the bad data also wrote its verdict there, so tags are a '
  'circular signal. Mirrors the rule order in scraper gaycities/lib.ts.';

-- ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_event_type_reclassify(
  p_batch          integer DEFAULT 300,
  p_scope          text    DEFAULT 'concert',   -- 'concert' | 'other'
  p_min_confidence numeric DEFAULT 0.75,
  p_dry_run        boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  -- 300 is the ceiling: trg_search_documents_event re-indexes on every UPDATE and a
  -- 300-row events batch already costs ~14.6s, ~13.8s of it that trigger. A timeout
  -- is a full rollback.
  v_batch    int := GREATEST(1, LEAST(coalesce(p_batch, 300), 300));
  v_examined int := 0;
  v_applied  int := 0;
  v_skipped  int := 0;
  v_by_type  jsonb := '{}'::jsonb;
  rec        record;
  v_inf      jsonb;
  v_type     text;
  v_conf     numeric;
BEGIN
  PERFORM public.assert_admin_or_internal();

  IF p_scope NOT IN ('concert', 'other') THEN
    RAISE EXCEPTION 'p_scope must be ''concert'' or ''other'', got %', p_scope;
  END IF;

  FOR rec IN
    SELECT e.id, e.title, e.description, e.event_type, e.tags
    FROM public.events e
    WHERE e.duplicate_of_id IS NULL
      AND e.event_type = p_scope
      AND NOT (coalesce(e.enrichment_status, '{}'::jsonb) ? 'event_type_backfill')
    ORDER BY e.id
    LIMIT v_batch
  LOOP
    v_examined := v_examined + 1;
    v_inf  := public.infer_event_type(rec.title, rec.description);
    v_type := v_inf->>'event_type';
    v_conf := (v_inf->>'confidence')::numeric;

    -- Leaving a known-wrong 'concert' in place is not the safe option, so the caller
    -- can run the concert scope at a lower bar than the 'other' scope, where the
    -- current value is merely unknown and a wrong guess would be a regression.
    --
    -- 'other' is exempt from the confidence bar on purpose. It is what the inference
    -- returns when it finds NO signal, and demoting a known-wrong 'concert' to an
    -- honest "unknown" is strictly an improvement -- it removes a false claim rather
    -- than making a new one. Without this exemption the 1,642 no-signal rows in the
    -- concert bucket would keep the label the bug gave them. In the 'other' scope the
    -- first condition already makes this a no-op.
    IF v_type = rec.event_type OR (v_conf < p_min_confidence AND v_type <> 'other') THEN
      v_skipped := v_skipped + 1;
      IF NOT p_dry_run THEN
        UPDATE public.events SET
          enrichment_status = jsonb_set(
            coalesce(enrichment_status, '{}'::jsonb), '{event_type_backfill}',
            jsonb_build_object('from', rec.event_type, 'to', NULL,
                               'confidence', v_conf, 'status', 'kept'))
        WHERE id = rec.id;
      END IF;
      CONTINUE;
    END IF;

    v_applied := v_applied + 1;
    v_by_type := jsonb_set(v_by_type, ARRAY[v_type],
                   to_jsonb(coalesce((v_by_type->>v_type)::int, 0) + 1));

    IF NOT p_dry_run THEN
      UPDATE public.events SET
        event_type = v_type,
        -- Drop the stale type token the old mapper injected into tags (all 10,782
        -- concert rows carry the literal tag 'concert'). Deliberately do NOT write the
        -- new type back as a tag: duplicating event_type into tags is exactly what made
        -- the old verdict circular, and event_type already carries it.
        tags = array_remove(coalesce(tags, '{}'::text[]), rec.event_type),
        enrichment_status = jsonb_set(
          coalesce(enrichment_status, '{}'::jsonb), '{event_type_backfill}',
          jsonb_build_object('from', rec.event_type, 'to', v_type,
                             'confidence', v_conf, 'status', 'applied'))
      WHERE id = rec.id;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'examined', v_examined, 'applied', v_applied, 'kept', v_skipped,
    'by_type', v_by_type, 'scope', p_scope, 'dry_run', coalesce(p_dry_run, false));
END;
$$;

REVOKE ALL ON FUNCTION public.run_event_type_reclassify(integer, text, numeric, boolean) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_event_type_reclassify(integer, text, numeric, boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.reset_event_type_state()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_rows int;
BEGIN
  PERFORM public.assert_admin_or_internal();
  UPDATE public.events SET enrichment_status = enrichment_status - 'event_type_backfill'
  WHERE enrichment_status ? 'event_type_backfill';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN jsonb_build_object('cleared', v_rows);
END;
$$;

REVOKE ALL ON FUNCTION public.reset_event_type_state() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_event_type_state() TO service_role;

-- ---------------------------------------------------------------------------------
-- Drains the known-wrong 'concert' bucket first. Once it is empty the same job keeps
-- running harmlessly (0 rows examined); the 'other' scope is left to a deliberate
-- operator run because there the current value is unknown rather than wrong.
INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES (
  'event_type_reclassify',
  'Event type reclassify',
  'Re-derives events.event_type for rows the gaycities mapper filed as ''concert'' '
    '(10,782 rows, roughly nine in ten wrong). Reads title + description only -- tags '
    'are circular. 300/batch for the search-sync trigger.',
  'system', true,
  '{"type":"schedule"}'::jsonb,
  '[]'::jsonb,
  jsonb_build_object('type','cron','jobname','event_type_reclassify',
                     'command','SELECT public.run_event_type_reclassify(300, ''concert'', 0.75)'),
  '45 3 * * *'
)
ON CONFLICT (slug) DO UPDATE
  SET action = EXCLUDED.action, schedule = EXCLUDED.schedule, enabled = EXCLUDED.enabled;

SELECT cron.schedule(
  'event_type_reclassify', '45 3 * * *',
  'SELECT public.run_event_type_reclassify(300, ''concert'', 0.75)'
);
