-- Evidence is readable by editorial staff; only guarded RPCs may write it.
revoke all on public.geo_cms_verifications from anon,authenticated;
grant select on public.geo_cms_verifications to authenticated;
create or replace function public.geo_cms_list_record(p_id uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
select jsonb_build_object(
'id',g.id,'place_type',g.place_type,'name',g.name,'slug',g.slug,'parent_id',g.parent_id,
'country_id',g.country_id,'city_id',g.city_id,'latitude',g.latitude,'longitude',g.longitude,
'updated_at',g.updated_at,'safety_gated',g.safety_gated,'duplicate_of_id',g.duplicate_of_id,
'child_count',(select count(*) from geo_places ch where ch.parent_id=g.id and ch.place_type in ('city','village') and ch.duplicate_of_id is null),
'venue_count',0,'event_count',0,'hotel_count',0,
'path',concat_ws(' > ',case when g.place_type<>'country' then co.name end,case when g.place_type='village' then concat_ws(' ',ci.name,ci.region_code) end,concat_ws(' ',g.name,case when g.place_type='city' then ci.region_code end)),
'country_name',co.name,'country_code',co.code,'city_name',ci.name,'region_code',ci.region_code,'region_name',ci.region_name,
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
    'path',concat_ws(' > ',case when g.place_type<>'country' then co.name end,case when g.place_type='village' then concat_ws(' ',ci.name,ci.region_code) end,concat_ws(' ',g.name,case when g.place_type='city' then ci.region_code end)),
    'country_name',co.name,'country_code',co.code,'city_name',ci.name,'region_code',ci.region_code,'region_name',ci.region_name,
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

