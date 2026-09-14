-- ============================================================================
-- Close adult-profile link proposals whose "encyclopedic provenance" is a
-- disambiguation page
--
-- 1,735 of the 3,997 open review rows — 43% of the whole queue — are
-- adult-profile link proposals written in a single batch on 2026-08-15. They
-- are the largest cohort by far, they carry the highest `priority_weight` in
-- the registry, and at confidence 0.40-0.60 the old priority formula sorted
-- them to the very top. They are the first thing a reviewer sees.
--
-- The largest tier inside them is `encyclopedic_provenance`, 1,169 rows. That
-- tier exists for a good reason, quoted from `_shared/adult-profile-probe.ts`:
--
--     Wikidata/Wikipedia provenance with NO documented adult occupation: this
--     is very likely a real name, where a name-only match is defamatory if
--     wrong.
--
-- WHAT THE PROVENANCE ACTUALLY IS. Measured on prod 2026-09-14: of the 1,169,
-- 766 carry a `personality_sources` row with a real `en.wikipedia.org/wiki/`
-- URL, and reading them shows what those articles are:
--
--     Jack            -> Jack_(given_name)
--     Kyle            -> Kyle_(given_name)
--     Griffin         -> Griffin_(surname)
--     Bobby Clark     -> Bobby_Clark_(rugby_union)
--     Alex Graham     -> Alex_Graham_(footballer)
--     Mark Mason      -> Mark_Mason_(athlete)
--     Cole Turner     -> List_of_Charmed_characters
--     Zach Stevens    -> List_of_The_O.C._characters
--     Ryan Patrick    -> Ryan_Murphy_(producer)
--     Jong            -> Yang_(surname)
--
-- Two stratified samples of 22 and 20 were read by hand: 42 of 42 are a
-- given-name page, a surname page, a cast list, or an article about a
-- different, named, non-adult public figure. Not one is an encyclopedia
-- article about the performer.
--
-- SO THE ROW IS UNDECIDABLE, NOT MERELY UNCERTAIN. The question the queue asks
-- is "is our Jack the performer at xvideos.com/profiles/jack". Our evidence
-- for who "Jack" is, is the Wikipedia article about the NAME Jack. There is
-- nothing on the row for a reviewer to weigh, and no amount of care converts
-- it into an answer. That is categorically different from the 749
-- accessibility proposals or the 346 criminalizing-destination safety notes,
-- which are hard but answerable — and those are what these rows were sitting
-- on top of.
--
-- THE GATE IS NOT THE BUG, AND THIS IS THE PART THAT MUST NOT BE "FIXED".
-- It is tempting to read the above as "`encyclopedic` is misfiring, narrow
-- it". Do not. `encyclopedic` is derived in
-- `personalities_due_for_adult_links` as "has a wikidata or wikipedia source
-- row", and it is the LAST arm of `decideTier`. Narrowing it so a
-- disambiguation page no longer counts does not send these rows somewhere
-- safer — it drops them straight through to the `auto` tier, because they
-- already passed the exact-name-match and curated-directory checks above it.
-- `Bobby Clark` would then be auto-linked to a porn profile with no human
-- anywhere in the loop, which is precisely the defamation the tier was written
-- to prevent. The gate is broad ON PURPOSE and stays exactly as it is.
--
-- The disposition is therefore to REJECT the proposal, never to approve it and
-- never to re-tier it. Rejecting publishes nothing: the link is not written,
-- the personality is untouched except for a flag, and the only change is that
-- an unanswerable question stops occupying a reviewer's queue.
--
-- WHY THIS DOES NOT BECOME A TREADMILL. Every one of the 1,169 rows carries
-- `enrichment_status.adult_links.<platform>.state = 'review_queued'` (measured:
-- 1,169 of 1,169), and `personalities_due_for_adult_links` excludes that state
-- from its work list. So the producer will not re-probe these people and will
-- not re-offer the proposal. This is checked rather than assumed, because the
-- same assumption made the wrong way round is what produced the marketplace
-- rejection treadmill, where 126 listings were rejected more than once.
--
-- THE SECOND DEFECT IS RECORDED, NOT SWALLOWED. A personality row whose
-- encyclopedic source is `Jack_(given_name)` has a wrong-entity link — the
-- same namesake-chimera class this repo has already found on glossary tags
-- (`golden-shower` -> Cassia fistula) and on cities (Daphne -> the Greek
-- nymph). Closing the review row does not fix that, so each affected
-- personality is flagged `needs_attention` and stamped with the offending URL
-- under `enrichment_status.wrong_entity_candidate`. That is a separate piece
-- of work and it now has a worklist instead of being invisible.
--
-- SCOPE IS DELIBERATELY THE PROVABLE SET ONLY. 221 of 766 match. The other 545
-- include genuine performers with genuine articles (Johnny Rapid, Adam Ramzi,
-- Tim Kruger) and also junk this pattern cannot see — `Heavy` ->
-- Heavy_metal_music, `Adultery` -> Adultery — which is left alone precisely
-- because a regex cannot prove those and a human should look. Under-reaching
-- is the correct error here.
-- ============================================================================

-- The three provable shapes, as one immutable predicate so the closer, the
-- sentinel and the tests cannot drift apart. A URL is junk when the article it
-- names cannot be about this performer NO MATTER WHO THEY ARE:
--   * a given-name / surname / name page  — an article about the name itself
--   * a List_of_ page                     — a cast or roster, not a person
--   * a parenthetical occupation that is not adult performance — a different,
--     specifically-identified public figure
CREATE OR REPLACE FUNCTION public.wikipedia_url_cannot_identify_person(p_url text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT p_url IS NOT NULL
     AND p_url ~* 'wikipedia[.]org/wiki/'
     AND (
          p_url ~* '\((given[_ ]name|surname|name)\)$'
       OR p_url ~* '/List_of_'
       OR p_url ~* '\((rugby|football|footballer|basketball|baseball|cricket|tennis|boxer|ice_hockey|athlete|politician|musician|guitarist|singer|drummer|bassist|composer|writer|author|painter|director|producer|journalist|academic|judge|bishop|general|admiral|tight_end|quarterback|linebacker|pitcher|golfer|wrestler|cyclist|swimmer|rower|chess)[,_)]'
     );
$function$;

COMMENT ON FUNCTION public.wikipedia_url_cannot_identify_person(text) IS
  'True when a Wikipedia URL names an article that cannot be about any '
  'specific performer — a given-name/surname page, a List_of_ page, or a '
  'parenthetical occupation identifying a different public figure. Used to '
  'close adult-profile link proposals whose only identity evidence is such a '
  'page. Deliberately under-reaching: it proves junk, it does not prove genuine.';

CREATE OR REPLACE FUNCTION public.run_close_undecidable_adult_link_reviews(p_batch integer DEFAULT 500)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_automation_id uuid; v_run_id bigint; v_enabled boolean;
  v_started timestamptz := now();
  v_closed int := 0; v_flagged int := 0;
BEGIN
  SELECT id, enabled INTO v_automation_id, v_enabled
    FROM public.admin_automations WHERE slug='close_undecidable_adult_link_reviews';
  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  VALUES (v_automation_id,'close_undecidable_adult_link_reviews',v_started,'success',0,0)
  RETURNING id INTO v_run_id;

  IF v_enabled IS DISTINCT FROM true THEN
    UPDATE public.admin_automation_runs SET finished_at=now(),
      summary=jsonb_build_object('skipped',true,'reason','paused') WHERE id=v_run_id;
    UPDATE public.admin_automations SET last_run_at=v_started, last_run_status='paused'
     WHERE id=v_automation_id;
    RETURN jsonb_build_object('skipped',true,'reason','paused');
  END IF;

  -- One row per queue item, carrying the offending URL so the note and the
  -- flag both cite the actual evidence. DISTINCT ON because a personality can
  -- hold several source rows.
  CREATE TEMP TABLE _undecidable ON COMMIT DROP AS
  SELECT DISTINCT ON (q.id) q.id, q.entity_id, s.source_url
    FROM public.entity_review_queue q
    JOIN public.personality_sources s
      ON s.personality_id = q.entity_id AND s.source_slug = 'wikipedia'
   WHERE q.status = 'open'
     AND q.entity_type = 'personality'
     AND q.model LIKE 'adult-profile-probe:%'
     AND public.wikipedia_url_cannot_identify_person(s.source_url)
   ORDER BY q.id, s.source_url
   LIMIT greatest(1, least(p_batch, 2000));

  UPDATE public.entity_review_queue q
     SET status        = 'rejected',
         reviewer_id   = NULL,
         reviewed_at   = now(),
         reviewer_note = 'auto-undecidable: the only encyclopedic source for this person is '
                         || u.source_url
                         || ' — an article about a name or about a different public figure, so'
                         || ' there is no evidence on this row that the profile belongs to them.'
                         || ' Rejecting publishes nothing; the wrong-entity link is flagged'
                         || ' separately on the personality.'
    FROM _undecidable u
   WHERE q.id = u.id AND q.status = 'open';
  GET DIAGNOSTICS v_closed = ROW_COUNT;

  -- The wrong-entity link is its own defect and gets its own worklist.
  WITH per_person AS (
    SELECT entity_id, min(source_url) AS source_url FROM _undecidable GROUP BY entity_id
  )
  UPDATE public.personalities p
     SET needs_attention = true,
         enrichment_status = coalesce(p.enrichment_status,'{}'::jsonb)
           || jsonb_build_object('wrong_entity_candidate', jsonb_build_object(
                'source_url', pp.source_url,
                'reason', 'wikipedia source is a name/list/other-person article',
                'found_by', 'close_undecidable_adult_link_reviews',
                'at', now()))
    FROM per_person pp
   WHERE p.id = pp.entity_id;
  GET DIAGNOSTICS v_flagged = ROW_COUNT;

  UPDATE public.admin_automation_runs
     SET finished_at=now(), items_examined=v_closed, items_changed=v_closed,
         summary=jsonb_build_object('closed', v_closed, 'personalities_flagged', v_flagged)
   WHERE id=v_run_id;
  UPDATE public.admin_automations
     SET last_run_at=v_started, last_run_status='success' WHERE id=v_automation_id;

  RETURN jsonb_build_object('closed', v_closed, 'personalities_flagged', v_flagged);
EXCEPTION WHEN OTHERS THEN
  UPDATE public.admin_automation_runs
     SET finished_at=now(), status='error', error=SQLERRM WHERE id=v_run_id;
  RAISE;
END; $function$;

REVOKE ALL ON FUNCTION public.run_close_undecidable_adult_link_reviews(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_close_undecidable_adult_link_reviews(integer) TO service_role;

INSERT INTO public.admin_automations
  (slug, name, description, managed_by, enabled, "trigger", conditions, action, schedule, auto_pause_threshold)
VALUES (
  'close_undecidable_adult_link_reviews',
  'Review queue: close undecidable adult-link proposals',
  'Rejects adult-profile link proposals whose only encyclopedic source is a Wikipedia given-name '
  'page, a List_of_ page, or an article about a different public figure — rows where nothing on '
  'the row could let a reviewer decide. Never approves a link. Flags the personality for the '
  'wrong-entity repair.',
  'system', true,
  '{"type":"schedule"}'::jsonb, '{}'::jsonb,
  jsonb_build_object('type','rpc','fn','run_close_undecidable_adult_link_reviews',
                     'command','SELECT public.run_close_undecidable_adult_link_reviews();',
                     'jobname','close_undecidable_adult_link_reviews'),
  '45 6 * * *', 3)
ON CONFLICT (slug) DO UPDATE
  SET name=EXCLUDED.name, description=EXCLUDED.description,
      action=EXCLUDED.action, schedule=EXCLUDED.schedule;

SELECT cron.unschedule('close_undecidable_adult_link_reviews')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='close_undecidable_adult_link_reviews');

SELECT cron.schedule('close_undecidable_adult_link_reviews', '45 6 * * *',
                     'SELECT public.run_close_undecidable_adult_link_reviews();');

-- ── Postcondition ───────────────────────────────────────────────────────────
DO $verify$
DECLARE v_match int; v_spared int; v_state int; v_cron int;
BEGIN
  SELECT count(*) INTO v_cron FROM cron.job WHERE jobname='close_undecidable_adult_link_reviews';
  IF v_cron <> 1 THEN RAISE EXCEPTION 'cron not scheduled (found %)', v_cron; END IF;

  -- Positive control: the predicate must match something, or it is decorative.
  SELECT count(DISTINCT q.id) INTO v_match
    FROM public.entity_review_queue q
    JOIN public.personality_sources s
      ON s.personality_id=q.entity_id AND s.source_slug='wikipedia'
   WHERE q.status='open' AND q.entity_type='personality'
     AND q.model LIKE 'adult-profile-probe:%'
     AND public.wikipedia_url_cannot_identify_person(s.source_url);
  IF v_match = 0 THEN
    RAISE EXCEPTION 'predicate matches nothing — re-measure before shipping';
  END IF;

  -- NEGATIVE control, and it is the load-bearing one. A predicate that closed
  -- the whole cohort would pass the test above while destroying the genuine
  -- proposals (Johnny Rapid, Adam Ramzi, Tim Kruger all have real articles).
  SELECT count(DISTINCT q.id) INTO v_spared
    FROM public.entity_review_queue q
    JOIN public.personality_sources s
      ON s.personality_id=q.entity_id AND s.source_slug='wikipedia'
   WHERE q.status='open' AND q.entity_type='personality'
     AND q.model LIKE 'adult-profile-probe:%'
     AND s.source_url LIKE '%wikipedia.org/wiki/%'
     AND NOT public.wikipedia_url_cannot_identify_person(s.source_url);
  IF v_spared = 0 THEN
    RAISE EXCEPTION 'predicate spares nothing — it is over-reaching, not proving';
  END IF;

  -- The no-treadmill premise, asserted rather than assumed: every row this
  -- would close must already be parked at a state the producer's selector
  -- excludes, or closing it re-opens it on the next nightly run.
  SELECT count(*) INTO v_state
    FROM public.entity_review_queue q
    JOIN public.personalities p ON p.id=q.entity_id
    JOIN public.personality_sources s
      ON s.personality_id=q.entity_id AND s.source_slug='wikipedia'
   WHERE q.status='open' AND q.entity_type='personality'
     AND q.model LIKE 'adult-profile-probe:%'
     AND public.wikipedia_url_cannot_identify_person(s.source_url)
     AND coalesce(
           p.enrichment_status->'adult_links'->split_part(q.field,'.',2)->>'state','')
         <> 'review_queued';
  IF v_state > 0 THEN
    RAISE EXCEPTION
      '% rows are not parked at review_queued — closing them would re-open on the next producer run',
      v_state;
  END IF;

  RAISE NOTICE 'undecidable adult links: % to close, % genuine proposals spared', v_match, v_spared;
END
$verify$;
