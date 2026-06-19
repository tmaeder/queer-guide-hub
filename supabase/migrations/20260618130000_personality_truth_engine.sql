-- Personality Truth Engine + review/consent surface (data-quality, 2026-06-18).
--
-- Personalities had no self-maintaining quality loop (cities/events/venues do).
-- This adds:
--   * trust_score / completeness_score / last_verified_at / field_provenance cols
--   * personality_quality_signals ledger
--   * personality_coverage_gaps radar output
--   * personality_review_queue + approve/reject RPCs (LLM-proposed identity fields)
--   * run_personality_trust_recompute(limit,force)  — nightly, BATCH-CAPPED.
--       The search-index trigger (trg_search_documents_personality) fires on EVERY
--       row UPDATE and the DB is disk-constrained, so the recompute is capped per
--       run (default 800) and folds completeness+trust into a single UPDATE/row.
--   * run_personality_coverage_radar(force)  — weekly; writes only to the gaps
--       table (no personalities UPDATE → no search-trigger storm).
--   * personalities_due_for_refresh(limit)  — work-list selector.
--   * Phase 2b consent path: personalities_adult_consent_candidates(limit) +
--       publish_personality_with_consent(id,confirm) — adult-cohort rows NEVER
--       auto-publish; an admin publishes case-by-case with explicit consent.
--   * admin_automations rows + pg_cron + admin_automation_run/dry_run wiring.

begin;

-- ============================================================
-- 1. Columns.
-- ============================================================
alter table public.personalities
  add column if not exists trust_score        smallint not null default 0,
  add column if not exists completeness_score smallint not null default 0,
  add column if not exists last_verified_at   timestamptz,
  add column if not exists field_provenance   jsonb not null default '{}'::jsonb;

-- ============================================================
-- 2. Signals ledger.
-- ============================================================
create table if not exists public.personality_quality_signals (
  id             uuid primary key default gen_random_uuid(),
  personality_id uuid not null references public.personalities(id) on delete cascade,
  signal_type    text not null check (signal_type in
    ('completeness','corroboration','content_density','freshness','relevance','admin_feedback','enrichment','verification')),
  value          numeric(5,4) not null default 0,
  weight         numeric(4,3) not null default 1.000,
  source         text,
  details        jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);
create index if not exists idx_personality_quality_signals_pid on public.personality_quality_signals(personality_id);
create index if not exists idx_personality_quality_signals_created on public.personality_quality_signals(created_at);
alter table public.personality_quality_signals enable row level security;

-- ============================================================
-- 3. Coverage gaps (radar output).
-- ============================================================
create table if not exists public.personality_coverage_gaps (
  id                uuid primary key default gen_random_uuid(),
  personality_id    uuid references public.personalities(id) on delete cascade,
  personality_name  text,
  gap_score         smallint not null default 0,
  missing_fields    text[] not null default '{}',
  content_counts    jsonb not null default '{}'::jsonb,
  resolution        text not null default 'enrich' check (resolution in ('enrich','verify','review')),
  status            text not null default 'open' check (status in ('open','queued','resolved','ignored')),
  last_checked_at   timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  constraint personality_coverage_gaps_pid_uk unique (personality_id)
);
create index if not exists idx_personality_coverage_gaps_status on public.personality_coverage_gaps(status, gap_score desc);
alter table public.personality_coverage_gaps enable row level security;

-- ============================================================
-- 4. Review queue (LLM-proposed identity fields → human gate).
-- ============================================================
create table if not exists public.personality_review_queue (
  id             uuid primary key default gen_random_uuid(),
  personality_id uuid not null references public.personalities(id) on delete cascade,
  field          text not null check (field in ('lgbti_connection','lgbti_details','verification_status')),
  proposed_value jsonb not null,
  citations      jsonb not null default '[]'::jsonb,
  confidence     numeric(3,2),
  model          text,
  status         text not null default 'open' check (status in ('open','approved','rejected')),
  reviewer_id    uuid references auth.users(id) on delete set null,
  reviewer_note  text,
  created_at     timestamptz not null default now(),
  reviewed_at    timestamptz
);
create unique index if not exists uq_personality_review_queue_open
  on public.personality_review_queue(personality_id, field) where status='open';
alter table public.personality_review_queue enable row level security;

-- Admins read the quality tables (writes go through SECURITY DEFINER RPCs).
do $$ begin
  if not exists (select 1 from pg_policies where tablename='personality_review_queue' and policyname='admin_read_personality_review_queue') then
    create policy admin_read_personality_review_queue on public.personality_review_queue
      for select to authenticated using (has_any_role_jwt(array['admin'::app_role,'moderator'::app_role]));
  end if;
  if not exists (select 1 from pg_policies where tablename='personality_coverage_gaps' and policyname='admin_read_personality_coverage_gaps') then
    create policy admin_read_personality_coverage_gaps on public.personality_coverage_gaps
      for select to authenticated using (has_any_role_jwt(array['admin'::app_role,'moderator'::app_role]));
  end if;
  if not exists (select 1 from pg_policies where tablename='personality_quality_signals' and policyname='admin_read_personality_quality_signals') then
    create policy admin_read_personality_quality_signals on public.personality_quality_signals
      for select to authenticated using (has_any_role_jwt(array['admin'::app_role,'moderator'::app_role]));
  end if;
end $$;

-- ============================================================
-- 5. Completeness scorer (pure).
-- ============================================================
create or replace function public.compute_personality_completeness(p_id uuid)
returns smallint
language sql stable
security definer set search_path to 'public', 'pg_temp'
as $$
  select greatest(0, least(100, round(
      case when p.lgbti_connection is not null and p.lgbti_connection not in ('','unclear') then 25 else 0 end
    + case when (p.bio is not null and length(trim(p.bio))>120) or (p.description is not null and length(trim(p.description))>120) then 20 else 0 end
    + case when p.image_url is not null then 15 else 0 end
    + case when p.birth_date is not null then 10 else 0 end
    + case when p.profession is not null and p.profession<>'' then 10 else 0 end
    + case when p.nationality is not null and p.nationality<>'' then 8 else 0 end
    + case when p.wikidata_qid is not null and p.wikidata_qid not like 'SKIP_%' then 7 else 0 end
    + case when p.tags is not null and array_length(p.tags,1)>0 then 5 else 0 end
  )))::smallint
  from public.personalities p where p.id = p_id;
$$;

-- ============================================================
-- 6. Trust recompute (nightly, BATCH-CAPPED).
-- ============================================================
create or replace function public.run_personality_trust_recompute(p_limit int default 800, p_force boolean default false)
returns jsonb
language plpgsql
security definer set search_path to 'public', 'pg_temp'
as $$
declare
  v_automation_id uuid;
  v_run_id bigint;
  v_examined int := 0;
  v_changed int := 0;
begin
  select id into v_automation_id from public.admin_automations where slug='personality_trust_recompute';
  insert into public.admin_automation_runs (automation_id, automation_slug, started_at, status)
    values (v_automation_id, 'personality_trust_recompute', now(), 'success') returning id into v_run_id;

  with scope as (
    select p.id
    from public.personalities p
    where p.duplicate_of_id is null
      and coalesce(p.review_status,'') <> 'archived'
      and (p_force
           or p.last_verified_at is null
           or p.updated_at > p.last_verified_at
           or p.last_verified_at < now() - interval '30 days')
    order by p.last_verified_at asc nulls first
    limit greatest(1, least(p_limit, 2000))
  ),
  calc as (
    select p.id,
      -- completeness (0..100)
      (greatest(0, least(100, round(
          case when p.lgbti_connection is not null and p.lgbti_connection not in ('','unclear') then 25 else 0 end
        + case when (p.bio is not null and length(trim(p.bio))>120) or (p.description is not null and length(trim(p.description))>120) then 20 else 0 end
        + case when p.image_url is not null then 15 else 0 end
        + case when p.birth_date is not null then 10 else 0 end
        + case when p.profession is not null and p.profession<>'' then 10 else 0 end
        + case when p.nationality is not null and p.nationality<>'' then 8 else 0 end
        + case when p.wikidata_qid is not null and p.wikidata_qid not like 'SKIP_%' then 7 else 0 end
        + case when p.tags is not null and array_length(p.tags,1)>0 then 5 else 0 end
      ))))::int as comp,
      -- freshness 0..1
      case
        when p.last_refreshed_at is null then 0.3
        when p.last_refreshed_at > now() - interval '90 days' then 1.0
        when p.last_refreshed_at < now() - interval '365 days' then 0.0
        else 1.0 - extract(epoch from (now() - p.last_refreshed_at - interval '90 days')) / extract(epoch from interval '275 days')
      end as freshness,
      case when coalesce(p.review_status,'') in ('manually_verified','approved') then 1.0 else 0.3 end as verification,
      coalesce(p.lgbti_relevance_score, 0)::numeric as relevance,
      coalesce(p.needs_attention,false) as needs_attn
    from public.personalities p join scope s on s.id = p.id
  ),
  scored as (
    select id, comp,
      greatest(0, least(100, round(
        100 * (0.45*(comp/100.0) + 0.25*relevance + 0.15*freshness + 0.10*verification)
        - case when needs_attn then 10 else 0 end
      )))::smallint as trust
    from calc
  ),
  upd as (
    update public.personalities p
       set completeness_score = s.comp,
           trust_score        = s.trust,
           last_verified_at   = now()
    from scored s where p.id = s.id
    returning p.id
  )
  select count(*) into v_changed from upd;

  v_examined := v_changed;

  -- ledger (bounded by the cap)
  insert into public.personality_quality_signals (personality_id, signal_type, value, source)
  select p.id, 'completeness', least(1.0, p.completeness_score/100.0), 'trust_recompute'
  from public.personalities p
  where p.last_verified_at > now() - interval '1 minute';

  update public.admin_automation_runs
     set finished_at=now(), items_examined=v_examined, items_changed=v_changed,
         summary=jsonb_build_object('rescored',v_changed)
   where id=v_run_id;
  update public.admin_automations set last_run_at=now(), last_run_status='success' where id=v_automation_id;

  return jsonb_build_object('rescored', v_changed, 'examined', v_examined);
end;
$$;

-- ============================================================
-- 7. Coverage radar (weekly; gaps table only).
-- ============================================================
create or replace function public.run_personality_coverage_radar(p_force boolean default false)
returns jsonb
language plpgsql
security definer set search_path to 'public', 'pg_temp'
as $$
declare
  v_automation_id uuid;
  v_run_id bigint;
  v_upserted int := 0;
  v_examined int := 0;
begin
  select id into v_automation_id from public.admin_automations where slug='personality_coverage_radar';
  insert into public.admin_automation_runs (automation_id, automation_slug, started_at, status)
    values (v_automation_id, 'personality_coverage_radar', now(), 'success') returning id into v_run_id;

  with cand as (
    select p.id, p.name, p.completeness_score, p.lgbti_relevance_score,
      array_remove(array[
        case when p.bio is null or length(trim(p.bio))<=120 then 'bio' end,
        case when p.image_url is null then 'image' end,
        case when p.birth_date is null then 'birth_date' end,
        case when p.profession is null or p.profession='' then 'profession' end,
        case when p.nationality is null or p.nationality='' then 'nationality' end,
        case when p.wikidata_qid is null or p.wikidata_qid like 'SKIP_%' then 'wikidata' end,
        case when p.tags is null or array_length(p.tags,1) is null then 'tags' end,
        case when p.lgbti_connection is null or p.lgbti_connection in ('','unclear') then 'lgbti_connection' end
      ], null) as missing,
      (100 - p.completeness_score)::smallint as gap_score,
      case
        when coalesce(p.lgbti_relevance_score,0) < 0.3 then 'review'
        when p.wikidata_qid is null or p.wikidata_qid like 'SKIP_%' then 'verify'
        else 'enrich' end as resolution
    from public.personalities p
    where p.duplicate_of_id is null
      and coalesce(p.review_status,'') <> 'archived'
  ),
  ups as (
    insert into public.personality_coverage_gaps
      (personality_id, personality_name, gap_score, missing_fields, resolution, status, last_checked_at)
    select id, name, gap_score, missing, resolution,
      case when cardinality(missing)=0 then 'resolved' else 'open' end, now()
    from cand
    on conflict (personality_id) do update
      set personality_name=excluded.personality_name,
          gap_score=excluded.gap_score,
          missing_fields=excluded.missing_fields,
          resolution=excluded.resolution,
          status=case when cardinality(excluded.missing_fields)=0 then 'resolved'
                      when public.personality_coverage_gaps.status='ignored' then 'ignored'
                      else 'open' end,
          last_checked_at=now()
    returning 1
  )
  select count(*) into v_upserted from ups;
  select count(*) into v_examined from public.personalities where duplicate_of_id is null and coalesce(review_status,'')<>'archived';

  update public.admin_automation_runs
     set finished_at=now(), items_examined=v_examined, items_changed=v_upserted,
         summary=jsonb_build_object('gaps_upserted',v_upserted)
   where id=v_run_id;
  update public.admin_automations set last_run_at=now(), last_run_status='success' where id=v_automation_id;

  return jsonb_build_object('gaps_upserted', v_upserted, 'examined', v_examined);
end;
$$;

-- ============================================================
-- 8. Work-list selector.
-- ============================================================
create or replace function public.personalities_due_for_refresh(p_limit int default 25)
returns table (
  id uuid, name text, slug text, is_living boolean,
  completeness_score smallint, trust_score smallint,
  last_refreshed_at timestamptz, refresh_reason text
)
language sql stable
security definer set search_path to 'public', 'pg_temp'
as $$
  select p.id, p.name, p.slug, p.is_living, p.completeness_score, p.trust_score, p.last_refreshed_at,
    case
      when p.last_refreshed_at is null then 'never_refreshed'
      when p.completeness_score < 40 then 'low_completeness'
      when p.is_living and p.last_refreshed_at < now() - interval '90 days' then 'stale_living'
      else 'stale'
    end as refresh_reason
  from public.personalities p
  where p.duplicate_of_id is null and coalesce(p.review_status,'') <> 'archived'
  order by
    (p.last_refreshed_at is not null),
    p.completeness_score asc,
    p.last_refreshed_at asc nulls first
  limit greatest(1, least(p_limit, 1000));
$$;

-- ============================================================
-- 9. Review queue RPCs (admin-gated).
-- ============================================================
create or replace function public.approve_personality_review(p_id uuid, p_note text default null)
returns jsonb
language plpgsql
security definer set search_path to 'public', 'pg_temp'
as $$
declare r public.personality_review_queue%rowtype;
begin
  if not has_any_role_jwt(array['admin'::app_role]) then raise exception 'unauthorized' using errcode='42501'; end if;
  select * into r from public.personality_review_queue where id=p_id and status='open' for update;
  if not found then raise exception 'review item not found or not open'; end if;

  if r.field = 'lgbti_connection' then
    update public.personalities set lgbti_connection=r.proposed_value->>'value',
      field_provenance=jsonb_set(coalesce(field_provenance,'{}'::jsonb),'{lgbti_connection}',
        jsonb_build_object('source','llm+human','confidence',r.confidence,'approved_at',now()),true),
      updated_at=now() where id=r.personality_id;
  elsif r.field = 'lgbti_details' then
    update public.personalities set lgbti_details=r.proposed_value->>'value',
      field_provenance=jsonb_set(coalesce(field_provenance,'{}'::jsonb),'{lgbti_details}',
        jsonb_build_object('source','llm+human','confidence',r.confidence,'approved_at',now()),true),
      updated_at=now() where id=r.personality_id;
  elsif r.field = 'verification_status' then
    update public.personalities set verification_status=r.proposed_value->>'value', updated_at=now()
      where id=r.personality_id;
  end if;

  update public.personality_review_queue
     set status='approved', reviewer_id=auth.uid(), reviewed_at=now(), reviewer_note=p_note where id=p_id;
  if not exists (select 1 from public.personality_review_queue where personality_id=r.personality_id and status='open') then
    update public.personalities set needs_attention=false where id=r.personality_id;
  end if;
  return jsonb_build_object('approved',true,'field',r.field,'personality_id',r.personality_id);
end;
$$;

create or replace function public.reject_personality_review(p_id uuid, p_note text default null)
returns jsonb
language plpgsql
security definer set search_path to 'public', 'pg_temp'
as $$
declare r public.personality_review_queue%rowtype;
begin
  if not has_any_role_jwt(array['admin'::app_role]) then raise exception 'unauthorized' using errcode='42501'; end if;
  select * into r from public.personality_review_queue where id=p_id and status='open' for update;
  if not found then raise exception 'review item not found or not open'; end if;
  update public.personality_review_queue
     set status='rejected', reviewer_id=auth.uid(), reviewed_at=now(), reviewer_note=p_note where id=p_id;
  if not exists (select 1 from public.personality_review_queue where personality_id=r.personality_id and status='open') then
    update public.personalities set needs_attention=false where id=r.personality_id;
  end if;
  return jsonb_build_object('rejected',true,'field',r.field,'personality_id',r.personality_id);
end;
$$;

-- ============================================================
-- 10. Phase 2b — consent-aware adult-cohort publishing.
-- Adult rows NEVER auto-publish (promotion gate excludes is_adult). An admin
-- publishes case-by-case with explicit consent confirmation.
-- ============================================================
create or replace function public.personalities_adult_consent_candidates(p_limit int default 50)
returns table (
  id uuid, name text, slug text, lgbti_connection text, lgbti_connection_source text,
  lgbti_relevance_score numeric, has_bio boolean, has_image boolean, wikidata_qid text
)
language sql stable
security definer set search_path to 'public', 'pg_temp'
as $$
  select p.id, p.name, p.slug, p.lgbti_connection, p.lgbti_connection_source,
    p.lgbti_relevance_score,
    (p.bio is not null and length(trim(p.bio))>30) as has_bio,
    (p.image_url is not null) as has_image, p.wikidata_qid
  from public.personalities p
  where p.is_adult = true
    and p.visibility = 'draft'
    and p.duplicate_of_id is null
    and coalesce(p.review_status,'') <> 'archived'
    and coalesce(p.lgbti_relevance_score,0) >= 0.7
    and p.image_url is not null
    and (p.bio is not null and length(trim(p.bio))>30)
    and coalesce(p.enrichment_status->'personhood'->>'verdict','') <> 'non_person'
  order by p.lgbti_relevance_score desc, p.view_count desc nulls last, p.name
  limit greatest(1, least(p_limit, 500));
$$;

create or replace function public.publish_personality_with_consent(p_id uuid, p_confirm boolean default false)
returns jsonb
language plpgsql
security definer set search_path to 'public', 'pg_temp'
as $$
declare r public.personalities%rowtype;
begin
  if not has_any_role_jwt(array['admin'::app_role]) then raise exception 'unauthorized' using errcode='42501'; end if;
  if p_confirm is not true then return jsonb_build_object('ok',false,'error','consent_required'); end if;
  select * into r from public.personalities where id=p_id;
  if not found then return jsonb_build_object('ok',false,'error','not_found'); end if;
  if r.duplicate_of_id is not null or coalesce(r.review_status,'')='archived'
     or coalesce(r.enrichment_status->'personhood'->>'verdict','')='non_person' then
    return jsonb_build_object('ok',false,'error','ineligible');
  end if;

  update public.personalities
     set visibility='public', seo_indexable=true, needs_attention=false,
         enrichment_status=jsonb_set(coalesce(enrichment_status,'{}'::jsonb),'{promotion}',
           jsonb_build_object('source','consent-review','flagged_for_review',false,
             'consent_confirmed',true,'consent_by',auth.uid(),'at',now(),
             'prior',jsonb_build_object('prior_visibility',r.visibility,'prior_seo_indexable',r.seo_indexable)),true),
         updated_at=now()
   where id=p_id;
  return jsonb_build_object('ok',true,'published',true,'id',p_id);
end;
$$;

-- ============================================================
-- 11. Grants.
-- ============================================================
revoke all on function public.compute_personality_completeness(uuid) from public;
revoke all on function public.run_personality_trust_recompute(int,boolean) from public;
revoke all on function public.run_personality_coverage_radar(boolean) from public;
revoke all on function public.personalities_due_for_refresh(int) from public;
revoke all on function public.approve_personality_review(uuid,text) from public;
revoke all on function public.reject_personality_review(uuid,text) from public;
revoke all on function public.personalities_adult_consent_candidates(int) from public;
revoke all on function public.publish_personality_with_consent(uuid,boolean) from public;
grant execute on function public.compute_personality_completeness(uuid) to service_role;
grant execute on function public.run_personality_trust_recompute(int,boolean) to service_role;
grant execute on function public.run_personality_coverage_radar(boolean) to service_role;
grant execute on function public.personalities_due_for_refresh(int) to service_role, authenticated;
grant execute on function public.approve_personality_review(uuid,text) to authenticated, service_role;
grant execute on function public.reject_personality_review(uuid,text) to authenticated, service_role;
grant execute on function public.personalities_adult_consent_candidates(int) to authenticated, service_role;
grant execute on function public.publish_personality_with_consent(uuid,boolean) to authenticated, service_role;

-- ============================================================
-- 12. Register automations + cron + dispatch wiring.
-- ============================================================
insert into public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
values
  ('personality_trust_recompute','Recompute personality trust scores',
   'Nightly batch-capped (800/run) composite trust_score + completeness_score per personality. Capped to bound the search-index trigger on this disk-constrained DB.',
   'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
   '{"type":"rpc","fn":"run_personality_trust_recompute"}'::jsonb, '20 3 * * *'),
  ('personality_coverage_radar','Detect personality content gaps',
   'Weekly scan of every personality; records personality_coverage_gaps (missing fields + resolution route). Writes only to the gaps table.',
   'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
   '{"type":"rpc","fn":"run_personality_coverage_radar"}'::jsonb, '40 4 * * 1')
on conflict (slug) do update
  set description=excluded.description, action=excluded.action, schedule=excluded.schedule, enabled=excluded.enabled;

do $$ begin
  if exists (select 1 from cron.job where jobname='personality_trust_recompute') then perform cron.unschedule('personality_trust_recompute'); end if;
  if exists (select 1 from cron.job where jobname='personality_coverage_radar') then perform cron.unschedule('personality_coverage_radar'); end if;
end $$;
select cron.schedule('personality_trust_recompute', '20 3 * * *', $cron$select public.run_personality_trust_recompute()$cron$);
select cron.schedule('personality_coverage_radar', '40 4 * * 1', $cron$select public.run_personality_coverage_radar()$cron$);

-- Wire the admin "Run now" + "Dry run" dispatchers.
create or replace function public.admin_automation_run(p_slug text)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_result jsonb;
begin
  if not has_any_role_jwt(array['admin'::app_role]) then raise exception 'unauthorized' using errcode='42501'; end if;
  if p_slug = 'event_auto_archive' then v_result := public.run_event_auto_archive();
  elsif p_slug = 'staging_auto_reject_stale' then v_result := public.run_staging_auto_reject_stale();
  elsif p_slug = 'workflow_runs_purge' then v_result := public.run_workflow_runs_purge();
  elsif p_slug = 'enrichment_log_purge' then v_result := public.run_enrichment_log_purge();
  elsif p_slug = 'event_trust_recompute' then v_result := public.run_event_trust_recompute();
  elsif p_slug = 'event_coverage_radar' then v_result := public.run_event_coverage_radar();
  elsif p_slug = 'venue_coord_snap' then v_result := public.run_venue_coord_snap();
  elsif p_slug = 'city_trust_recompute' then v_result := public.run_city_trust_recompute();
  elsif p_slug = 'city_coverage_radar' then v_result := public.run_city_coverage_radar();
  elsif p_slug = 'city_safety_backfill' then v_result := public.run_city_safety_backfill();
  elsif p_slug = 'hotel_safety_backfill' then v_result := public.run_hotel_safety_backfill();
  elsif p_slug = 'amenity_coverage_summary' then v_result := public.run_amenity_coverage_summary();
  elsif p_slug = 'personality_trust_recompute' then v_result := public.run_personality_trust_recompute();
  elsif p_slug = 'personality_coverage_radar' then v_result := public.run_personality_coverage_radar();
  else raise exception 'unknown automation slug: %', p_slug using errcode='22023'; end if;
  return v_result;
end; $function$;

create or replace function public.admin_automation_dry_run(p_slug text)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_automation_id uuid; v_examined int := 0; v_started_at timestamptz := now();
begin
  if not has_any_role_jwt(array['admin'::app_role,'moderator'::app_role]) then
    raise exception 'unauthorized' using errcode='42501'; end if;
  select id into v_automation_id from public.admin_automations where slug = p_slug;
  if v_automation_id is null then raise exception 'unknown automation slug: %', p_slug using errcode='22023'; end if;

  if p_slug = 'event_auto_archive' then
    select count(*) into v_examined from public.events
    where status='active' and end_date is not null and end_date < now() - interval '7 days';
  elsif p_slug = 'staging_auto_reject_stale' then
    select count(*) into v_examined from public.ingestion_staging
    where review_status='pending_review' and disposition='pending' and created_at < now() - interval '60 days';
  elsif p_slug = 'workflow_runs_purge' then
    select count(*) into v_examined from public.workflow_runs
    where status='completed' and started_at < now() - interval '30 days';
  elsif p_slug = 'enrichment_log_purge' then
    select count(*) into v_examined from public.enrichment_log
    where status in ('skipped','done') and created_at < now() - interval '30 days';
  elsif p_slug = 'event_trust_recompute' then
    select count(*) into v_examined from public.events
    where duplicate_of_id is null
      and (start_date > now() - interval '7 days' or last_verified_at is null or updated_at > now() - interval '2 days');
  elsif p_slug = 'event_coverage_radar' then
    select count(*) into v_examined from public.cities where is_major_city = true;
  elsif p_slug = 'venue_coord_snap' then
    select count(*) into v_examined from public.venues_misplaced(null) where is_geocodable = false;
  elsif p_slug = 'city_trust_recompute' then
    select count(*) into v_examined from public.cities c
    where c.duplicate_of_id is null
      and (c.last_verified_at is null or c.updated_at > c.last_verified_at or c.last_verified_at < now() - interval '30 days');
  elsif p_slug = 'city_coverage_radar' then
    select count(*) into v_examined from public.cities where duplicate_of_id is null;
  elsif p_slug = 'city_safety_backfill' then
    select count(*) into v_examined from public.cities c
    where c.duplicate_of_id is null
      and (c.safety_notes is null or length(trim(c.safety_notes))=0)
      and coalesce(c.field_provenance->'safety_notes'->>'source','') <> 'llm+human'
      and not exists (select 1 from public.city_review_queue q
                      where q.city_id=c.id and q.field='safety_notes' and q.status='open');
  elsif p_slug = 'hotel_safety_backfill' then
    select count(*) into v_examined from public.hotels h
    where h.queer_safety_notes is null
       or h.queer_safety_notes ilike 'LGBTQ+-host accommodation listed on misterb&b%'
       or h.queer_safety_notes ilike '%equality score%';
  elsif p_slug = 'personality_trust_recompute' then
    select count(*) into v_examined from public.personalities p
    where p.duplicate_of_id is null and coalesce(p.review_status,'')<>'archived'
      and (p.last_verified_at is null or p.updated_at > p.last_verified_at or p.last_verified_at < now() - interval '30 days');
  elsif p_slug = 'personality_coverage_radar' then
    select count(*) into v_examined from public.personalities
    where duplicate_of_id is null and coalesce(review_status,'')<>'archived';
  else raise exception 'unknown automation slug: %', p_slug using errcode='22023'; end if;

  insert into public.admin_automation_runs
    (automation_id, automation_slug, started_at, finished_at, status, items_examined, items_changed, summary)
  values (v_automation_id, p_slug, v_started_at, now(), 'dry_run', v_examined, 0,
          jsonb_build_object('mode','dry_run','would_change',v_examined));
  return jsonb_build_object('would_change', v_examined);
end; $function$;

commit;
