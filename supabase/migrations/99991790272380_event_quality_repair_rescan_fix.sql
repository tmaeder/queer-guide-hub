-- Ensure deterministic event repairs are visible to the incremental scanner.
-- The original repair runner changed event fields without advancing updated_at,
-- leaving resolved findings open until an unrelated event edit occurred.

begin;
create or replace function public.run_event_quality_repairs(
  p_batch integer default 100, p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare r record; v_candidates int:=0; v_changed int:=0; v_update jsonb;
begin
  perform public.assert_admin_or_internal();
  if not pg_try_advisory_xact_lock(hashtext('event_quality_repairs')) then
    return jsonb_build_object('dry_run',p_dry_run,'skipped','already_running');
  end if;
  for r in select distinct e.* from public.events e join public.event_quality_issues i on i.event_id=e.id
    where i.status='open' and i.issue_code in ('GEO_NULL_ISLAND','WEBSITE_INVALID','TICKET_URL_INVALID','IMAGE_PLACEHOLDER','IMAGE_URL_INVALID','VENUE_CITY_CONFLICT')
    order by e.updated_at,e.id limit greatest(0,least(p_batch,500))
  loop
    v_candidates:=v_candidates+1; v_update:='{}'::jsonb;
    if r.latitude=0 and r.longitude=0 then v_update:=v_update||jsonb_build_object('latitude',null,'longitude',null); end if;
    if r.website is not null and not public.event_quality_url_is_safe(r.website) then v_update:=v_update||jsonb_build_object('website',null); end if;
    if r.ticket_url is not null and not public.event_quality_url_is_safe(r.ticket_url) then v_update:=v_update||jsonb_build_object('ticket_url',null); end if;
    if exists(select 1 from public.venues v where v.id=r.venue_id and r.city_id is not null and v.city_id is not null and r.city_id<>v.city_id) then v_update:=v_update||jsonb_build_object('venue_id',null); end if;
    if exists(select 1 from unnest(coalesce(r.images,'{}'::text[])) u where lower(u)~'(default[_-]?event|placeholder|no[_-]?image|missing[_-]?image)' or not public.event_quality_url_is_safe(u)) then
      v_update:=v_update||jsonb_build_object('images',to_jsonb(array(select u from unnest(coalesce(r.images,'{}'::text[])) u where lower(u)!~'(default[_-]?event|placeholder|no[_-]?image|missing[_-]?image)' and public.event_quality_url_is_safe(u))));
    end if;
    if v_update<>'{}'::jsonb and not p_dry_run then
      update public.events set latitude=case when v_update?'latitude' then null else latitude end,
        longitude=case when v_update?'longitude' then null else longitude end,
        website=case when v_update?'website' then null else website end,
        ticket_url=case when v_update?'ticket_url' then null else ticket_url end,
        venue_id=case when v_update?'venue_id' then null else venue_id end,
        images=case when v_update?'images' then array(select jsonb_array_elements_text(v_update->'images')) else images end,
        updated_at=now(),
        field_provenance=jsonb_set(coalesce(field_provenance,'{}'::jsonb),'{quality_repairs}',
          jsonb_build_object('at',now(),'changes',v_update,'previous',jsonb_build_object(
            'latitude',r.latitude,'longitude',r.longitude,'website',r.website,'ticket_url',r.ticket_url,
            'venue_id',r.venue_id,'images',r.images)),true)
      where id=r.id;
      v_changed:=v_changed+1;
    end if;
  end loop;
  return jsonb_build_object('dry_run',p_dry_run,'candidates',v_candidates,'changed',v_changed);
end;
$$;
revoke all on function public.run_event_quality_repairs(integer,boolean) from public,anon,authenticated;
grant execute on function public.run_event_quality_repairs(integer,boolean) to authenticated,service_role;
-- Requeue any deterministic repairs performed before this correction landed.
update public.events e
set updated_at=now()
where exists (
  select 1 from public.event_quality_issues i
  where i.event_id=e.id and i.status='open'
    and i.issue_code in ('GEO_NULL_ISLAND','WEBSITE_INVALID','TICKET_URL_INVALID','IMAGE_PLACEHOLDER','IMAGE_URL_INVALID','VENUE_CITY_CONFLICT')
);
commit;
