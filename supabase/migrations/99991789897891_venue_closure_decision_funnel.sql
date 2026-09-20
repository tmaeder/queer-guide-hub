-- ============================================================================
-- run_venue_closure_decision reports WHY its candidate pool is empty
--
-- The job returns {dry_run, close_eligible, closed, reopened} and nothing else,
-- so `close_eligible: 0` has two completely different meanings that print
-- identically: "every closable venue has been closed" and "the selector cannot
-- see anything". It runs nightly, books last_run_status='success', and has
-- queued nothing since 2026-08-21. That is the `would_merge: 0` shape this
-- repo has now recorded on the dedup engines, the news verdict drain and the
-- city qid-gap sweep: an engine with an empty work list is indistinguishable
-- from a healthy one, and the run summary is the only place that can tell you
-- which it is.
--
-- ── Measured on prod, which is what the funnel exists to make routine ──────
--   84  venues are closure_status='open' AND url_status='broken'
--   19  of those are also stale (no source sighting in 90 days)
--    0  survive the `not is_featured` veto
--
-- So the engine is BLOCKED, not finished, and the blocking signal is a single
-- boolean nobody would think to check. The funnel makes that one line of
-- output instead of four hand-written queries.
--
-- ── What this migration deliberately does NOT do ───────────────────────────
-- 671 of the 673 live `is_featured` venues came from ONE `foursquare` import
-- on 2025-07-23 (the other two are a `display-magazin` row and one row with no
-- source). `is_featured` also carries a +20 search boost
-- (20260502030300_mig1_phase_c_drop_featured_with_view_recreate) and populates
-- a featured rail (`useVenuesV2Data`), so a flag set by one import is steering
-- three separate surfaces.
--
-- It is tempting to read that as an import artifact and clear it, and the
-- closure engine would unblock immediately. **That was checked and refused.**
-- The rows are not junk: sampled at random they are real queer venues with
-- real tags (`gay-bar`, `queer-friendly`) in real cities — Tokyo, Roma,
-- Sydney, Los Angeles, Brooklyn. A curated queer-venue import that was
-- deliberately promoted and a bulk flag set by accident are the same shape in
-- the data, and nothing on the row records which it was. Clearing 671 rows
-- would silently change what the site promotes and what search ranks, on an
-- intent this migration cannot establish. So the veto stays, the flag stays,
-- and the funnel REPORTS the blockage instead — a number somebody can act on,
-- rather than a decision taken on their behalf.
--
-- `held_featured` staying pinned at 19 is therefore the expected reading
-- today, not a regression. It is the open product question, made visible.
--
-- ── One predicate, not two ────────────────────────────────────────────────
-- The pool and the candidate set are derived from the SAME temp table, with
-- the per-row veto reasons as columns. The original already made this point
-- for the count and the write ("used for the count and for the write so the
-- two cannot drift"); the funnel joins that discipline rather than adding a
-- fifth copy of the predicate that can rot independently.
--
-- Counts are NOT mutually exclusive and the key names say so: a venue can be
-- both featured and engaged. They are veto tallies, not a partition, and
-- summing them is meaningless — `pool` and `close_eligible` are the two
-- numbers that bracket the funnel.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.run_venue_closure_decision(p_dry_run boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_close_eligible int := 0;
  v_closed int := 0;
  v_reopened int := 0;
  v_pool int := 0;
  v_fresh int := 0;
  v_featured int := 0;
  v_engaged int := 0;
  v_review int := 0;
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
  --
  -- _vcd_pool is the SAME predicate one rung wider: every venue the job could
  -- ever consider, with each veto as its own column. _vcd_cand is then derived
  -- from it, so the funnel and the write can never disagree about what a
  -- candidate is.
  drop table if exists _vcd_pool;
  drop table if exists _vcd_cand;

  create temp table _vcd_pool on commit drop as
  with last_src as (
    select vs.venue_id, max(vs.last_seen_at) max_seen from public.venue_sources vs group by vs.venue_id
  )
  select v.id vid,
         coalesce(ls.max_seen, v.created_at) last_seen,
         coalesce(ls.max_seen, v.created_at) >= now() - interval '90 days' as veto_fresh,
         coalesce(v.is_featured, false)                                    as veto_featured,
         (exists (select 1 from public.venue_reviews r  where r.venue_id = v.id)
          or exists (select 1 from public.venue_checkins c where c.venue_id = v.id))
                                                                           as veto_engaged,
         exists (
           select 1 from public.entity_review_queue q
            where q.entity_type = 'venue' and q.entity_id = v.id and q.field = 'closure_status'
              and (q.status = 'open'
                   or q.reviewed_at >= coalesce(v.url_checked_at, now())))  as veto_review
  from public.venues v
  left join last_src ls on ls.venue_id = v.id
  where v.duplicate_of_id is null
    and v.closure_status = 'open'
    and v.url_status = 'broken';

  create temp table _vcd_cand on commit drop as
  select p.vid, p.last_seen from _vcd_pool p
   where not p.veto_fresh and not p.veto_featured and not p.veto_engaged and not p.veto_review;

  select count(*),
         count(*) filter (where veto_fresh),
         count(*) filter (where veto_featured),
         count(*) filter (where veto_engaged),
         count(*) filter (where veto_review)
    into v_pool, v_fresh, v_featured, v_engaged, v_review
    from _vcd_pool;

  select count(*) into v_close_eligible from _vcd_cand;

  if p_dry_run then
    return jsonb_build_object('dry_run', true, 'close_eligible', v_close_eligible,
                              'closed', 0, 'reopened', 0,
                              'pool', v_pool,
                              'held_not_yet_stale', v_fresh,
                              'held_featured', v_featured,
                              'held_engagement', v_engaged,
                              'held_open_review', v_review);
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
                            'closed', v_closed, 'reopened', v_reopened,
                            'pool', v_pool,
                            'held_not_yet_stale', v_fresh,
                            'held_featured', v_featured,
                            'held_engagement', v_engaged,
                            'held_open_review', v_review);
end;
$function$;

DO $verify$
DECLARE
  r jsonb;
BEGIN
  -- Postcondition: the dry run reports the funnel, and the funnel BRACKETS the
  -- candidate count. Asserted as a relationship rather than against today's
  -- numbers, which move nightly — a migration that pins 84/19/19 is red the
  -- first time a venue's URL recovers.
  r := public.run_venue_closure_decision(true);

  IF NOT (r ? 'pool' AND r ? 'held_featured' AND r ? 'held_engagement'
          AND r ? 'held_open_review' AND r ? 'held_not_yet_stale') THEN
    RAISE EXCEPTION 'funnel keys missing from the dry-run summary: %', r::text;
  END IF;

  IF (r->>'close_eligible')::int > (r->>'pool')::int THEN
    RAISE EXCEPTION 'close_eligible (%) exceeds pool (%) — the two predicates have drifted',
      r->>'close_eligible', r->>'pool';
  END IF;

  -- A veto tally can never exceed the pool it is counted from. This is what
  -- catches a future edit that counts the vetoes over a different set than the
  -- one _vcd_cand is derived from, which is the exact drift the shared temp
  -- table exists to prevent.
  IF (r->>'held_featured')::int > (r->>'pool')::int
     OR (r->>'held_engagement')::int > (r->>'pool')::int
     OR (r->>'held_open_review')::int > (r->>'pool')::int
     OR (r->>'held_not_yet_stale')::int > (r->>'pool')::int THEN
    RAISE EXCEPTION 'a veto tally exceeds the pool — funnel counted over the wrong set: %', r::text;
  END IF;

  RAISE NOTICE 'venue closure funnel live: %', r::text;
END
$verify$;
