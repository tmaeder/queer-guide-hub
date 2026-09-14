-- ============================================================================
-- The review queue was 44% work that was already done
--
-- /admin/inbox and /admin/quality read ingestion_staging.review_status to
-- decide what needs a human. Measured on prod, 575 of the 1,319 rows sitting
-- at 'pending_review' had already been dispositioned by the pipeline and only
-- the status column never caught up:
--
--   class A  428  target_record_id IS NOT NULL  -> committed and PUBLISHED
--                 news 283/283, marketplace 96/96, venues 49/49 all resolve to
--                 a live row, and every one still said disposition='pending'
--   class B  147  disposition='rejected'        -> the pipeline already refused
--   class C  744  genuinely open
--
-- News was 88% phantom (283 of 322). So a reviewer opening the inbox met a
-- queue whose largest single block was articles already on the site. That is
-- not a backlog, it is a stale column, and it is why the queue "looks stuck"
-- while the pipeline is working fine.
--
-- This is bookkeeping, NOT a disposition decision: every row it touches has
-- already been decided by the pipeline and the outcome is recorded elsewhere
-- on the same row. It publishes nothing and rejects nothing.
--
-- ── Why class A becomes 'auto' and not 'approved' ──────────────────────────
-- `trg_staging_human_approval_clears_validation` fires BEFORE UPDATE OF
-- review_status WHEN new.review_status='approved' and the validation status is
-- pending/needs_review, and it stamps ai_validation_result.human_override with
-- a from/by/at record. Writing 'approved' here would therefore forge a human
-- override on rows no human ever looked at — the audit trail would say a
-- person approved 428 rows in one second. 'auto' fires no trigger and is the
-- honest state: the pipeline committed them with no human in the loop. It is
-- also the dominant real combination in the table (committed+auto, 50,578
-- rows), so nothing downstream meets a shape it has not seen.
--
-- ── Why the target record is re-checked rather than trusted ────────────────
-- target_record_id is a plain uuid with no FK (the same "silently leaves
-- dangling uuids" property the cities delete audit records), so a merge or a
-- delete can leave it pointing at nothing. A row whose target has since gone
-- is NOT evidence of a successful commit, so it is left alone for a human
-- rather than marked committed on the strength of a dead pointer.
--
-- Machine writes stay legible the way every other closer in this schema does
-- it: reviewed_by IS NULL plus an 'auto-reconcile:' prefix on the note.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.run_staging_reconcile_committed(p_batch integer DEFAULT 2000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
DECLARE
  v_committed int := 0;
  v_rejected  int := 0;
BEGIN
  -- At */5 a slow pass can still be running when the next one fires. TRY, never
  -- block: a skipped tick is free (the work is idempotent and the next tick is
  -- 5 minutes away), whereas a queued pg_cron worker turns one slow run into a
  -- pile-up — the failure that deadlocked the projector and the reaper.
  IF NOT pg_try_advisory_xact_lock(hashtext('staging_reconcile_committed')) THEN
    RETURN jsonb_build_object('skipped', 'another run holds the lock');
  END IF;

  -- Class A: the pipeline committed it and the target row still exists.
  WITH cand AS (
    SELECT s.id
      FROM public.ingestion_staging s
     WHERE s.review_status = 'pending_review'
       AND s.target_record_id IS NOT NULL
       -- Re-resolve the pointer per target table. A dangling uuid is not proof.
       AND (
            (s.target_table = 'news_articles'        AND EXISTS (SELECT 1 FROM public.news_articles        x WHERE x.id = s.target_record_id))
         OR (s.target_table = 'venues'               AND EXISTS (SELECT 1 FROM public.venues               x WHERE x.id = s.target_record_id))
         OR (s.target_table = 'marketplace_listings' AND EXISTS (SELECT 1 FROM public.marketplace_listings x WHERE x.id = s.target_record_id))
         OR (s.target_table = 'events'               AND EXISTS (SELECT 1 FROM public.events               x WHERE x.id = s.target_record_id))
         OR (s.target_table = 'personalities'        AND EXISTS (SELECT 1 FROM public.personalities        x WHERE x.id = s.target_record_id))
         OR (s.target_table = 'cities'               AND EXISTS (SELECT 1 FROM public.cities               x WHERE x.id = s.target_record_id))
         OR (s.target_table = 'countries'            AND EXISTS (SELECT 1 FROM public.countries            x WHERE x.id = s.target_record_id))
       )
     ORDER BY s.created_at
     LIMIT p_batch
  )
  UPDATE public.ingestion_staging s
     SET review_status = 'auto',
         disposition   = 'committed',
         reviewed_by   = NULL,
         reviewed_at   = now(),
         review_notes  = left(
           'auto-reconcile: already committed to ' || s.target_table ||
           ' (' || s.target_record_id::text || '); review_status was stale'
           || CASE WHEN s.review_notes IS NULL OR length(trim(s.review_notes)) = 0
                   THEN '' ELSE ' | ' || s.review_notes END, 2000)
    FROM cand
   WHERE s.id = cand.id;
  GET DIAGNOSTICS v_committed = ROW_COUNT;

  -- Class B: the pipeline already rejected it; only the status lagged.
  WITH cand AS (
    SELECT s.id
      FROM public.ingestion_staging s
     WHERE s.review_status = 'pending_review'
       AND s.target_record_id IS NULL
       AND s.disposition = 'rejected'
     ORDER BY s.created_at
     LIMIT p_batch
  )
  UPDATE public.ingestion_staging s
     SET review_status = 'rejected',
         reviewed_by   = NULL,
         reviewed_at   = now(),
         review_notes  = left(
           'auto-reconcile: pipeline already rejected this row; review_status was stale'
           || CASE WHEN s.review_notes IS NULL OR length(trim(s.review_notes)) = 0
                   THEN '' ELSE ' | ' || s.review_notes END, 2000)
    FROM cand
   WHERE s.id = cand.id;
  GET DIAGNOSTICS v_rejected = ROW_COUNT;

  RETURN jsonb_build_object(
    'reconciled_committed', v_committed,
    'reconciled_rejected',  v_rejected,
    'still_pending', (SELECT count(*) FROM public.ingestion_staging WHERE review_status = 'pending_review')
  );
END
$fn$;

REVOKE ALL ON FUNCTION public.run_staging_reconcile_committed(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_staging_reconcile_committed(integer) TO service_role;

-- Registry first, then cron — the order this repo requires so a later
-- reconciler pass cannot resurrect or orphan the job. Shape copied from the
-- live pure-SQL rpc rows (city_airport_link): managed_by/trigger/conditions are
-- NOT NULL, there is no `category` column, and action.command holds the plain
-- readable SQL that admin_automation_effective_command() derives the cron form
-- from. Family C (pure synchronous SQL) takes NO admin_automation_run_begin
-- wrapper — the projector records its successes from cron.job_run_details.
INSERT INTO public.admin_automations
  (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule, auto_pause_threshold)
VALUES (
  'staging_reconcile_committed',
  'Staging: reconcile already-dispositioned review rows',
  'Clears ingestion_staging rows stuck at pending_review whose pipeline outcome (committed or rejected) is already recorded on the row. Bookkeeping only: publishes nothing, rejects nothing. Runs every 5 minutes; the full 575-row backlog clears in 1.7s.',
  'system',
  true,
  '{"type":"schedule"}'::jsonb,
  '[]'::jsonb,
  jsonb_build_object(
    'fn','run_staging_reconcile_committed',
    'type','rpc',
    'command','SELECT public.run_staging_reconcile_committed(2000);',
    'jobname','staging_reconcile_committed'),
  '*/5 * * * *',
  3
)
ON CONFLICT (slug) DO UPDATE
  SET action = EXCLUDED.action,
      schedule = EXCLUDED.schedule,
      enabled = true,
      description = EXCLUDED.description;

SELECT cron.schedule(
  'staging_reconcile_committed',
  '*/5 * * * *',
  'SELECT public.run_staging_reconcile_committed(2000);'
);

-- ── Postcondition ───────────────────────────────────────────────────────────
-- Asserted against comment-stripped source, per 50200101100000: this file's own
-- header quotes the phrases below, and pg_get_functiondef returns body comments.
DO $verify$
DECLARE
  v_raw text := pg_get_functiondef('public.run_staging_reconcile_committed(integer)'::regprocedure);
  v_src text := regexp_replace(v_raw, '--[^' || chr(10) || ']*', '', 'g');
  v_a   int;
  v_b   int;
  v_c   int;
BEGIN
  -- The two things that make this bookkeeping rather than a decision.
  IF position('''auto''' IN v_src) = 0 THEN
    RAISE EXCEPTION 'class A must land on auto, not approved: approved forges a human_override stamp';
  END IF;
  IF position('target_record_id IS NOT NULL' IN v_src) = 0 THEN
    RAISE EXCEPTION 'class A must require a committed pointer';
  END IF;
  IF position('EXISTS' IN v_src) = 0 THEN
    RAISE EXCEPTION 'the target record must be re-resolved; a dangling uuid is not proof of a commit';
  END IF;

  SELECT count(*) FILTER (WHERE target_record_id IS NOT NULL),
         count(*) FILTER (WHERE target_record_id IS NULL AND disposition = 'rejected'),
         count(*) FILTER (WHERE target_record_id IS NULL AND disposition = 'pending')
    INTO v_a, v_b, v_c
    FROM public.ingestion_staging
   WHERE review_status = 'pending_review';

  -- Positive controls in BOTH directions: there must be phantom rows to clear
  -- (else this job is decorative) AND genuinely-open rows left afterwards (else
  -- it over-reached and emptied a queue that had real work in it).
  IF v_a + v_b = 0 THEN
    RAISE EXCEPTION 'no phantom rows found — re-measure before shipping, this would be a no-op';
  END IF;
  IF v_c = 0 THEN
    RAISE EXCEPTION 'no genuinely-open rows left — the predicate is too wide';
  END IF;

  RAISE NOTICE 'staging reconcile: % committed + % rejected phantom rows clearable, % genuinely open remain',
    v_a, v_b, v_c;
END
$verify$;
