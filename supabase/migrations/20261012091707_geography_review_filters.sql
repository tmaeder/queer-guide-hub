create or replace function public.geo_cms_browse(p_parent_id uuid default null,p_search text default '',p_type text default null,p_offset int default 0,p_continent_id uuid default null,p_region_id uuid default null,p_status text default null)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_rows jsonb; v_total bigint;
begin
  perform public.geo_cms_assert_reader();
  if p_type is not null and p_type not in ('country','city','village') then raise exception 'Invalid geography type'; end if;
  with matches as (
    select g.id,g.name from geo_places g join countries co on co.id=g.country_id left join geo_cms_verifications vf on vf.place_id=g.id
    where g.place_type in ('country','city','village') and g.duplicate_of_id is null
      and (p_type is null or g.place_type=p_type) and (p_status is null or coalesce(vf.status,'missing')=p_status)
      and (p_continent_id is null or co.continent_id=p_continent_id)
      and (p_region_id is null or co.region_id=p_region_id)
      and (case when nullif(btrim(p_search),'') is not null then g.name ilike '%'||btrim(p_search)||'%' or co.name ilike '%'||btrim(p_search)||'%' or exists(select 1 from cities ci where ci.id=g.city_id and ci.name ilike '%'||btrim(p_search)||'%')
        when p_type is not null or p_status is not null then true when p_parent_id is null then g.place_type='country' else g.parent_id=p_parent_id end)
  ), page as (select * from matches order by name,id offset greatest(p_offset,0) limit 50)
  select (select count(*) from matches),coalesce((select jsonb_agg(public.geo_cms_list_record(id) order by name,id) from page),'[]'::jsonb)
  into v_total,v_rows;
  return jsonb_build_object('rows',v_rows,'total',v_total);
end $$;
revoke all on function public.geo_cms_browse(uuid,text,text,int,uuid,uuid,text) from public,anon;
grant execute on function public.geo_cms_browse(uuid,text,text,int,uuid,uuid,text) to authenticated,service_role;


