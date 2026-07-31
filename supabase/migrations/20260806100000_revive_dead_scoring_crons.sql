-- Revive four nightly scoring crons that had NEVER succeeded, and remove the
-- write-amplification that made them impossible to finish.
--
-- Findings (measured on prod 2026-07-31):
--   * content_completeness_recompute, marketplace_quality_recompute,
--     event_trust_recompute and detect-stale-venues were 8/8 failed in the
--     retained cron window, every one on `statement timeout` (2 min).
--   * Three of the four had ZERO rows in admin_automation_runs, so the admin
--     surface showed nothing at all -- while every healthy automation had 10
--     rows in 10 days. The handlers DID record the failure, then re-`RAISE`d,
--     which aborts the transaction and rolls the evidence back. Dropping the
--     RAISE turned out NOT to be enough on its own (see section 7): under
--     statement_timeout the handler's own writes are cancelled too, so a timeout
--     cannot be recorded from inside the transaction at all.
--   * The cost is search sync, and it is irreducible here. EXPLAIN ANALYZE of a
--     300-row batch:
--       Trigger trg_search_documents_marketplace: time=16618ms calls=300
--     i.e. ~55 ms/row, 99.5% of runtime, against a base UPDATE of 57 ms total.
--     A single row written into search_documents costs ~34 ms on its own; the
--     table carries three GIN indexes (search_tsv, title trigram, facets->tags)
--     plus a GIST geography index. Batch sizes below are derived from this
--     measured rate, NOT guessed.
--
--     Tested and rejected: rewriting search_documents_sync() to upsert-in-place
--     instead of DELETE + re-INSERT (all 14 indexers already end in
--     `on conflict (entity_type, entity_id) do update`, so the DELETE looked
--     redundant). Measured on prod: 16999 ms vs 16618 ms for the same 300 rows
--     -- no improvement, because the cost is the index maintenance on the write
--     itself, not the extra tuple. Reverted. Making entity writes cheaper means
--     attacking the GIN index maintenance, which is its own project.
--
--   * events had a DIFFERENT root cause, found only by testing: the scoring
--     query counts sources per event, and `event_sources` (37,348 rows) had NO
--     index on event_id -- only (source_slug, source_entity_id) and source_slug.
--     So each scored event seq-scanned the whole table. Even a 300-row batch
--     timed out; with the index a 900-row batch completes comfortably.
--     event_favorites had the same gap (its only usable index is
--     (user_id, event_id), which cannot seek by event_id).
--
-- Fixes:
--   1. Index event_sources(event_id) and event_favorites(event_id).
--   2. All four jobs batch their writes so they converge instead of dying.
--   3. Handlers record the failure and RETURN instead of re-raising.
--   4. detect_stale_venues staleness threshold 60d -> 180d (see below).
--   5. run_cron_failure_sweep(), because (3) is NOT sufficient -- see below.
--
-- Verified on prod during authoring: after (1), run_event_trust_recompute(900)
-- returns {"rescored":900,"pending":35766}; before it, 300 timed out.

-- ---------------------------------------------------------------------------
-- 0. Missing indexes behind the events timeout
-- ---------------------------------------------------------------------------
create index if not exists idx_event_sources_event_id
  on public.event_sources using btree (event_id);
create index if not exists idx_event_favorites_event_id
  on public.event_favorites using btree (event_id);

-- ---------------------------------------------------------------------------
-- 1. run_marketplace_quality_recompute -- batched, records runs
-- ---------------------------------------------------------------------------
-- Was: a single unbounded UPDATE over ~49k active listings that also evaluated
-- marketplace_completeness_score TWICE per row (once in SET, once in WHERE).
-- Now: score once in a CTE, cap the WRITE set at p_batch. The full scan is
-- cheap (score is IMMUTABLE over columns already in the row); the writes are
-- what cost 55 ms each.
drop function if exists public.run_marketplace_quality_recompute();

create function public.run_marketplace_quality_recompute(p_batch integer default 900)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_automation_id uuid;
  v_run_id        bigint;
  v_enabled       boolean;
  v_started_at    timestamptz := now();
  v_changed       int := 0;
  v_pending       int := 0;
begin
  select id, enabled into v_automation_id, v_enabled
    from public.admin_automations where slug = 'marketplace_quality_recompute';

  insert into public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  values (v_automation_id, 'marketplace_quality_recompute', v_started_at, 'success', 0, 0)
  returning id into v_run_id;

  if v_enabled is distinct from true then
    update public.admin_automation_runs
       set finished_at = now(), summary = jsonb_build_object('skipped', true, 'reason', 'paused')
     where id = v_run_id;
    update public.admin_automations
       set last_run_at = v_started_at, last_run_status = 'paused' where id = v_automation_id;
    return jsonb_build_object('skipped', true, 'reason', 'paused');
  end if;

  with scored as (
    select m.id,
           public.marketplace_completeness_score(
             m.description, m.images, m.price, m.price_usd, m.brand,
             m.link_health, m.in_stock, m.lgbti_relevance_score, m.last_seen_at) as new_score,
           m.quality_score as old_score
      from public.marketplace_listings m
     where m.status = 'active'
  ),
  pick as (
    select id, new_score from scored
     where old_score is distinct from new_score
     limit greatest(p_batch, 0)
  )
  update public.marketplace_listings m
     set quality_score = p.new_score
    from pick p
   where m.id = p.id;
  get diagnostics v_changed = row_count;

  -- how much work is left after this batch, so the admin surface shows progress
  select count(*) into v_pending
    from public.marketplace_listings m
   where m.status = 'active'
     and m.quality_score is distinct from public.marketplace_completeness_score(
           m.description, m.images, m.price, m.price_usd, m.brand,
           m.link_health, m.in_stock, m.lgbti_relevance_score, m.last_seen_at);

  update public.admin_automation_runs
     set finished_at = now(), items_examined = v_changed + v_pending, items_changed = v_changed,
         summary = jsonb_build_object('rescored', v_changed, 'pending', v_pending, 'batch', p_batch)
   where id = v_run_id;
  update public.admin_automations
     set last_run_at = v_started_at, last_run_status = 'success' where id = v_automation_id;

  return jsonb_build_object('rescored', v_changed, 'pending', v_pending);
exception when others then
  -- Record and RETURN. Re-raising here would abort the transaction and roll
  -- this row back, which is exactly why these failures were invisible.
  update public.admin_automation_runs
     set finished_at = now(), status = 'error', error = sqlerrm where id = v_run_id;
  update public.admin_automations
     set last_run_at = v_started_at, last_run_status = 'error' where id = v_automation_id;
  return jsonb_build_object('error', sqlerrm);
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. run_content_completeness_recompute -- batched, records runs
-- ---------------------------------------------------------------------------
-- hotels carries no search_documents trigger, so its ~325 rows stay unbatched.
-- marketplace_listings does, so its half takes the batch cap.
drop function if exists public.run_content_completeness_recompute(boolean);

create function public.run_content_completeness_recompute(
  p_force boolean default false,
  p_batch integer default 900
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_automation_id uuid;
  v_run_id        bigint;
  v_enabled       boolean;
  v_started_at    timestamptz := now();
  v_hotels        int := 0;
  v_products      int := 0;
  v_pending       int := 0;
begin
  select id, enabled into v_automation_id, v_enabled
    from public.admin_automations where slug = 'content_completeness_recompute';

  insert into public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  values (v_automation_id, 'content_completeness_recompute', v_started_at, 'success', 0, 0)
  returning id into v_run_id;

  if (v_enabled is distinct from true) and not p_force then
    update public.admin_automation_runs
       set finished_at = now(), summary = jsonb_build_object('skipped', true, 'reason', 'paused')
     where id = v_run_id;
    update public.admin_automations
       set last_run_at = v_started_at, last_run_status = 'paused' where id = v_automation_id;
    return jsonb_build_object('skipped', true, 'reason', 'paused');
  end if;

  -- hotels (sums to 100): name 20 | description 20 | website 15 | email 10 |
  --   phone 10 | address 10 | booking_url 5 | city_id 5 | amenities 5
  with scored as (
    select h.id,
      ( (nullif(trim(h.name), '')        is not null)::int * 20
      + (nullif(trim(h.description), '') is not null)::int * 20
      + (nullif(trim(h.website), '')     is not null)::int * 15
      + (nullif(trim(h.email), '')       is not null)::int * 10
      + (nullif(trim(h.phone), '')       is not null)::int * 10
      + (nullif(trim(h.address), '')     is not null)::int * 10
      + (nullif(trim(h.booking_url), '') is not null)::int * 5
      + (h.city_id is not null)::int * 5
      + (coalesce(cardinality(h.amenities), 0) > 0)::int * 5
      )::smallint as new_completeness
    from public.hotels h
  )
  update public.hotels h
     set completeness_score = s.new_completeness
    from scored s
   where h.id = s.id
     and h.completeness_score is distinct from s.new_completeness;
  get diagnostics v_hotels = row_count;

  -- marketplace_listings (sums to 100): title 20 | description 20 | url 15 |
  --   images 15 | brand 10 | category 10 | price 10
  with scored as (
    select l.id,
      ( (nullif(trim(l.title), '')       is not null)::int * 20
      + (nullif(trim(l.description), '') is not null)::int * 20
      + (coalesce(nullif(trim(l.external_url), ''), nullif(trim(l.website), '')) is not null)::int * 15
      + (coalesce(cardinality(l.images), 0) > 0)::int * 15
      + (nullif(trim(l.brand), '')       is not null)::int * 10
      + (nullif(trim(l.category), '')    is not null)::int * 10
      + (l.price_usd is not null)::int * 10
      )::smallint as new_completeness,
      l.completeness_score as old_completeness
    from public.marketplace_listings l
  ),
  pick as (
    select id, new_completeness from scored
     where old_completeness is distinct from new_completeness
     limit greatest(p_batch, 0)
  )
  update public.marketplace_listings l
     set completeness_score = p.new_completeness
    from pick p
   where l.id = p.id;
  get diagnostics v_products = row_count;

  select count(*) into v_pending
    from public.marketplace_listings l
   where l.completeness_score is distinct from
      ( (nullif(trim(l.title), '')       is not null)::int * 20
      + (nullif(trim(l.description), '') is not null)::int * 20
      + (coalesce(nullif(trim(l.external_url), ''), nullif(trim(l.website), '')) is not null)::int * 15
      + (coalesce(cardinality(l.images), 0) > 0)::int * 15
      + (nullif(trim(l.brand), '')       is not null)::int * 10
      + (nullif(trim(l.category), '')    is not null)::int * 10
      + (l.price_usd is not null)::int * 10
      )::smallint;

  update public.admin_automation_runs
     set finished_at = now(), items_examined = v_hotels + v_products + v_pending,
         items_changed = v_hotels + v_products,
         summary = jsonb_build_object('hotels_updated', v_hotels,
                                      'products_updated', v_products,
                                      'products_pending', v_pending)
   where id = v_run_id;
  update public.admin_automations
     set last_run_at = v_started_at, last_run_status = 'success' where id = v_automation_id;

  return jsonb_build_object('hotels_updated', v_hotels, 'products_updated', v_products,
                            'products_pending', v_pending);
exception when others then
  update public.admin_automation_runs
     set finished_at = now(), status = 'error', error = sqlerrm where id = v_run_id;
  update public.admin_automations
     set last_run_at = v_started_at, last_run_status = 'error' where id = v_automation_id;
  return jsonb_build_object('error', sqlerrm);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. run_event_trust_recompute -- batched, records runs
-- ---------------------------------------------------------------------------
-- Scope is bounded by last_verified_at NULLS FIRST and every row in the batch is
-- stamped, changed or not. Stamping only changed rows (the old behaviour) could
-- never converge: the scope predicate includes `last_verified_at IS NULL`, so an
-- unchanged never-verified event stayed in scope forever. 36,374 events have
-- never been verified; at the cron batch size this drains in a handful of nights
-- and then only the small recent-activity window remains.
drop function if exists public.run_event_trust_recompute();

create function public.run_event_trust_recompute(p_batch integer default 900)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_automation_id uuid;
  v_run_id        bigint;
  v_enabled       boolean;
  v_started_at    timestamptz := now();
  v_changed       int := 0;
  v_pending       int := 0;
begin
  select id, enabled into v_automation_id, v_enabled
    from public.admin_automations where slug = 'event_trust_recompute';

  insert into public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  values (v_automation_id, 'event_trust_recompute', v_started_at, 'success', 0, 0)
  returning id into v_run_id;

  if v_enabled is distinct from true then
    update public.admin_automation_runs
       set finished_at = now(), summary = jsonb_build_object('skipped', true, 'reason', 'paused')
     where id = v_run_id;
    update public.admin_automations
       set last_run_at = v_started_at, last_run_status = 'paused' where id = v_automation_id;
    return jsonb_build_object('skipped', true, 'reason', 'paused');
  end if;

  with scope as (
    select id, quality_score, lgbti_relevance_score, liveness_status, needs_attention,
           start_date, updated_at, last_verified_at
      from public.events
     where duplicate_of_id is null
       and (start_date > now() - interval '7 days'
            or last_verified_at is null
            or updated_at > now() - interval '2 days')
     order by last_verified_at asc nulls first
     limit greatest(p_batch, 0)
  ),
  corr as (
    select distinct on (event_id) event_id, value
      from public.event_quality_signals where signal_type = 'corroboration'
     order by event_id, created_at desc
  ),
  adminfb as (
    select distinct on (event_id) event_id, value
      from public.event_quality_signals where signal_type = 'admin_feedback'
     order by event_id, created_at desc
  ),
  srccnt as (
    select s.id as event_id,
           (select count(*) from public.event_sources es where es.event_id = s.id) as n
      from scope s
  ),
  eng as (
    select s.id as event_id,
      (select count(*) from public.event_attendees a
        where a.event_id = s.id and a.status in ('going','interested')) as rsvps,
      (select count(*) from public.event_favorites f where f.event_id = s.id) as favs
      from scope s
  ),
  scored as (
    select s.id,
      least(1.0, greatest(0.0, coalesce(s.quality_score,0)/100.0)) as completeness,
      exp(-greatest(0, extract(epoch from now()-coalesce(s.last_verified_at,s.updated_at))/86400.0)/30.0) as freshness,
      coalesce(s.lgbti_relevance_score, 0.5)::numeric as relevance,
      (coalesce(sc.n,0) >= 2 or s.liveness_status in ('live','sold_out')) as corr_present,
      coalesce(c.value, case when s.liveness_status in ('live','sold_out') then 0.8 else 0.6 end) as corroboration,
      (coalesce(e.rsvps,0) + coalesce(e.favs,0) > 0) as eng_present,
      least(1.0, (coalesce(e.rsvps,0)*2 + coalesce(e.favs,0))/20.0) as engagement,
      (a.value is not null) as adm_present,
      coalesce(a.value, 0.5) as admin_feedback,
      s.liveness_status, s.needs_attention
    from scope s
    left join corr c    on c.event_id = s.id
    left join adminfb a on a.event_id = s.id
    left join srccnt sc on sc.event_id = s.id
    left join eng e     on e.event_id = s.id
  ),
  composed as (
    select id, liveness_status, needs_attention,
      ( 0.25*completeness + 0.15*freshness + 0.15*relevance
        + case when corr_present then 0.20*corroboration  else 0 end
        + case when eng_present  then 0.15*engagement     else 0 end
        + case when adm_present  then 0.10*admin_feedback else 0 end
      ) as num,
      ( 0.55
        + case when corr_present then 0.20 else 0 end
        + case when eng_present  then 0.15 else 0 end
        + case when adm_present  then 0.10 else 0 end
      ) as den
    from scored
  ),
  final as (
    select id,
      case when liveness_status in ('dead_link','cancelled') then 10
        else round(100 * greatest(0.0, least(1.0,
              (num/den) - case when needs_attention then 0.15 else 0 end)))
      end::smallint as new_trust
    from composed
  )
  update public.events ev
     set trust_score = f.new_trust, last_verified_at = now()
    from final f
   where ev.id = f.id;
  get diagnostics v_changed = row_count;

  select count(*) into v_pending
    from public.events
   where duplicate_of_id is null
     and (start_date > now() - interval '7 days'
          or last_verified_at is null
          or updated_at > now() - interval '2 days');

  update public.admin_automation_runs
     set finished_at = now(), items_examined = v_pending, items_changed = v_changed,
         summary = jsonb_build_object('rescored', v_changed, 'pending', v_pending, 'batch', p_batch)
   where id = v_run_id;
  update public.admin_automations
     set last_run_at = v_started_at, last_run_status = 'success' where id = v_automation_id;

  return jsonb_build_object('rescored', v_changed, 'pending', v_pending);
exception when others then
  update public.admin_automation_runs
     set finished_at = now(), status = 'error', error = sqlerrm where id = v_run_id;
  update public.admin_automations
     set last_run_at = v_started_at, last_run_status = 'error' where id = v_automation_id;
  return jsonb_build_object('error', sqlerrm);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. run_detect_stale_venues -- new recording wrapper around detect_stale_venues
-- ---------------------------------------------------------------------------
-- The cron called the bare detect_stale_venues() helper, which touches
-- admin_automations not at all -- so the registered `detect_stale_venues`
-- automation row was decorative and its failures were unobservable.
--
-- The threshold moves 60d -> 180d. At 60 days the job would have flagged 20,094
-- of 23,532 venues (94%) as needs_attention, because most venues simply never
-- get re-crawled and `max(venue_sources.last_seen_at)` is old for almost all of
-- them -- the flag would have stopped meaning anything. Measured cliff:
--   60d -> 20,094 | 90d -> 19,796 | 180d -> 1,158 | 365d -> 1,149 | 545d -> 0
-- 180 days is the first threshold that isolates a genuinely reviewable tail.
create or replace function public.run_detect_stale_venues(
  p_stale_after_days integer default 180,
  p_batch integer default 900
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_automation_id uuid;
  v_run_id        bigint;
  v_enabled       boolean;
  v_started_at    timestamptz := now();
  v_flagged       int := 0;
  v_pending       int := 0;
begin
  select id, enabled into v_automation_id, v_enabled
    from public.admin_automations where slug = 'detect_stale_venues';

  insert into public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  values (v_automation_id, 'detect_stale_venues', v_started_at, 'success', 0, 0)
  returning id into v_run_id;

  if v_enabled is distinct from true then
    update public.admin_automation_runs
       set finished_at = now(), summary = jsonb_build_object('skipped', true, 'reason', 'paused')
     where id = v_run_id;
    update public.admin_automations
       set last_run_at = v_started_at, last_run_status = 'paused' where id = v_automation_id;
    return jsonb_build_object('skipped', true, 'reason', 'paused');
  end if;

  with stale as (
    select v.id
      from public.venues v
     where v.closed_at is null
       and v.duplicate_of_id is null
       and v.needs_attention is distinct from true
       and coalesce((select max(vs.last_seen_at) from public.venue_sources vs
                      where vs.venue_id = v.id), v.created_at)
           < now() - (p_stale_after_days || ' days')::interval
     limit greatest(p_batch, 0)
  )
  update public.venues v
     set needs_attention = true
    from stale s
   where v.id = s.id;
  get diagnostics v_flagged = row_count;

  select count(*) into v_pending
    from public.venues v
   where v.closed_at is null
     and v.duplicate_of_id is null
     and v.needs_attention is distinct from true
     and coalesce((select max(vs.last_seen_at) from public.venue_sources vs
                    where vs.venue_id = v.id), v.created_at)
         < now() - (p_stale_after_days || ' days')::interval;

  update public.admin_automation_runs
     set finished_at = now(), items_examined = v_flagged + v_pending, items_changed = v_flagged,
         summary = jsonb_build_object('flagged', v_flagged, 'pending', v_pending,
                                      'stale_after_days', p_stale_after_days)
   where id = v_run_id;
  update public.admin_automations
     set last_run_at = v_started_at, last_run_status = 'success' where id = v_automation_id;

  return jsonb_build_object('flagged', v_flagged, 'pending', v_pending);
exception when others then
  update public.admin_automation_runs
     set finished_at = now(), status = 'error', error = sqlerrm where id = v_run_id;
  update public.admin_automations
     set last_run_at = v_started_at, last_run_status = 'error' where id = v_automation_id;
  return jsonb_build_object('error', sqlerrm);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Grants -- service_role + postgres only, matching the rest of the family.
--    (run_content_completeness_recompute previously had anon/authenticated
--    EXECUTE on a SECURITY DEFINER function that rewrites two whole tables.)
-- ---------------------------------------------------------------------------
revoke all on function public.run_marketplace_quality_recompute(integer) from public, anon, authenticated;
revoke all on function public.run_content_completeness_recompute(boolean, integer) from public, anon, authenticated;
revoke all on function public.run_event_trust_recompute(integer) from public, anon, authenticated;
revoke all on function public.run_detect_stale_venues(integer, integer) from public, anon, authenticated;

grant execute on function public.run_marketplace_quality_recompute(integer) to service_role;
grant execute on function public.run_content_completeness_recompute(boolean, integer) to service_role;
grant execute on function public.run_event_trust_recompute(integer) to service_role;
grant execute on function public.run_detect_stale_venues(integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 6. Repoint the crons.
-- ---------------------------------------------------------------------------
-- statement_timeout is armed when the top-level statement starts, so `SET LOCAL`
-- INSIDE these functions would not affect their own call. It has to be a
-- separate statement in the cron command, ahead of the SELECT.
--
-- Batch size is ALSO a lock-duration budget, not just a timeout budget. Each of
-- these is a single UPDATE in a single transaction, so it holds row locks for its
-- whole run. A 7,000-row marketplace batch runs ~7 minutes and WILL block
-- marketplace_commit_drain (migration 20260806110000) on a row lock in
-- marketplace_listings if the two overlap -- observed on prod when a manual drain
-- was issued mid-run.
--
-- The two marketplace jobs keep the 900s/7000 sizing: the real cost is ~10s fixed
-- + ~60 ms/row, so 540s was only 1.25x headroom, and a smaller batch would not
-- converge the cold-start backlog. The constraint that matters is SEPARATION --
-- they must stay away from the drain's :35 slot. Do not move them onto :35
-- without shrinking the batch first.
--
-- All three with cold-start backlogs run hourly so they converge within a day.
-- detect-stale-venues stays nightly: its scope is small once caught up, and it
-- writes venues, which nothing else here contends for.
select cron.schedule('marketplace_quality_recompute', '18 * * * *',
  $cmd$SET statement_timeout = '900s'; SELECT public.run_marketplace_quality_recompute(7000);$cmd$
);

select cron.schedule('content_completeness_recompute', '50 * * * *',
  $cmd$SET statement_timeout = '900s'; SELECT public.run_content_completeness_recompute(false, 7000);$cmd$
);

select cron.schedule('event_trust_recompute', '10 * * * *',
  $cmd$SET statement_timeout = '240s'; SELECT public.run_event_trust_recompute(1500);$cmd$
);

select cron.schedule('detect-stale-venues', '30 4 * * *',
  $cmd$SET statement_timeout = '240s'; SELECT public.run_detect_stale_venues(180, 1500);$cmd$
);


-- ---------------------------------------------------------------------------
-- 7. run_cron_failure_sweep -- the only reliable way to see a timeout
-- ---------------------------------------------------------------------------
-- Returning from the EXCEPTION handler instead of re-raising (fix 3) is
-- necessary but NOT sufficient, and this was verified the hard way: a
-- run_event_trust_recompute(900) call that hit statement_timeout during
-- authoring still left ZERO rows behind. Once statement_timeout fires, the
-- cancel is re-delivered to the handler's own UPDATEs, so nothing inside that
-- transaction can ever be persisted. A timeout is structurally invisible from
-- the inside.
--
-- So visibility has to come from outside the failed transaction. This sweep
-- reads cron.job_run_details -- which pg_cron writes in its OWN transaction and
-- which therefore survives -- and mirrors failures into admin_automation_runs
-- where the admin surface already looks. Idempotent via the runid recorded in
-- summary, so re-running never double-counts.
create or replace function public.run_cron_failure_sweep(p_window interval default interval '25 hours')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted int := 0;
begin
  insert into public.admin_automation_runs
    (automation_id, automation_slug, started_at, finished_at, status,
     items_examined, items_changed, error, summary)
  select a.id,
         coalesce(a.slug, replace(j.jobname, '-', '_')),
         d.start_time, d.end_time, 'error', 0, 0,
         left(coalesce(d.return_message, 'cron job failed'), 2000),
         jsonb_build_object('source', 'cron', 'jobname', j.jobname, 'runid', d.runid)
    from cron.job_run_details d
    join cron.job j on j.jobid = d.jobid
    left join public.admin_automations a on a.slug = replace(j.jobname, '-', '_')
   where d.status = 'failed'
     and d.start_time > now() - p_window
     and not exists (
       select 1 from public.admin_automation_runs r
        where r.summary ->> 'source' = 'cron'
          and r.summary ->> 'runid' = d.runid::text);
  get diagnostics v_inserted = row_count;

  update public.admin_automations a
     set last_run_status = 'error'
    from cron.job_run_details d
    join cron.job j on j.jobid = d.jobid
   where a.slug = replace(j.jobname, '-', '_')
     and d.status = 'failed'
     and d.start_time > now() - p_window
     and a.last_run_status is distinct from 'error'
     and (a.last_run_at is null or a.last_run_at <= d.start_time);

  return jsonb_build_object('recorded', v_inserted);
end;
$$;

revoke all on function public.run_cron_failure_sweep(interval) from public, anon, authenticated;
grant execute on function public.run_cron_failure_sweep(interval) to service_role;

select cron.schedule('cron_failure_sweep', '20 * * * *',
  $cmd$SELECT public.run_cron_failure_sweep();$cmd$);
