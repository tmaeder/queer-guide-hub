-- Unified dedup follow-up — nightly auto-merge sweeps (2026-06-24)
--
-- Auto-merge-with-guards for the high-confidence, low-risk bands only. Each sweep
-- mirrors run_venue_fuzzy_automerge: dry-run default, hard p_limit cap, per-pair
-- exception isolation, chain-collapse at the end. All merges go through the
-- reversible _<type>_merge_core (entity_merge_audit), so any false merge is undoable.
--
--   * run_event_dedup_sweep — same venue + start within 48h + title trigram ≥0.92
--     (the venue_date strong signal: a re-listed occurrence of the same event).
--   * run_marketplace_dedup_sweep (UPGRADED) — same (title_normalized, merchant_domain);
--     was a bare status='inactive' bulk UPDATE, now routed through the merge core so
--     it sets duplicate_of_id + reparents children + is reversible. Cron unchanged.
--
-- Personalities are deliberately NOT swept: namesakes make automated person-merges
-- unsafe. They get the merge infra + admin UI only (review-only).
--
-- Disk-churn discipline (CLAUDE.md): sweeps are capped and cron-staggered so the
-- duplicate_of_id writes that fire search_documents triggers don't storm the DB.

-- ---------------------------------------------------------------------------
-- 1. run_event_dedup_sweep
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_event_dedup_sweep(p_dry_run boolean DEFAULT true, p_limit int DEFAULT 500)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions','pg_temp'
AS $function$
declare r record; v_keep uuid; v_drop uuid; v_merged int:=0; v_skipped int:=0; v_eligible int:=0; v_chains int:=0;
begin
  perform public.assert_admin_or_internal();
  for r in
    with live as (
      select id, venue_id, title_normalized nt, start_date, quality_score, is_featured, created_at
      from public.events
      where duplicate_of_id is null and coalesce(status,'') <> 'archived'
        and venue_id is not null and start_date is not null
        and title_normalized is not null and length(title_normalized) >= 3
    )
    select a.id aid, b.id bid,
           a.quality_score aq, a.is_featured af, a.created_at ac,
           b.quality_score bq, b.is_featured bf, b.created_at bc
    from live a join live b
      on a.venue_id = b.venue_id and a.id < b.id
     and abs(extract(epoch from (a.start_date - b.start_date))) < 48*3600
    where extensions.similarity(a.nt, b.nt) >= 0.92
    limit greatest(p_limit, 0)
  loop
    v_eligible := v_eligible + 1;
    if (coalesce(r.aq,-1) >  coalesce(r.bq,-1))
       or (coalesce(r.aq,-1) = coalesce(r.bq,-1) and coalesce(r.af,false) and not coalesce(r.bf,false))
       or (coalesce(r.aq,-1) = coalesce(r.bq,-1) and coalesce(r.af,false) = coalesce(r.bf,false) and r.ac <= r.bc)
    then v_keep := r.aid; v_drop := r.bid; else v_keep := r.bid; v_drop := r.aid; end if;
    if p_dry_run then v_merged := v_merged + 1; continue; end if;
    begin
      perform public._event_merge_core(v_keep, v_drop, null);
      v_merged := v_merged + 1;
    exception when others then v_skipped := v_skipped + 1;
    end;
  end loop;
  if not p_dry_run then v_chains := public.collapse_entity_dup_chains('event'); end if;
  return jsonb_build_object('dry_run', p_dry_run, 'eligible_pairs', v_eligible, 'merged', v_merged, 'skipped', v_skipped, 'chains_collapsed', v_chains);
end; $function$;

-- ---------------------------------------------------------------------------
-- 2. run_marketplace_dedup_sweep — upgraded to reversible merge cores.
--    Keeps RETURNS integer + the existing 0 6 * * * cron call site.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_marketplace_dedup_sweep()
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions','pg_temp'
AS $function$
declare r record; v_n int := 0;
begin
  for r in
    with ranked as (
      select id,
        first_value(id) over (partition by title_normalized, merchant_domain
          order by (affiliate_url is not null) desc, (link_health in ('ok','redirect')) desc,
                   quality_score desc nulls last, views_count desc nulls last, created_at desc) keep_id,
        row_number() over (partition by title_normalized, merchant_domain
          order by (affiliate_url is not null) desc, (link_health in ('ok','redirect')) desc,
                   quality_score desc nulls last, views_count desc nulls last, created_at desc) rn
      from public.marketplace_listings
      where status = 'active' and duplicate_of_id is null
        and title_normalized is not null and title_normalized <> '' and merchant_domain is not null
    )
    select id, keep_id from ranked where rn > 1 limit 2000
  loop
    begin
      perform public._marketplace_merge_core(r.keep_id, r.id, null);
      v_n := v_n + 1;
    exception when others then null;
    end;
  end loop;
  perform public.collapse_entity_dup_chains('marketplace');
  return v_n;
end; $function$;

GRANT EXECUTE ON FUNCTION public.run_event_dedup_sweep(boolean, int) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Cron — events sweep daily at 06:15 (after marketplace's 06:00). Idempotent.
-- ---------------------------------------------------------------------------
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'event_dedup_sweep') THEN
    PERFORM cron.unschedule('event_dedup_sweep');
  END IF;
  PERFORM cron.schedule('event_dedup_sweep', '15 6 * * *', 'SELECT public.run_event_dedup_sweep(false, 500);');
END $cron$;
