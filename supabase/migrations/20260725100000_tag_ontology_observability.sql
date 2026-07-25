-- P3 Task 1 — ontology observability + targeting (pure SQL).
-- (a) persist the existing tag_ontology_health() snapshot nightly for trend,
-- (b) a coverage radar: a prioritized work-list of under-structured active tags
--     (missing facet / broader parent / related edges), used-but-ungoverned first.
-- Reuses the P0 snapshot fn; no new counting logic. Read paths are definer +
-- admin-gated. Nothing writes to unified_tags → no search-sync trigger storm.

create table if not exists public.tag_ontology_health_log (
  id uuid primary key default gen_random_uuid(),
  snapshot jsonb not null,
  generated_at timestamptz not null default now()
);
alter table public.tag_ontology_health_log enable row level security;
create index if not exists tag_ontology_health_log_ts_idx
  on public.tag_ontology_health_log (generated_at desc);

-- nightly: snapshot + keep the last 180 rows.
create or replace function public.run_tag_ontology_recompute()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  perform public.assert_admin_or_internal();
  v := public.tag_ontology_health();
  insert into public.tag_ontology_health_log (snapshot) values (v);
  delete from public.tag_ontology_health_log
   where id in (select id from public.tag_ontology_health_log order by generated_at desc offset 180);
  return v;
end $$;

-- prioritized gap work-list for the next enrichment pass.
create or replace function public.tag_coverage_radar(p_limit int default 200)
returns table (
  tag_id uuid, slug text, name text, real_usage bigint,
  has_facet boolean, has_parent boolean, has_related boolean, gap_score int
) language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_admin_or_internal();
  return query
  with u as (
    select a.tag_id, count(*)::bigint n from public.unified_tag_assignments a group by a.tag_id
  ),
  faceted as (select distinct concept_id from public.tag_facets),
  parented as (select distinct source_tag_id tid from public.tag_relations where relation_type='broader'),
  relatedt as (
    select source_tag_id tid from public.tag_relations where relation_type='related'
    union
    select target_tag_id from public.tag_relations where relation_type='related'
  )
  select t.id, t.slug, t.name, coalesce(u.n,0),
         (f.concept_id is not null), (p.tid is not null), (r.tid is not null),
         ((f.concept_id is null)::int + (p.tid is null)::int + (r.tid is null)::int
           + (coalesce(u.n,0) > 0)::int) as gap_score
  from public.unified_tags t
  left join u        on u.tag_id = t.id
  left join faceted  f on f.concept_id = t.id
  left join parented p on p.tid = t.id
  left join relatedt r on r.tid = t.id
  where t.status = 'active'
    and (f.concept_id is null or p.tid is null or r.tid is null)
  order by (coalesce(u.n,0) > 0) desc, coalesce(u.n,0) desc,
           ((f.concept_id is null)::int + (p.tid is null)::int + (r.tid is null)::int) desc
  limit greatest(p_limit, 0);
end $$;

revoke all on function public.run_tag_ontology_recompute() from public;
revoke all on function public.tag_coverage_radar(int) from public;
grant execute on function public.run_tag_ontology_recompute() to service_role;
grant execute on function public.tag_coverage_radar(int) to service_role, authenticated;

-- nightly cron + admin_automation
insert into public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
values ('tag_ontology_recompute','Tag ontology health snapshot',
        'Nightly: snapshots tag_ontology_health() into tag_ontology_health_log for trend tracking.',
        'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
        '{"type":"rpc","fn":"run_tag_ontology_recompute"}'::jsonb, '50 4 * * *')
on conflict (slug) do update set schedule=excluded.schedule, enabled=excluded.enabled,
  description=excluded.description, name=excluded.name, action=excluded.action, trigger=excluded.trigger;

select cron.schedule('tag_ontology_recompute', '50 4 * * *',
  $cron$ select public.run_tag_ontology_recompute(); $cron$);
