-- Retract 177 unconfirmed closures, and stop both writers re-asserting them
--
-- The companion migration added the vocabulary. This one applies it, and takes back the
-- claim the old column was making.
--
-- What the 177 actually are
-- -------------------------
-- Every one was written by run_venue_closure_decision under a single reason,
-- `multi_signal_broken_url_and_stale`: the website 404s AND no source has reported the
-- venue for 90 days. Both halves are statements about OUR pipeline, not about the
-- business. A bar whose domain lapsed, whose listing aggregator dropped it, or who
-- simply never had a website beyond Instagram produces exactly this signature while
-- serving drinks. The row then rendered as "closed" with no way for a reader -- or for
-- us -- to see that nobody had checked.
--
-- They move to `unknown`, not to `open`. Retracting a claim is not the same as asserting
-- its opposite: we do not know these places are trading either, and `unknown` is the
-- status that says so. The venues become publicly visible again, which is the accepted
-- cost of the retraction, and each one gets a review-queue row so the state is worked
-- off rather than merely forgotten.
--
-- Why clearing the column alone would have lasted nine hours
-- ---------------------------------------------------------
-- run_venue_closure_decision selects on `closed_at IS NULL`. Clearing the 177 makes
-- every one of them a candidate again -- their url_status is still 'broken' and their
-- last sighting is still old -- so the 04:45 cron would re-close the lot the same night.
-- Any retraction that does not also change the writer is undone before anyone sees it.
--
-- Both writers are taught the vocabulary, because `venues.closed_at` has TWO of them
-- scheduled at the same minute (45 4 * * *): run_venue_closure_decision, and
-- run_existence_decision('venue') -> _existence_apply_archive. The existence engine has
-- archived nothing so far (25 flags, 0 archives, and both its signal feeders --
-- existence_deep_probe, existence_external_osm -- are currently auto_paused), so it did
-- not cause this; but leaving it writing a bare closed_at would reintroduce exactly the
-- ambiguity being removed.
--
-- After this, the strongest thing an automated check can say about a venue is
-- `presumed_closed`. `permanently_closed` is reachable only through a person.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Make closure_status an approvable review field
-- ---------------------------------------------------------------------------
-- Without this row the queue entries below would render in the venue review UI (the
-- venue_review_queue view filters by entity_type and not by field) and then fail on
-- approve with 'unsupported review field' -- a queue you can read and cannot action.
-- text_required rather than a bespoke mode: the FK to location_closure_statuses already
-- rejects anything outside the vocabulary, so the registry does not need to re-state it.
-- batchable=false deliberately -- "this place has shut" is a claim about the world and
-- should not be approvable fifty at a time.
INSERT INTO public.review_field_registry
  (entity_type, field, label, target_table, target_column, value_key,
   apply_mode, apply_args, batchable, risk_gate, active)
VALUES
  ('venue', 'closure_status', 'Closure status', 'venues', 'closure_status', 'value',
   'text_required', '{}'::jsonb, false, NULL, true)
ON CONFLICT (entity_type, field) DO UPDATE
  SET label = EXCLUDED.label, target_table = EXCLUDED.target_table,
      target_column = EXCLUDED.target_column, value_key = EXCLUDED.value_key,
      apply_mode = EXCLUDED.apply_mode, apply_args = EXCLUDED.apply_args,
      batchable = EXCLUDED.batchable, active = EXCLUDED.active;

-- ---------------------------------------------------------------------------
-- 2. The sweeper concludes presumed_closed, and never overrules a person
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_venue_closure_decision(p_dry_run boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
declare
  v_close_eligible int := 0;
  v_closed int := 0;
  v_reopened int := 0;
begin
  perform public.assert_admin_or_internal();

  -- Candidate definition, used for the count and for the write so the two cannot drift.
  --
  -- Two guards beyond the original evidence:
  --
  --   closure_status = 'open'  -- only ever touch a row nobody has judged. This alone
  --     protects the retracted rows below, which sit at 'unknown', and every human
  --     verdict, which sits at a status this job is not allowed to write.
  --
  --   no blocking review     -- an OPEN review means a person is deciding right now.
  --     A DECIDED review blocks too, but only until we have re-checked the URL since
  --     they ruled: without that clause a reviewer who marks a venue open would watch
  --     it re-close the same night on the same stale evidence, forever. Requiring
  --     url_checked_at > reviewed_at means the job may only speak again once it has
  --     something new to say.
  -- DROP first: ON COMMIT DROP fires at COMMIT, not at statement end, so a second call
  -- inside one transaction -- which the verification block at the end of this migration
  -- does -- would otherwise fail with 'relation _vcd_cand already exists'. Same shape
  -- as run_existence_decision's _agg.
  drop table if exists _vcd_cand;
  create temp table _vcd_cand on commit drop as
  with last_src as (
    select vs.venue_id, max(vs.last_seen_at) max_seen from public.venue_sources vs group by vs.venue_id
  )
  select v.id vid, coalesce(ls.max_seen, v.created_at) last_seen
  from public.venues v
  left join last_src ls on ls.venue_id = v.id
  where v.duplicate_of_id is null
    and v.closure_status = 'open'
    and v.url_status = 'broken'
    and coalesce(ls.max_seen, v.created_at) < now() - interval '90 days'
    and not coalesce(v.is_featured, false)
    and not exists (select 1 from public.venue_reviews r where r.venue_id = v.id)
    and not exists (select 1 from public.venue_checkins c where c.venue_id = v.id)
    and not exists (
      select 1 from public.entity_review_queue q
       where q.entity_type = 'venue' and q.entity_id = v.id and q.field = 'closure_status'
         and (q.status = 'open'
              or q.reviewed_at >= coalesce(v.url_checked_at, now())));

  select count(*) into v_close_eligible from _vcd_cand;

  if p_dry_run then
    return jsonb_build_object('dry_run', true, 'close_eligible', v_close_eligible,
                              'closed', 0, 'reopened', 0);
  end if;

  -- 1. REOPEN first, so a re-listed venue is not immediately re-closed below.
  --    Restricted to presumed_closed: a venue a person marked permanently_closed or
  --    demolished must not be reopened because a parked domain started answering 200.
  update public.venues v
     set closure_status = 'open', updated_at = now()
  from (
    select v2.id,
           (select a.id from public.venue_closed_audit a
              where a.venue_id = v2.id and a.reverted_at is null
              order by a.created_at desc limit 1) aid
    from public.venues v2 where v2.closure_status = 'presumed_closed'
  ) pick
  join public.venue_closed_audit a on a.id = pick.aid
   and a.reason = 'multi_signal_broken_url_and_stale'
  left join (select venue_id, max(last_seen_at) max_seen from public.venue_sources group by 1) ls
    on ls.venue_id = pick.id
  where v.id = pick.id
    and (v.url_status in ('ok', 'redirect') or coalesce(ls.max_seen, to_timestamp(0)) > v.closed_at);
  get diagnostics v_reopened = row_count;

  update public.venue_closed_audit a set reverted_at = now()
  from public.venues v
  where a.venue_id = v.id and a.reverted_at is null
    and a.reason = 'multi_signal_broken_url_and_stale' and v.closure_status = 'open';

  -- 2. AUTO-CLOSE. Writes the STATUS; venues_zz_closure_sync derives closed_at and
  --    seo_indexable from it. closed_on is deliberately left NULL -- the job does not
  --    know the day the place shut, only that it stopped answering, and the audit's
  --    last_seen_at is the bound location_closure_timeline reports instead.
  with upd as (
    update public.venues v
       set closure_status = 'presumed_closed', needs_attention = true, updated_at = now()
    from _vcd_cand c where v.id = c.vid
    returning v.id
  )
  insert into public.venue_closed_audit (venue_id, closed_at, reason, detail)
  select c.vid, now(), 'multi_signal_broken_url_and_stale',
         jsonb_build_object(
           'signals', jsonb_build_array('url_status=broken', 'no_source_sighting>90d'),
           'last_seen_at', c.last_seen,
           'detected_by', 'run_venue_closure_decision',
           'concluded', 'presumed_closed')
  from _vcd_cand c;
  get diagnostics v_closed = row_count;

  return jsonb_build_object('dry_run', false, 'close_eligible', v_close_eligible,
                            'closed', v_closed, 'reopened', v_reopened);
end;
$$;

COMMENT ON FUNCTION public.run_venue_closure_decision(boolean) IS
  'Nightly closure sweep. Concludes presumed_closed -- never permanently_closed: a dead '
  'URL plus a stale sighting is evidence about our pipeline, not about the business. '
  'Only ever touches rows at closure_status=open with no blocking review, so it cannot '
  'overrule a person or re-assert a retracted closure.';

-- ---------------------------------------------------------------------------
-- 3. The existence engine writes the same vocabulary
-- ---------------------------------------------------------------------------
-- Defaults restated from the live definitions: CREATE OR REPLACE errors with 42P13
-- ("cannot remove parameter defaults") if an existing default is dropped.
CREATE OR REPLACE FUNCTION public._existence_apply_archive(
  p_entity_type text, p_entity_id uuid, p_reason text,
  p_signals jsonb DEFAULT '{}'::jsonb, p_actor uuid DEFAULT NULL::uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_prev jsonb; v_aid bigint;
BEGIN
  IF p_entity_type = 'venue' THEN
    -- prev_state now snapshots closure_status too, so a reopen restores the status the
    -- venue actually had rather than assuming 'open'.
    SELECT jsonb_build_object('closed_at', closed_at, 'closure_status', closure_status,
                              'seo_indexable', seo_indexable)
      INTO v_prev FROM public.venues WHERE id=p_entity_id;
    UPDATE public.venues SET closure_status='presumed_closed', needs_attention=true, updated_at=now()
      WHERE id=p_entity_id AND closure_status='open';
  ELSIF p_entity_type = 'event' THEN
    SELECT jsonb_build_object('status', status, 'liveness_status', liveness_status, 'seo_indexable', seo_indexable)
      INTO v_prev FROM public.events WHERE id=p_entity_id;
    UPDATE public.events SET status='cancelled', liveness_status='dead_link',
      seo_indexable=false, needs_attention=true, updated_at=now()
      WHERE id=p_entity_id AND status <> 'cancelled';
  ELSIF p_entity_type = 'marketplace' THEN
    SELECT jsonb_build_object('status', status, 'deprecated_at', deprecated_at)
      INTO v_prev FROM public.marketplace_listings WHERE id=p_entity_id;
    UPDATE public.marketplace_listings SET status='inactive', updated_at=now()
      WHERE id=p_entity_id AND status IN ('active','sold_out');
  ELSE
    RAISE EXCEPTION 'invalid entity_type %', p_entity_type;
  END IF;
  INSERT INTO public.entity_existence_audit (entity_type, entity_id, action, reason, signals, prev_state, created_by)
  VALUES (p_entity_type, p_entity_id, 'archive', p_reason, p_signals, v_prev, p_actor)
  RETURNING id INTO v_aid;
  RETURN v_aid;
END;
$$;

CREATE OR REPLACE FUNCTION public._existence_apply_reopen(p_entity_type text, p_entity_id uuid, p_actor uuid DEFAULT NULL::uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_aid bigint; v_prev jsonb;
BEGIN
  SELECT id, prev_state INTO v_aid, v_prev
  FROM public.entity_existence_audit
  WHERE entity_type=p_entity_type AND entity_id=p_entity_id AND action='archive' AND reverted_at IS NULL
  ORDER BY created_at DESC LIMIT 1;
  IF v_aid IS NULL THEN RETURN false; END IF;
  IF p_entity_type = 'venue' THEN
    -- Restore the recorded status. Falls back to 'unknown', not 'open': if the snapshot
    -- predates this migration we do not know what the venue was, and saying so is
    -- better than publishing a guess.
    UPDATE public.venues
       SET closure_status=coalesce(v_prev->>'closure_status', 'unknown'),
           needs_attention=true, updated_at=now()
     WHERE id=p_entity_id;
  ELSIF p_entity_type = 'event' THEN
    UPDATE public.events SET
      status=coalesce(v_prev->>'status','active'),
      liveness_status=coalesce(v_prev->>'liveness_status','unknown'),
      seo_indexable=coalesce((v_prev->>'seo_indexable')::boolean, true),
      needs_attention=true, updated_at=now() WHERE id=p_entity_id;
  ELSIF p_entity_type = 'marketplace' THEN
    UPDATE public.marketplace_listings SET
      status=coalesce(v_prev->>'status','active'), deprecated_at=NULL, updated_at=now()
      WHERE id=p_entity_id;
  END IF;
  UPDATE public.entity_existence_audit SET reverted_at=now(), reverted_by=p_actor WHERE id=v_aid;
  INSERT INTO public.entity_existence_signals (entity_type, entity_id, signal_kind, verdict, weight, source, details)
  VALUES (p_entity_type, p_entity_id, 'admin', 'alive', 1.0, 'existence_reopen', jsonb_build_object('actor', p_actor));
  RETURN true;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Retract the 177
-- ---------------------------------------------------------------------------
-- 177 rows is under the 300-row trg_search_documents_venue budget, so this runs as one
-- statement. Setting closure_status is enough: venues_zz_closure_sync clears closed_at.
CREATE TEMP TABLE _retract ON COMMIT DROP AS
  SELECT v.id,
         (SELECT a.detail FROM public.venue_closed_audit a
           WHERE a.venue_id = v.id AND a.reverted_at IS NULL
           ORDER BY a.created_at DESC LIMIT 1) AS evidence,
         v.closed_at
  FROM public.venues v
  -- Selected on the STATUS, not on closed_at: the status is the column that carries
  -- meaning now, and the companion migration has already seeded it from closed_at.
  WHERE v.closure_status = 'presumed_closed';

UPDATE public.venues v
   SET closure_status = 'unknown',
       needs_attention = true,
       updated_at = now()
FROM _retract r WHERE v.id = r.id;

-- The audit rows are marked reverted -- that is what the column is for -- but the
-- evidence stays readable, and location_closure_timeline still reports last_seen_at as
-- the alive_until bound.
UPDATE public.venue_closed_audit a
   SET reverted_at = now()
FROM _retract r
WHERE a.venue_id = r.id AND a.reverted_at IS NULL;

-- One review row each, carrying the evidence that produced the retracted closure so a
-- reviewer can judge without re-deriving it. proposed_value is presumed_closed rather
-- than permanently_closed: approving should restore the machine's actual conclusion,
-- and upgrading it further is a separate, deliberate act.
INSERT INTO public.entity_review_queue
  (entity_type, entity_id, field, proposed_value, citations, confidence, model, status)
SELECT 'venue', r.id, 'closure_status',
       jsonb_build_object('value', 'presumed_closed'),
       jsonb_build_object(
         'retracted_closed_at', r.closed_at,
         'evidence', r.evidence,
         'note', 'Auto-closed on a dead URL plus no sighting for 90 days. That is '
              || 'evidence about our pipeline, not about the business, so the closure '
              || 'was retracted to unknown pending a check.'),
       NULL, 'run_venue_closure_decision', 'open'
FROM _retract r
ON CONFLICT (entity_type, entity_id, field) WHERE status = 'open' DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. Verification
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_left int; v_unknown int; v_queued int; v_unreverted int; v_eligible jsonb;
BEGIN
  SELECT count(*) INTO v_left FROM public.venues WHERE closure_status = 'presumed_closed';
  IF v_left <> 0 THEN RAISE EXCEPTION '% presumed closures survived the retraction', v_left; END IF;

  SELECT count(*) INTO v_unknown FROM public.venues WHERE closure_status = 'unknown';
  SELECT count(*) INTO v_queued FROM public.entity_review_queue
   WHERE entity_type='venue' AND field='closure_status' AND status='open';
  IF v_queued <> v_unknown THEN
    RAISE EXCEPTION 'retracted % rows but queued % reviews', v_unknown, v_queued;
  END IF;

  SELECT count(*) INTO v_unreverted FROM public.venue_closed_audit a
    JOIN public.venues v ON v.id = a.venue_id
   WHERE a.reverted_at IS NULL AND v.closure_status = 'unknown';
  IF v_unreverted <> 0 THEN
    RAISE EXCEPTION '% audit rows still open for a retracted venue', v_unreverted;
  END IF;

  -- The point of the whole migration: the sweeper must now find nothing to do, because
  -- every row it would have re-closed is parked at 'unknown' with an open review.
  v_eligible := public.run_venue_closure_decision(true);
  IF (v_eligible->>'close_eligible')::int <> 0 THEN
    RAISE EXCEPTION 'sweeper would immediately re-close % venues', v_eligible->>'close_eligible';
  END IF;
END $$;

COMMIT;
