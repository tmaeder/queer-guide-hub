-- P5 groundwork (safe half) — silo → unified-graph crosswalk + gap analysis.
--
-- The full P5 cut-over (migrate venue/event/profession readers off their lookup
-- tables onto unified_tags, drop compatibility views) is a hard-to-reverse
-- migration against live production filtering and is deferred by design ("after
-- P1–P3 prove out"). This ships only the READ-ONLY groundwork it needs: a live
-- crosswalk mapping each active silo term to its matching unified_tags concept
-- (by slug), the facet it belongs to, and — for the ~2/3 with no exact match —
-- an unmapped flag. NO writes to silo tables, unified_tags, or any reader; no
-- new public tags. This is the reviewable work-list for a future watched cut-over.

create or replace view public.v_silo_concept_crosswalk as
with silo as (
  select 'venue_categories'::text as silo, 'venue'::text as facet, id as silo_id, name,
         coalesce(slug, lower(regexp_replace(trim(name),'[^a-z0-9]+','-','gi'))) as sl from public.venue_categories where is_active
  union all
  select 'venue_services','venue', id, name,
         coalesce(slug, lower(regexp_replace(trim(name),'[^a-z0-9]+','-','gi'))) from public.venue_services where is_active
  union all
  select 'event_types','event', id, name, lower(regexp_replace(trim(name),'[^a-z0-9]+','-','gi')) from public.event_types where is_active
  union all
  select 'event_amenities','event', id, name, lower(regexp_replace(trim(name),'[^a-z0-9]+','-','gi')) from public.event_amenities where is_active
  union all
  select 'event_services','event', id, name, lower(regexp_replace(trim(name),'[^a-z0-9]+','-','gi')) from public.event_services where is_active
  union all
  select 'accessibility_attributes','accessibility', id, name, lower(regexp_replace(trim(name),'[^a-z0-9]+','-','gi')) from public.accessibility_attributes where is_active
  union all
  select 'target_groups','target_group', id, name, lower(regexp_replace(trim(name),'[^a-z0-9]+','-','gi')) from public.target_groups where is_active
  union all
  select 'professions','person', id, name,
         coalesce(slug, lower(regexp_replace(trim(name),'[^a-z0-9]+','-','gi'))) from public.professions where is_active
)
select s.silo, s.facet, s.silo_id, s.name as silo_name, s.sl as derived_slug,
       u.id as tag_id, u.slug as tag_slug,
       case when u.id is not null then 'exact_slug' else 'unmapped' end as match_kind
from silo s
left join public.unified_tags u on u.slug = s.sl and u.status = 'active';

-- admin-gated coverage summary (mirrors the coverage-radar read pattern)
create or replace function public.silo_concept_coverage()
returns table (silo text, facet text, terms bigint, mapped bigint, unmapped bigint, pct_mapped numeric)
language sql security definer stable set search_path = public as $$
  select silo, min(facet) as facet, count(*) as terms,
         count(*) filter (where match_kind='exact_slug') as mapped,
         count(*) filter (where match_kind='unmapped')   as unmapped,
         round(100.0 * count(*) filter (where match_kind='exact_slug') / nullif(count(*),0), 1) as pct_mapped
  from public.v_silo_concept_crosswalk
  group by silo
  order by silo;
$$;

revoke all on function public.silo_concept_coverage() from public;
grant execute on function public.silo_concept_coverage() to service_role, authenticated;
-- the view reads only already-readable admin lookup tables + unified_tags; keep it admin-facing
revoke all on public.v_silo_concept_crosswalk from anon;
grant select on public.v_silo_concept_crosswalk to authenticated, service_role;
