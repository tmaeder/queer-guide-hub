create or replace function public.geo_cms_assert_reader()
returns void language plpgsql stable set search_path=public,pg_temp as $$
begin
  if nullif(current_setting('request.jwt.claims',true),'') is null
    or (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role')='service_role'
    or public.has_any_role_jwt(array['admin','moderator','editor']::public.app_role[]) then return; end if;
  raise exception 'unauthorized' using errcode='42501';
end $$;
revoke all on function public.geo_cms_assert_reader() from public,anon;
grant execute on function public.geo_cms_assert_reader() to authenticated,service_role;
-- List rows avoid counting linked content across every country on each page.
create or replace function public.geo_cms_list_record(p_id uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
select jsonb_build_object(
'id',g.id,'place_type',g.place_type,'name',g.name,'slug',g.slug,'parent_id',g.parent_id,
'country_id',g.country_id,'city_id',g.city_id,'latitude',g.latitude,'longitude',g.longitude,
'updated_at',g.updated_at,'safety_gated',g.safety_gated,'duplicate_of_id',g.duplicate_of_id,
'child_count',(select count(*) from geo_places ch where ch.parent_id=g.id and ch.place_type in ('city','village') and ch.duplicate_of_id is null),
'venue_count',0,'event_count',0,'hotel_count',0,
'path',concat_ws(' > ',case when g.place_type<>'country' then co.name end,case when g.place_type='village' then ci.name end,g.name),
'country_name',co.name,'country_code',co.code,'city_name',ci.name,
'source_table',case g.place_type when 'country' then 'countries' when 'city' then 'cities' when 'village' then 'queer_villages' end,
'verification_status',coalesce(vf.status,'missing'),'verification',to_jsonb(vf),
'workflow_state',cm.workflow_state,'seo_indexable',g.seo_indexable)
from geo_places g left join countries co on co.id=g.country_id left join cities ci on ci.id=g.city_id
left join geo_cms_verifications vf on vf.place_id=g.id
left join cms_content_metadata cm on cm.source_id=g.id and cm.source_table=case g.place_type when 'country' then 'countries' when 'city' then 'cities' when 'village' then 'queer_villages' end
where g.id=p_id and g.place_type in ('country','city','village');
$$;
revoke all on function public.geo_cms_list_record(uuid) from public,anon,authenticated;
grant execute on function public.geo_cms_list_record(uuid) to service_role;

create or replace function public.geo_cms_record(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_result jsonb;
begin
  perform public.geo_cms_assert_reader();
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
  perform public.geo_cms_assert_reader();
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
  select (select count(*) from matches),coalesce((select jsonb_agg(public.geo_cms_list_record(id) order by name,id) from page),'[]'::jsonb)
  into v_total,v_rows;
  return jsonb_build_object('rows',v_rows,'total',v_total);
end $$;
revoke all on function public.geo_cms_rows(uuid,text,text,int,uuid,uuid) from public,anon;
grant execute on function public.geo_cms_rows(uuid,text,text,int,uuid,uuid) to authenticated,service_role;


-- External audits carry stable identity, coordinates and cited parent evidence.
-- An audit may never be applied to a record changed since the audit began.
create or replace function public.geo_cms_record_evidence(p_id uuid,p_fingerprint text,p_checks jsonb,p_sources jsonb)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare g public.geo_places; v_status text;
begin
  perform public.assert_admin_or_internal();
  select * into strict g from geo_places where id=p_id for update;
  if p_fingerprint is distinct from public.geo_cms_fingerprint(p_id) then
    raise exception 'Geography changed during verification. Check the current record again' using errcode='40001';
  end if;
  if jsonb_typeof(p_checks)<>'object' or jsonb_typeof(p_sources)<>'array' or jsonb_array_length(p_sources)=0 then
    raise exception 'Verification requires structured checks and cited sources';
  end if;
  if exists(select 1 from jsonb_array_elements(p_sources) s where coalesce(s->>'url','') !~ '^https://') then
    raise exception 'Verification sources must have HTTPS URLs';
  end if;
  v_status:=case when p_checks->>'country_match'='true' and p_checks->>'identity_verified'='true'
    and p_checks->>'coordinates_verified'='true' and (g.place_type='country' or p_checks->>'parent_verified'='true')
    and (g.place_type<>'village' or p_checks->>'queer_designation_verified'='true') then 'verified' else 'review' end;
  insert into geo_cms_verifications(place_id,status,fingerprint,checks,sources)
  values(p_id,v_status,p_fingerprint,p_checks,p_sources)
  on conflict(place_id) do update set status=excluded.status,checked_at=now(),fingerprint=excluded.fingerprint,checks=excluded.checks,sources=excluded.sources;
end $$;
revoke all on function public.geo_cms_record_evidence(uuid,text,jsonb,jsonb) from public,anon;
grant execute on function public.geo_cms_record_evidence(uuid,text,jsonb,jsonb) to authenticated,service_role;
