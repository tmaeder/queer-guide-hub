-- The reviewed redirect registry in 99991789917000 is the positive identity
-- ledger. Exact slug collisions left after that conversion are homonyms (for
-- example queer the concept vs Queer the venue), not unresolved incidents.

select set_config('app.actor','editorial:tag-entity-homonym-ledger',true);

with candidates as (
  select 'personality'::text typ,id,slug from public.personalities where duplicate_of_id is null
  union all select 'city',id,slug from public.cities where duplicate_of_id is null
  union all select 'country',id,slug from public.countries where duplicate_of_id is null
  union all select 'village',id,slug from public.queer_villages where duplicate_of_id is null
  union all select 'venue',id,slug from public.venues where duplicate_of_id is null
  union all select 'organization',id,slug from public.organizations where duplicate_of_id is null
  union all select 'event',id,slug from public.events where duplicate_of_id is null
  union all select 'hotel',id,slug from public.hotels where duplicate_of_id is null
)
insert into public.tag_entity_candidate_reviews(
  tag_id,candidate_type,candidate_id,decision,reviewed_at,reviewed_by
)
select t.id,c.typ,c.id,'homonym',now(),null
from public.unified_tags t
join candidates c on c.slug=t.slug
where t.status='active' and t.publication_role in ('article','utility')
on conflict(tag_id,candidate_type,candidate_id) do update
set decision='homonym',reviewed_at=excluded.reviewed_at,reviewed_by=null;

-- Normalised-name matching caused a full cross-product over every venue and
-- event and treated spelling similarity as evidence. Entity conversion now
-- requires an exact unresolved slug; alternate slugs belong in the explicit
-- reviewed redirect registry.
create or replace function public.tag_entity_audit_queue(p_limit integer default 100)
returns table(tag_id uuid, tag_slug text, tag_name text, entity_kind public.tag_entity_kind,
  usage integer, candidate_type text, candidate_id uuid, candidate_slug text,
  evidence jsonb, priority bigint)
language plpgsql stable security definer set search_path=public as $$
begin
  if auth.role() <> 'service_role'
     and not public.has_any_role_jwt(array['admin','moderator','editor']::public.app_role[]) then
    raise exception 'unauthorized' using errcode='42501';
  end if;
  return query
  with candidates as (
    select 'personality'::text typ,id,slug,name from public.personalities where duplicate_of_id is null
    union all select 'city',id,slug,name from public.cities where duplicate_of_id is null
    union all select 'country',id,slug,name from public.countries where duplicate_of_id is null
    union all select 'village',id,slug,name from public.queer_villages where duplicate_of_id is null
    union all select 'venue',id,slug,name from public.venues where duplicate_of_id is null
    union all select 'organization',id,slug,name from public.organizations where duplicate_of_id is null
    union all select 'event',id,slug,title from public.events where duplicate_of_id is null
    union all select 'hotel',id,slug,name from public.hotels where duplicate_of_id is null
  )
  select t.id,t.slug,t.name,t.entity_kind,coalesce(t.usage_count,0),c.typ,c.id,c.slug,
    jsonb_build_object('match','exact_slug','candidate_name',c.name,
      'warning','A slug collision is a candidate, not proof of identity'),
    1000000::bigint + coalesce(t.usage_count,0)
  from public.unified_tags t
  join candidates c on c.slug=t.slug
  where t.status='active' and t.publication_role in ('article','utility')
    and not exists(select 1 from public.tag_entity_candidate_reviews r
      where r.tag_id=t.id and r.candidate_type=c.typ and r.candidate_id=c.id)
  order by coalesce(t.usage_count,0) desc,t.slug,c.typ
  limit greatest(1,least(p_limit,500));
end $$;

revoke all on function public.tag_entity_audit_queue(integer) from public;
grant execute on function public.tag_entity_audit_queue(integer) to authenticated,service_role;

do $verify$
begin
  if exists(
    with candidates as (
      select 'personality'::text typ,id,slug from public.personalities where duplicate_of_id is null
      union all select 'city',id,slug from public.cities where duplicate_of_id is null
      union all select 'country',id,slug from public.countries where duplicate_of_id is null
      union all select 'village',id,slug from public.queer_villages where duplicate_of_id is null
      union all select 'venue',id,slug from public.venues where duplicate_of_id is null
      union all select 'organization',id,slug from public.organizations where duplicate_of_id is null
      union all select 'event',id,slug from public.events where duplicate_of_id is null
      union all select 'hotel',id,slug from public.hotels where duplicate_of_id is null
    )
    select 1 from public.unified_tags t join candidates c on c.slug=t.slug
    where t.status='active' and t.publication_role in ('article','utility')
      and not exists(select 1 from public.tag_entity_candidate_reviews r
        where r.tag_id=t.id and r.candidate_type=c.typ and r.candidate_id=c.id)
  ) then
    raise exception 'reviewed tag/entity collision ledger is incomplete';
  end if;
end $verify$;
;
