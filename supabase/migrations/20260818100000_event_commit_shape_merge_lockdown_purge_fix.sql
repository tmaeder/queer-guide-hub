-- ============================================================================
-- Overhaul follow-ups from live verification — three fixes in one migration
-- ----------------------------------------------------------------------------
-- (1) EVENT COMMIT SHAPE: the real reason adapter-fetched events never
--     committed. commit_event_staging_item reads normalized_data->>'title' /
--     ->>'start_date', but the _shared/source-adapter contract (ticketmaster,
--     eventbrite, gaycities…) emits name / dates.{start,end} / urls[0] — so
--     EVERY adapter event died at commit with event_missing_title. The P3a
--     prefilter exposed it: 214 genuinely-queer Ticketmaster events staged in
--     12h ("Queer Bingo Night", "RuPaul's Drag Race LIVE!", drag brunches),
--     review-gate approved them, commit rejected all. Patch by string surgery
--     on the LIVE body (pattern 20260806140000) so the rest of the function —
--     including the 20260807 geo-resolution work — is untouched. Then
--     re-disposition the last 48h of shape-rejected, review-approved rows so
--     the next ev-drain-commit picks them up (older rejects predate the
--     prefilter and stay rejected).
-- (2) MERGE DISPATCHER LOCKDOWN (pre-existing, found by the fresh-context
--     verifier): merge_entities(text,uuid,uuid) is SECURITY DEFINER with
--     PUBLIC/anon EXECUTE, and its actor guard fails OPEN when auth.uid() is
--     null — an anon PostgREST call could soft-merge two PERSONALITIES,
--     bypassing queue_only, the sweep hard-clamp, and the namesake/outing
--     protection. The 20260806130000 lockdown fixed the _*_merge_core fns but
--     missed this dispatcher. REVOKE anon/PUBLIC; keep authenticated (the
--     in-function admin check gates real users) and service/cron paths
--     (auth.uid() IS NULL there — unchanged fail-open is what lets
--     approve_dedup_review keep working from crons; privilege, not the guard,
--     now excludes anon). Same REVOKE hygiene for run_dedup_review_autoapprove
--     (was anon-EXECUTE via default PUBLIC grant; harmless — its inner
--     approve_dedup_review asserts — but bookkeeping spam was possible).
-- (3) staging_rejected_purge TIMEOUT: first run died in the FK-nullify
--     UPDATE scraper_dedupe_decisions SET staging_id=NULL — staging_id is
--     UNINDEXED (60k rows ⇒ seq scan per deleted staging row ⇒ statement
--     timeout ⇒ full rollback). Index it and lower the per-run bound.
-- ============================================================================

-- (1a) commit shape — surgical patch of the live function body
DO $$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'commit_event_staging_item';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'commit_event_staging_item not found';
  END IF;

  -- Already patched (replay) → nothing to do.
  IF v_def LIKE '%v_norm->>''name''%' THEN
    RAISE NOTICE 'commit_event_staging_item already accepts the adapter shape';
    RETURN;
  END IF;

  v_def := replace(v_def,
    'v_title       := nullif(btrim(v_norm->>''title''), '''');',
    'v_title       := nullif(btrim(coalesce(v_norm->>''title'', v_norm->>''name'')), '''');');
  v_def := replace(v_def,
    'v_start       := nullif(v_norm->>''start_date'','''')::timestamptz;',
    'v_start       := nullif(coalesce(v_norm->>''start_date'', v_norm->''dates''->>''start''),'''')::timestamptz;');
  v_def := replace(v_def,
    'v_end         := nullif(v_norm->>''end_date'','''')::timestamptz;',
    'v_end         := nullif(coalesce(v_norm->>''end_date'', v_norm->''dates''->>''end''),'''')::timestamptz;');
  -- adapter urls is an ARRAY; first element is the event/ticket page
  v_def := replace(v_def,
    'v_ticket_url  := nullif(btrim(v_norm->>''ticket_url''), '''');',
    'v_ticket_url  := nullif(btrim(coalesce(v_norm->>''ticket_url'', v_norm->''urls''->>0)), '''');');

  -- Country: the adapter sends full names ("United States Of America") which
  -- (a) miss the resolver's exact-name arm and (b) violate
  -- events_country_iso2_check when written raw. Add a variant-normalized
  -- resolution arm and always store the ISO2 code (or NULL) — the probe hit
  -- this as the next gate after the title/date shape fix.
  v_def := replace(v_def,
'  IF v_country_id IS NULL AND v_country IS NOT NULL THEN
    SELECT id INTO v_country_id FROM public.countries
    WHERE duplicate_of_id IS NULL
      AND (upper(code) = upper(v_country) OR lower(name) = lower(v_country))
    LIMIT 1;
  END IF;',
'  IF v_country_id IS NULL AND v_country IS NOT NULL THEN
    SELECT id INTO v_country_id FROM public.countries
    WHERE duplicate_of_id IS NULL
      AND (upper(code) = upper(v_country) OR lower(name) = lower(v_country)
           OR lower(name) = lower(regexp_replace(regexp_replace(btrim(v_country), ''^the\s+'', '''', ''i''), ''\s+of\s+america$'', '''', ''i'')))
    LIMIT 1;
  END IF;
  -- events.country carries ISO2 (events_country_iso2_check): store the code
  -- when resolved; drop unresolvable full text rather than violate the CHECK.
  IF v_country_id IS NOT NULL THEN
    SELECT upper(c2.code) INTO v_country FROM public.countries c2 WHERE c2.id = v_country_id;
  ELSIF v_country IS NOT NULL AND v_country !~ ''^[A-Za-z]{2}$'' THEN
    v_country := NULL;
  END IF;');

  -- position(), not LIKE: backslash is LIKE's escape character, so a pattern
  -- containing \s silently matches the wrong thing.
  IF position('v_norm->>''name''' in v_def) = 0
     OR position('''dates''->>''start''' in v_def) = 0
     OR position('''urls''->>0' in v_def) = 0
     OR position('of\s+america' in v_def) = 0 THEN
    RAISE EXCEPTION 'commit_event_staging_item patch did not apply — live body drifted from the expected extraction lines; re-read pg_get_functiondef and update this migration';
  END IF;

  EXECUTE v_def;
END $$;

-- (1b) resurrect the last 48h of shape-rejected, review-approved adapter rows
UPDATE public.ingestion_staging
   SET disposition = 'pending',
       error_message = NULL,
       review_notes = coalesce(review_notes || E'\n', '') ||
         'reset for recommit: rejected only by the event_missing_title shape bug (fixed 20260818100000)'
 WHERE target_table = 'events'
   AND disposition = 'rejected'
   AND review_status = 'approved'
   AND error_message LIKE 'commit_fn: event_missing_title%'
   AND created_at > now() - interval '48 hours';

-- (2) merge dispatcher + autoapprove privilege lockdown
REVOKE ALL ON FUNCTION public.merge_entities(text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_entities(text, uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.run_dedup_review_autoapprove(numeric, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_dedup_review_autoapprove(numeric, integer) TO service_role;

-- (3) purge timeout fix
CREATE INDEX IF NOT EXISTS idx_scraper_dedupe_decisions_staging_id
  ON public.scraper_dedupe_decisions (staging_id)
  WHERE staging_id IS NOT NULL;

-- Lower the per-run ceiling: the FK-nullify makes each deleted row cost more
-- than a bare delete even with the index; 40k/night still clears the ~95k
-- backlog inside a week.
DO $$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'run_staging_rejected_purge';
  v_def := replace(v_def, 'v_total >= 100000', 'v_total >= 40000');
  EXECUTE v_def;
END $$;
