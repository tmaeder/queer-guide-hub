-- Canonical typed records remain authoritative; every writer gets the same cascade.
create or replace function public.geo_cms_cascade_parent()
returns trigger language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_table text; v_country uuid;
begin
  if tg_table_name = 'cities' then
    if new.country_id is not distinct from old.country_id then return new; end if;
    if new.country_id is null then raise exception 'Select a country before moving a city'; end if;
    v_country := new.country_id;
    update public.queer_villages set country_id=v_country, updated_at=now()
      where city_id=new.id and country_id is distinct from v_country;
    foreach v_table in array array['venues','events','hotels','organizations'] loop
      execute format('update public.%I set country_id=$1, updated_at=now() where city_id=$2 and country_id is distinct from $1',v_table)
      using v_country,new.id;
    end loop;
  else
    if new.city_id is not distinct from old.city_id and new.country_id is not distinct from old.country_id then return new; end if;
    if new.city_id is null then raise exception 'Select a city before moving a queer village'; end if;
    v_country := new.country_id;
    foreach v_table in array array['venues','events','hotels'] loop
      execute format('update public.%I set city_id=$1, country_id=$2, updated_at=now() where queer_village_id=$3 and (city_id is distinct from $1 or country_id is distinct from $2)',v_table)
      using new.city_id,v_country,new.id;
    end loop;
  end if;
  perform public.recompute_safety_gated_for_country(v_country);
  return new;
end $$;
revoke all on function public.geo_cms_cascade_parent() from public,anon,authenticated;
create trigger geo_cms_city_parent_cascade after update of country_id on public.cities
for each row execute function public.geo_cms_cascade_parent();
create trigger geo_cms_village_parent_cascade after update of city_id,country_id on public.queer_villages
for each row execute function public.geo_cms_cascade_parent();

create table public.geo_cms_verifications (
  place_id uuid primary key references public.geo_places(id) on delete cascade,
  status text not null check(status in ('verified','review','missing','stale','country_checked')),
  checked_at timestamptz not null default now(),
  fingerprint text not null,
  checks jsonb not null default '{}'::jsonb,
  sources jsonb not null default '[]'::jsonb
);
alter table public.geo_cms_verifications enable row level security;
create policy geo_cms_verifications_admin_read on public.geo_cms_verifications for select to authenticated
using (public.has_any_role_jwt(array['admin','moderator','editor']::public.app_role[]));
grant select on public.geo_cms_verifications to authenticated;
grant all on public.geo_cms_verifications to service_role;

create or replace function public.geo_cms_fingerprint(p_id uuid)
returns text language sql stable set search_path=public,pg_temp as $$
select md5(jsonb_build_array(g.name,g.latitude,g.longitude,g.parent_id,g.country_id,g.city_id,g.duplicate_of_id)::text)
from public.geo_places g where g.id=p_id;
$$;
revoke all on function public.geo_cms_fingerprint(uuid) from public,anon,authenticated;
grant execute on function public.geo_cms_fingerprint(uuid) to service_role;

create or replace function public.geo_cms_invalidate_verification()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if row(new.name,new.latitude,new.longitude,new.parent_id,new.country_id,new.city_id,new.duplicate_of_id)
     is distinct from row(old.name,old.latitude,old.longitude,old.parent_id,old.country_id,old.city_id,old.duplicate_of_id) then
    update public.geo_cms_verifications set status='stale' where place_id=new.id;
    -- A city's coordinate/name change also invalidates its villages' parent evidence.
    if new.place_type='city' then
      update public.geo_cms_verifications set status='stale'
      where place_id in (select id from public.geo_places where parent_id=new.id);
    end if;
  end if;
  return new;
end $$;
revoke all on function public.geo_cms_invalidate_verification() from public,anon,authenticated;
create trigger geo_cms_verification_stale after update on public.geo_places
for each row execute function public.geo_cms_invalidate_verification();

create or replace function public.geo_cms_record(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_result jsonb;
begin
  perform public.assert_admin_or_internal();
  select jsonb_build_object(
    'id',g.id,'place_type',g.place_type,'name',g.name,'slug',g.slug,
    'parent_id',g.parent_id,'country_id',g.country_id,'city_id',g.city_id,
    'latitude',g.latitude,'longitude',g.longitude,'updated_at',g.updated_at,
    'safety_gated',g.safety_gated,'duplicate_of_id',g.duplicate_of_id,
    'child_count',(select count(*) from geo_places ch where ch.parent_id=g.id and ch.place_type in ('city','village') and ch.duplicate_of_id is null),
    'venue_count',(select count(*) from venues v where v.duplicate_of_id is null and case g.place_type when 'country' then v.country_id=g.id when 'city' then v.city_id=g.id else v.queer_village_id=g.id end),
    'event_count',(select count(*) from events e where e.duplicate_of_id is null and case g.place_type when 'country' then e.country_id=g.id when 'city' then e.city_id=g.id else e.queer_village_id=g.id end),
    'hotel_count',(select count(*) from hotels h where case g.place_type when 'country' then h.country_id=g.id when 'city' then h.city_id=g.id else h.queer_village_id=g.id end),
    'path',concat_ws(' > ',case when g.place_type<>'country' then co.name end,case when g.place_type='village' then ci.name end,g.name),
    'country_name',co.name,'country_code',co.code,'city_name',ci.name,
    'source_table',case g.place_type when 'country' then 'countries' when 'city' then 'cities' when 'village' then 'queer_villages' end,
    'verification_status',coalesce(vf.status,'missing'),'verification',to_jsonb(vf),
    'workflow_state',cm.workflow_state,'seo_indexable',g.seo_indexable
  ) into v_result
  from geo_places g left join countries co on co.id=g.country_id left join cities ci on ci.id=g.city_id
  left join geo_cms_verifications vf on vf.place_id=g.id
  left join cms_content_metadata cm on cm.source_id=g.id and cm.source_table=case g.place_type when 'country' then 'countries' when 'city' then 'cities' when 'village' then 'queer_villages' end
  where g.id=p_id and g.place_type in ('country','city','village');
  return v_result;
end $$;
revoke all on function public.geo_cms_record(uuid) from public,anon;
grant execute on function public.geo_cms_record(uuid) to authenticated,service_role;

create or replace function public.geo_cms_rows(p_parent_id uuid default null,p_search text default '',p_type text default null,p_offset int default 0,p_continent_id uuid default null,p_region_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_rows jsonb; v_total bigint;
begin
  perform public.assert_admin_or_internal();
  if p_type is not null and p_type not in ('country','city','village') then raise exception 'Invalid geography type'; end if;
  with matches as (
    select g.id,g.name from geo_places g join countries co on co.id=g.country_id
    where g.place_type in ('country','city','village') and g.duplicate_of_id is null
      and (p_type is null or g.place_type=p_type)
      and (p_continent_id is null or co.continent_id=p_continent_id)
      and (p_region_id is null or co.region_id=p_region_id)
      and (case when nullif(btrim(p_search),'') is not null then g.name ilike '%'||btrim(p_search)||'%' or co.name ilike '%'||btrim(p_search)||'%' or exists(select 1 from cities ci where ci.id=g.city_id and ci.name ilike '%'||btrim(p_search)||'%')
        when p_type is not null then true when p_parent_id is null then g.place_type='country' else g.parent_id=p_parent_id end)
  ), page as (select * from matches order by name,id offset greatest(p_offset,0) limit 50)
  select (select count(*) from matches),coalesce((select jsonb_agg(public.geo_cms_record(id) order by name,id) from page),'[]'::jsonb)
  into v_total,v_rows;
  return jsonb_build_object('rows',v_rows,'total',v_total);
end $$;
revoke all on function public.geo_cms_rows(uuid,text,text,int,uuid,uuid) from public,anon;
grant execute on function public.geo_cms_rows(uuid,text,text,int,uuid,uuid) to authenticated,service_role;

create or replace function public.geo_cms_verify(p_id uuid)
returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare g public.geo_places; co public.countries; ci public.cities;
  v_iso text; v_kind text; v_distance numeric; v_status text; v_checks jsonb; v_sources jsonb;
begin
  perform public.assert_admin_or_internal();
  select * into strict g from geo_places where id=p_id and place_type in ('country','city','village') for update;
  select * into co from countries where id=g.country_id;
  select * into ci from cities where id=g.city_id;
  v_sources := jsonb_build_array(jsonb_build_object('title','Natural Earth country boundaries','url','https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-0-countries/',
    'version',(select source_version from geo_boundaries where boundary_kind='country' limit 1)));
  if g.latitude is null or g.longitude is null then
    v_status:='missing'; v_checks:=jsonb_build_object('reason','Coordinates are missing');
  else
    select iso_a2,match_kind into v_iso,v_kind from geo_country_at(g.latitude,g.longitude);
    if g.place_type='village' and ci.latitude is not null and ci.longitude is not null then
      v_distance := ST_Distance(ST_SetSRID(ST_MakePoint(g.longitude::float8,g.latitude::float8),4326)::geography,
        ST_SetSRID(ST_MakePoint(ci.longitude::float8,ci.latitude::float8),4326)::geography);
    end if;
    v_checks:=jsonb_build_object('country_code',co.code,'polygon_country',v_iso,'country_match',v_iso=co.code,'match_kind',v_kind,
      'distance_to_city_m',v_distance,'identity_verified',false,'parent_verified',false,'queer_designation_verified',false,
      'reason',case when v_iso is null then 'No country boundary match; check coastal or disputed areas'
        when v_iso is distinct from co.code then 'Coordinates disagree with the assigned country; review border and territory evidence'
        when v_distance>50000 then 'More than 50 km from the linked city centre; review identity and parent'
        else 'Country checked. Place identity and parent still need external evidence' end);
    v_status := case when v_iso is null or v_iso is distinct from co.code or v_distance>50000 then 'review' else 'country_checked' end;
    if ci.wikidata_qid is not null then
      v_sources:=v_sources||jsonb_build_array(jsonb_build_object('title','Parent city on Wikidata (reference only)','url','https://www.wikidata.org/wiki/'||ci.wikidata_qid));
    end if;
  end if;
  insert into geo_cms_verifications(place_id,status,fingerprint,checks,sources)
  values(p_id,v_status,public.geo_cms_fingerprint(p_id),v_checks,v_sources)
  on conflict(place_id) do update set status=excluded.status,checked_at=now(),fingerprint=excluded.fingerprint,checks=excluded.checks,sources=excluded.sources;
  return public.geo_cms_record(p_id);
end $$;
revoke all on function public.geo_cms_verify(uuid) from public,anon;
grant execute on function public.geo_cms_verify(uuid) to authenticated,service_role;

-- Concurrency-protected parent edits. Canonical-table triggers own propagation.
create or replace function public.geo_cms_move(p_id uuid,p_new_parent_id uuid,p_expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare g public.geo_places; par public.geo_places; v_iso text; v_kind text; v_code text;
begin
  perform public.assert_admin_or_internal();
  -- Lock canonical rows first: every CMS writer acquires these locks before spine triggers.
  if exists(select 1 from cities where id=p_id) then
    perform 1 from cities where id=p_id for update;
  elsif exists(select 1 from queer_villages where id=p_id) then
    perform 1 from queer_villages where id=p_id for update;
  else raise exception 'Only cities and queer villages can be reparented here'; end if;
  select * into strict g from geo_places where id=p_id for update;
  select * into strict par from geo_places where id=p_new_parent_id;
  if p_expected_updated_at is null or g.updated_at is distinct from p_expected_updated_at then
    raise exception 'This record changed. Reload before moving it' using errcode='40001';
  end if;
  if par.duplicate_of_id is not null then raise exception 'Choose the surviving parent record'; end if;
  if (g.place_type='city' and par.place_type<>'country') or (g.place_type='village' and par.place_type<>'city') then
    raise exception 'Invalid parent type';
  end if;
  select code into v_code from countries where id=par.country_id;
  if g.latitude is not null and g.longitude is not null then
    select iso_a2,match_kind into v_iso,v_kind from geo_country_at(g.latitude,g.longitude);
    if v_kind='contains' and v_iso is distinct from v_code then
      raise exception 'Coordinates conflict with the proposed country. Correct the pin or review geographic evidence first';
    end if;
  end if;
  if g.place_type='city' then
    update cities set country_id=par.id,updated_at=now() where id=p_id;
  else
    update queer_villages set city_id=par.id,country_id=par.country_id,updated_at=now() where id=p_id;
  end if;
  return jsonb_build_object('moved',p_id,'type',g.place_type,'new_parent',par.id);
end $$;
revoke all on function public.geo_cms_move(uuid,uuid,timestamptz) from public,anon;
grant execute on function public.geo_cms_move(uuid,uuid,timestamptz) to authenticated,service_role;

-- Parent validation is enforced for ordinary CMS writes too, not only tree moves.
create or replace function public.geo_cms_guard_parent()
returns trigger language plpgsql set search_path=public,extensions,pg_temp as $$
declare v_country uuid; v_code text; v_iso text; v_kind text;
begin
  if tg_table_name='cities' then
    if new.country_id is not distinct from old.country_id then return new; end if;
    select id,code into v_country,v_code from countries where id=new.country_id and duplicate_of_id is null for share;
    if v_country is null then raise exception 'Choose an existing, unmerged country'; end if;
  else
    if new.city_id is not distinct from old.city_id then return new; end if;
    select c.country_id,co.code into v_country,v_code from cities c join countries co on co.id=c.country_id where c.id=new.city_id and c.duplicate_of_id is null for share of c;
    if v_country is null then raise exception 'Choose an existing, unmerged city with a country'; end if;
    new.country_id:=v_country;
  end if;
  if new.latitude is not null and new.longitude is not null then
    select iso_a2,match_kind into v_iso,v_kind from geo_country_at(new.latitude::numeric,new.longitude::numeric);
    if v_kind='contains' and v_iso is distinct from v_code then
      raise exception 'Coordinates conflict with the proposed country. Review geographic evidence first';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.geo_cms_guard_parent() from public,anon,authenticated;
create trigger geo_cms_city_parent_guard before update of country_id on public.cities
for each row execute function public.geo_cms_guard_parent();
create trigger geo_cms_village_parent_guard before update of city_id on public.queer_villages
for each row execute function public.geo_cms_guard_parent();
