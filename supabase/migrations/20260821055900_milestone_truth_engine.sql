-- Milestone Truth Engine (data-quality, 2026). Milestones had no self-maintaining
-- quality loop — every comparable entity (cities/venues/events/personalities/
-- organizations/villages) does. `quality_score` existed as a column but had zero
-- writers anywhere in the codebase (verified: only src/config/contentTypes/
-- milestone.ts *read* it, nothing ever wrote it) and zero readers besides that
-- admin field, which always rendered blank.
--
-- Right-sized to the Personality Truth Engine (20260618130000), not the heavier
-- City Truth Engine: milestones have no external source to periodically re-fetch
-- (sources are static citations written once, not re-enriched), so this omits
-- edge functions, enrichment_status, and — unlike every other engine's trust
-- formula — a freshness-decay term: a 1972 law's correctness doesn't degrade
-- with time the way a venue's opening hours do.

begin;

-- ============================================================
-- 1. Columns. Drop the dead quality_score in the same migration rather than
--    leave two confusing, overlapping score columns.
-- ============================================================
alter table public.milestones
  add column if not exists trust_score        smallint not null default 0,
  add column if not exists completeness_score smallint not null default 0,
  add column if not exists last_verified_at   timestamptz,
  add column if not exists needs_attention    boolean not null default false;

alter table public.milestones drop column if exists quality_score;

-- ============================================================
-- 2. Signals ledger. 'corroboration' included from creation so the Dedup
--    Truth Engine's existing _dedup_write_corroboration_signal (which already
--    special-cases 'personality'/'city'/'venue'/'news'/'queer_village') can be
--    extended to milestones later with zero migration here. 'category_fit' is
--    for the Phase 4 reclassification pass.
-- ============================================================
create table if not exists public.milestone_quality_signals (
  id            uuid primary key default gen_random_uuid(),
  milestone_id  uuid not null references public.milestones(id) on delete cascade,
  signal_type   text not null check (signal_type in
    ('completeness','corroboration','linkage','category_fit','admin_feedback')),
  value         numeric(5,4) not null default 0,
  weight        numeric(4,3) not null default 1.000,
  source        text,
  details       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists idx_milestone_quality_signals_mid on public.milestone_quality_signals(milestone_id);
create index if not exists idx_milestone_quality_signals_created on public.milestone_quality_signals(created_at);
alter table public.milestone_quality_signals enable row level security;

-- ============================================================
-- 3. Coverage gaps (weekly radar output).
-- ============================================================
create table if not exists public.milestone_coverage_gaps (
  id               uuid primary key default gen_random_uuid(),
  milestone_id     uuid references public.milestones(id) on delete cascade,
  milestone_title  text,
  gap_score        smallint not null default 0,
  missing_fields   text[] not null default '{}',
  resolution       text not null default 'enrich' check (resolution in ('enrich','link','categorize','review')),
  status           text not null default 'open' check (status in ('open','queued','resolved','ignored')),
  last_checked_at  timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  constraint milestone_coverage_gaps_mid_uk unique (milestone_id)
);
create index if not exists idx_milestone_coverage_gaps_status on public.milestone_coverage_gaps(status, gap_score desc);
alter table public.milestone_coverage_gaps enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='milestone_quality_signals' and policyname='admin_read_milestone_quality_signals') then
    create policy admin_read_milestone_quality_signals on public.milestone_quality_signals
      for select to authenticated using (has_any_role_jwt(array['admin'::app_role,'moderator'::app_role]));
  end if;
  if not exists (select 1 from pg_policies where tablename='milestone_coverage_gaps' and policyname='admin_read_milestone_coverage_gaps') then
    create policy admin_read_milestone_coverage_gaps on public.milestone_coverage_gaps
      for select to authenticated using (has_any_role_jwt(array['admin'::app_role,'moderator'::app_role]));
  end if;
end $$;

-- ============================================================
-- 4. Completeness scorer (pure). Weights sum to 100.
-- ============================================================
create or replace function public.compute_milestone_completeness(p_id uuid)
returns smallint
language sql stable
security definer set search_path to 'public', 'pg_temp'
as $$
  select greatest(0, least(100, round(
      case when m.date_precision = 'day' then 25 else 10 end
    + case when jsonb_array_length(coalesce(m.sources,'[]'::jsonb)) > 0 then 20 else 0 end
    + case when m.category is not null and m.category <> 'other' then 15 else 0 end
    + case when m.country_id is not null or m.city_id is not null then 15 else 0 end
    + case when exists (select 1 from public.milestone_links l where l.milestone_id = m.id) then 10 else 0 end
    + case when m.tags is not null and array_length(m.tags,1) > 0 then 5 else 0 end
    + case when m.image_url is not null or m.impact = 'negative' then 5 else 0 end
    + case when m.description is not null and length(trim(m.description)) > 80 then 5 else 0 end
  )))::smallint
  from public.milestones m where m.id = p_id;
$$;

-- ============================================================
-- 5. Trust recompute (nightly). No freshness term (see header) — trust is a
--    composite of completeness, review approval, and the absence of a flagged
--    problem. The whole corpus is ~3.2k rows so one run covers it; still
--    capped for the same discipline every other engine uses.
-- ============================================================
create or replace function public.run_milestone_trust_recompute(p_limit int default 3500, p_force boolean default false)
returns jsonb
language plpgsql
security definer set search_path to 'public', 'pg_temp'
as $$
declare
  v_automation_id uuid;
  v_run_id bigint;
  v_changed int := 0;
begin
  select id into v_automation_id from public.admin_automations where slug='milestone_trust_recompute';
  insert into public.admin_automation_runs (automation_id, automation_slug, started_at, status)
    values (v_automation_id, 'milestone_trust_recompute', now(), 'success') returning id into v_run_id;

  with scope as (
    select m.id
    from public.milestones m
    where m.duplicate_of_id is null
      and (p_force
           or m.last_verified_at is null
           or m.updated_at > m.last_verified_at
           or m.last_verified_at < now() - interval '30 days')
    order by m.last_verified_at asc nulls first
    limit greatest(1, least(p_limit, 4000))
  ),
  calc as (
    select m.id,
      public.compute_milestone_completeness(m.id) as comp,
      case when m.review_status = 'approved' then 1.0 else 0.4 end as approval,
      coalesce(m.needs_attention, false) as needs_attn
    from public.milestones m join scope s on s.id = m.id
  ),
  scored as (
    select id, comp,
      greatest(0, least(100, round(
        100 * (0.55*(comp/100.0) + 0.25*approval + 0.20*(case when needs_attn then 0 else 1 end))
      )))::smallint as trust
    from calc
  ),
  upd as (
    update public.milestones m
       set completeness_score = s.comp,
           trust_score        = s.trust,
           last_verified_at   = now()
    from scored s where m.id = s.id
    returning m.id
  )
  select count(*) into v_changed from upd;

  insert into public.milestone_quality_signals (milestone_id, signal_type, value, source)
  select m.id, 'completeness', least(1.0, m.completeness_score/100.0), 'trust_recompute'
  from public.milestones m
  where m.last_verified_at > now() - interval '1 minute';

  update public.admin_automation_runs
     set finished_at=now(), items_examined=v_changed, items_changed=v_changed,
         summary=jsonb_build_object('rescored', v_changed)
   where id=v_run_id;
  update public.admin_automations set last_run_at=now(), last_run_status='success' where id=v_automation_id;

  return jsonb_build_object('rescored', v_changed);
end;
$$;

-- ============================================================
-- 6. Coverage radar (weekly; gaps table only, never mutates milestones).
-- ============================================================
create or replace function public.run_milestone_coverage_radar(p_force boolean default false)
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
  select id into v_automation_id from public.admin_automations where slug='milestone_coverage_radar';
  insert into public.admin_automation_runs (automation_id, automation_slug, started_at, status)
    values (v_automation_id, 'milestone_coverage_radar', now(), 'success') returning id into v_run_id;

  with cand as (
    select m.id, m.title, m.completeness_score, m.category,
      array_remove(array[
        case when m.date_precision <> 'day' then 'date_precision' end,
        case when jsonb_array_length(coalesce(m.sources,'[]'::jsonb)) = 0 then 'sources' end,
        case when m.category is null or m.category = 'other' then 'category' end,
        case when m.country_id is null and m.city_id is null then 'location' end,
        case when not exists (select 1 from public.milestone_links l where l.milestone_id = m.id) then 'links' end,
        case when m.tags is null or array_length(m.tags,1) is null then 'tags' end,
        case when m.image_url is null and m.impact <> 'negative' then 'image' end
      ], null) as missing,
      (100 - m.completeness_score)::smallint as gap_score,
      case
        when m.category is null or m.category = 'other' then 'categorize'
        when m.country_id is null and m.city_id is null then 'link'
        when not exists (select 1 from public.milestone_links l where l.milestone_id = m.id) then 'link'
        when m.date_precision <> 'day' then 'review'
        else 'enrich'
      end as resolution
    from public.milestones m
    where m.duplicate_of_id is null
  ),
  ups as (
    insert into public.milestone_coverage_gaps
      (milestone_id, milestone_title, gap_score, missing_fields, resolution, status, last_checked_at)
    select id, title, gap_score, missing, resolution,
      case when cardinality(missing)=0 then 'resolved' else 'open' end, now()
    from cand
    on conflict (milestone_id) do update
      set milestone_title=excluded.milestone_title,
          gap_score=excluded.gap_score,
          missing_fields=excluded.missing_fields,
          resolution=excluded.resolution,
          status=case when cardinality(excluded.missing_fields)=0 then 'resolved'
                      when public.milestone_coverage_gaps.status='ignored' then 'ignored'
                      else 'open' end,
          last_checked_at=now()
    returning 1
  )
  select count(*) into v_upserted from ups;
  select count(*) into v_examined from public.milestones where duplicate_of_id is null;

  update public.admin_automation_runs
     set finished_at=now(), items_examined=v_examined, items_changed=v_upserted,
         summary=jsonb_build_object('gaps_upserted', v_upserted)
   where id=v_run_id;
  update public.admin_automations set last_run_at=now(), last_run_status='success' where id=v_automation_id;

  return jsonb_build_object('gaps_upserted', v_upserted, 'examined', v_examined);
end;
$$;

-- ============================================================
-- 7. Grants.
-- ============================================================
revoke all on function public.compute_milestone_completeness(uuid) from public;
revoke all on function public.run_milestone_trust_recompute(int,boolean) from public;
revoke all on function public.run_milestone_coverage_radar(boolean) from public;
grant execute on function public.compute_milestone_completeness(uuid) to service_role;
grant execute on function public.run_milestone_trust_recompute(int,boolean) to service_role;
grant execute on function public.run_milestone_coverage_radar(boolean) to service_role;

-- ============================================================
-- 8. Register automations + cron. Dispatch (admin_automation_run/_dry_run) is
--    data-driven since 20260607147000 — it resolves run_<slug>() by naming
--    convention, so no dispatcher edit is needed here.
-- ============================================================
insert into public.admin_automations (slug, name, description, managed_by, enabled, "trigger", schedule, action)
values
  ('milestone_trust_recompute', 'Recompute milestone trust scores',
   'Nightly composite trust_score + completeness_score per milestone (no freshness term — historical facts do not go stale the way venue hours do).',
   'system', true, jsonb_build_object('type','schedule'), '25 3 * * *',
   jsonb_build_object('type','cron', 'jobname','milestone_trust_recompute',
     'command', 'SELECT public.run_milestone_trust_recompute(3500)')),
  ('milestone_coverage_radar', 'Detect milestone content gaps',
   'Weekly scan of every live milestone; records milestone_coverage_gaps (missing fields + resolution route: categorize/link/review/enrich). Writes only to the gaps table.',
   'system', true, jsonb_build_object('type','schedule'), '50 4 * * 1',
   jsonb_build_object('type','cron', 'jobname','milestone_coverage_radar',
     'command', 'SELECT public.run_milestone_coverage_radar()'))
on conflict (slug) do update
  set description=excluded.description, action=excluded.action, schedule=excluded.schedule, enabled=true;

select cron.schedule('milestone_trust_recompute', '25 3 * * *',
                     'SELECT public.run_milestone_trust_recompute(3500)')
where not exists (select 1 from cron.job where jobname = 'milestone_trust_recompute');

select cron.schedule('milestone_coverage_radar', '50 4 * * 1',
                     'SELECT public.run_milestone_coverage_radar()')
where not exists (select 1 from cron.job where jobname = 'milestone_coverage_radar');

-- ============================================================
-- 9. search_documents_index_milestones referenced the now-dropped
--    m.quality_score directly (20260721130737) — it was never actually a live
--    ranking signal, since nothing ever wrote that column, so this also fixes
--    a latent bug rather than just avoiding breakage. Repoint quality_score at
--    the new completeness_score and wire trust_score for real (it was
--    hardcoded null::smallint before); also add trust_score to the ON
--    CONFLICT UPDATE list, which never updated it even when it had a value.
-- ============================================================
create or replace function public.search_documents_index_milestones(p_id uuid default null::uuid)
returns void language sql security definer
set search_path to 'public','extensions','pg_temp' as $$
  insert into public.search_documents
    (doc_id, entity_type, entity_id, title, description, search_tsv, facets, geog,
     trust_score, liveness_status, is_featured, quality_score, closed_at,
     start_date, end_date, is_free, price_min, price_max,
     slug, image_url, city, country, content_language, updated_at)
  select 'milestone:'||m.id, 'milestone', m.id, m.title, m.description,
       setweight(to_tsvector('simple', unaccent(coalesce(m.title,''))),'A')
    || setweight(to_tsvector('simple', unaccent(coalesce(co.name,''))),'B')
    || setweight(to_tsvector('simple', unaccent(coalesce(m.country_name,''))),'B')
    || setweight(to_tsvector('simple', unaccent(coalesce(m.category,''))),'B')
    || setweight(to_tsvector('simple', unaccent(coalesce(ci.name, m.city_name, ''))),'C')
    || setweight(to_tsvector('simple', unaccent(coalesce(m.region,''))),'C')
    || setweight(to_tsvector('simple', unaccent(array_to_string(m.tags,' '))),'C')
    || setweight(to_tsvector('simple', unaccent(coalesce(m.description,''))),'D'),
    jsonb_strip_nulls(jsonb_build_object(
      'entity_kind', 'milestone',
      'category', m.category,
      'impact', m.impact,
      'significance', m.significance,
      'tags', to_jsonb(m.tags))),
    case when ci.latitude is not null and ci.longitude is not null
         then st_setsrid(st_makepoint(ci.longitude::float8, ci.latitude::float8),4326)::geography end,
    m.trust_score, 'live', coalesce(m.is_featured,false), m.completeness_score, null::timestamptz,
    m.date::timestamptz, m.date_end::timestamptz, null::boolean, null::numeric, null::numeric,
    m.slug, m.image_url, coalesce(ci.name, m.city_name), coalesce(co.name, m.country_name),
    null::text, now()
  from public.milestones m
  left join public.countries co on co.id = m.country_id
  left join public.cities ci on ci.id = m.city_id
  where m.status = 'published'
    and m.duplicate_of_id is null
    and (p_id is null or m.id = p_id)
  on conflict (entity_type, entity_id) do update set
    title=excluded.title, description=excluded.description, search_tsv=excluded.search_tsv,
    facets=excluded.facets, geog=excluded.geog,
    is_featured=excluded.is_featured, trust_score=excluded.trust_score, quality_score=excluded.quality_score,
    start_date=excluded.start_date, end_date=excluded.end_date,
    slug=excluded.slug, image_url=excluded.image_url, city=excluded.city,
    country=excluded.country, updated_at=now();
$$;

-- One-time backfill so search_documents doesn't carry zero scores (the
-- column defaults) until tonight's cron — score first, then reindex with the
-- real values.
select public.run_milestone_trust_recompute(3500, true);
select public.search_documents_index_milestones(null);

commit;
